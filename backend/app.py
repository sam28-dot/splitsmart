"""
SplitSmart — Flask REST API
===========================
All routes: /api/v1/...
Auth: JWT (Bearer token, 7-day expiry)
OTP: Gmail SMTP (free), 6-digit, 10-min expiry, bcrypt-hashed in DB
"""

from flask import Flask, request, jsonify, g, send_file
from flask_cors import CORS
import jwt, bcrypt, os, json, secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

from models.schema import init_db, get_db, log_activity
from core.debt_simplifier import compute_group_balances, calculate_splits
from core.email_service import send_otp, verify_otp_hash

import os
from flask import Flask, send_from_directory

# 1. Point Flask to the React build folder
# If your folder is named 'build' instead of 'dist', change it below
app = Flask(__name__, 
            static_folder='../frontend/dist', 
            static_url_path='/')

# 2. Serve React's index.html for the home page
@app.route("/")
def serve():
    return send_from_directory(app.static_folder, 'index.html')

# 3. Add this so page refreshes don't give a 404 error
@app.errorhandler(404)
def not_found(e):
    return send_from_directory(app.static_folder, 'index.html')

# 4. Your health check for Render
@app.route('/api/v1/health')
def health():
    return {"status": "ok", "mode": "sqlite"}, 200

# Init DB at module level — runs under both gunicorn and python app.py
init_db()

SECRET_KEY = os.environ.get("JWT_SECRET", "CHANGE-THIS-IN-PRODUCTION-USE-LONG-RANDOM-STRING")
TOKEN_DAYS  = 7


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_token(user_id, username):
    return jwt.encode(
        {"user_id": user_id, "username": username,
         "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS)},
        SECRET_KEY, algorithm="HS256"
    )

def err(msg, code="ERROR", status=400):
    return jsonify({"error": msg, "code": code}), status

def require_auth(f):
    @wraps(f)
    def dec(*a, **kw):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return err("Missing token", "AUTH_REQUIRED", 401)
        try:
            p = jwt.decode(header[7:], SECRET_KEY, algorithms=["HS256"])
            g.user_id  = p["user_id"]
            g.username = p["username"]
        except jwt.ExpiredSignatureError:
            return err("Token expired", "TOKEN_EXPIRED", 401)
        except jwt.InvalidTokenError:
            return err("Invalid token", "TOKEN_INVALID", 401)
        return f(*a, **kw)
    return dec

def require_member(f):
    @wraps(f)
    def dec(*a, **kw):
        gid = kw.get("group_id")
        if gid:
            with get_db() as conn:
                row = conn.execute(
                    "SELECT id FROM group_members WHERE group_id=? AND user_id=?",
                    (gid, g.user_id)
                ).fetchone()
                if not row:
                    return err("Not a group member", "FORBIDDEN", 403)
        return f(*a, **kw)
    return dec


# ── AUTH ─────────────────────────────────────────────────────────────────────

@app.post("/api/v1/auth/register")
def register():
    d = request.get_json(force=True)
    email    = (d.get("email") or "").strip().lower()
    username = (d.get("username") or "").strip()
    password = d.get("password") or ""

    if not email or "@" not in email:  return err("Valid email required")
    if len(username) < 2:              return err("Name must be ≥ 2 characters")
    if len(password) < 6:              return err("Password must be ≥ 6 characters")

    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    colors  = ["#16a34a","#2563eb","#7c3aed","#dc2626","#d97706","#0891b2","#db2777"]
    import random; color = colors[hash(email) % len(colors)]

    with get_db() as conn:
        existing = conn.execute("SELECT id, is_verified FROM users WHERE email=?", (email,)).fetchone()
        if existing and existing["is_verified"]:
            return err("Email already registered", "EMAIL_EXISTS", 409)
        if existing:
            # Re-send OTP to unverified account
            conn.execute("UPDATE users SET password_hash=?, username=?, avatar_color=? WHERE email=?",
                         (pw_hash, username, color, email))
            user_id = existing["id"]
        else:
            cur = conn.execute(
                "INSERT INTO users (email, username, password_hash, avatar_color, is_verified) VALUES (?,?,?,?,0)",
                (email, username, pw_hash, color)
            )
            user_id = cur.lastrowid

        # Invalidate old OTPs
        conn.execute("UPDATE otp_tokens SET used=1 WHERE email=? AND purpose='verify'", (email,))

        otp_hash, expires = send_otp(email, "verify", username)
        conn.execute(
            "INSERT INTO otp_tokens (email, otp_hash, purpose, expires_at) VALUES (?,?,?,?)",
            (email, otp_hash, "verify", expires)
        )

    return jsonify({"message": "OTP sent to your email", "email": email, "user_id": user_id}), 201


@app.post("/api/v1/auth/verify-otp")
def verify_otp_route():
    d       = request.get_json(force=True)
    email   = (d.get("email") or "").strip().lower()
    otp     = (d.get("otp") or "").strip()
    purpose = d.get("purpose", "verify")

    if not email or not otp:
        return err("Email and OTP required")

    with get_db() as conn:
        # Get latest unused OTP for this email+purpose
        token = conn.execute(
            """SELECT * FROM otp_tokens
               WHERE email=? AND purpose=? AND used=0
               ORDER BY created_at DESC LIMIT 1""",
            (email, purpose)
        ).fetchone()

        if not token:
            return err("No OTP found. Request a new one.", "OTP_NOT_FOUND", 404)

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        if token["expires_at"] < now:
            return err("OTP expired. Request a new one.", "OTP_EXPIRED", 410)

        if token["attempts"] >= 5:
            return err("Too many attempts. Request a new OTP.", "OTP_LOCKED", 429)

        conn.execute("UPDATE otp_tokens SET attempts=attempts+1 WHERE id=?", (token["id"],))

        if not verify_otp_hash(otp, token["otp_hash"]):
            remaining = 4 - token["attempts"]
            return err(f"Incorrect OTP. {remaining} attempt(s) left.", "OTP_WRONG", 400)

        # Mark used
        conn.execute("UPDATE otp_tokens SET used=1 WHERE id=?", (token["id"],))

        if purpose == "verify":
            conn.execute("UPDATE users SET is_verified=1 WHERE email=?", (email,))

        user = conn.execute(
            "SELECT id, email, username, avatar_color FROM users WHERE email=?", (email,)
        ).fetchone()

        if not user:
            return err("User not found", status=404)

        token_str = make_token(user["id"], user["username"])
        return jsonify({
            "token": token_str,
            "user": {
                "id":           user["id"],
                "email":        user["email"],
                "username":     user["username"],
                "avatar_color": user["avatar_color"],
            }
        })


@app.post("/api/v1/auth/login")
def login():
    d        = request.get_json(force=True)
    email    = (d.get("email") or "").strip().lower()
    password = d.get("password") or ""

    with get_db() as conn:
        user = conn.execute(
            "SELECT id, username, password_hash, avatar_color, is_verified FROM users WHERE email=?",
            (email,)
        ).fetchone()

    if not user or not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        return err("Invalid email or password", "INVALID_CREDENTIALS", 401)

    if not user["is_verified"]:
        return err("Email not verified. Complete registration first.", "NOT_VERIFIED", 403)

    # Send login OTP
    with get_db() as conn:
        conn.execute("UPDATE otp_tokens SET used=1 WHERE email=? AND purpose='login'", (email,))
        otp_hash, expires = send_otp(email, "login", user["username"])
        conn.execute(
            "INSERT INTO otp_tokens (email, otp_hash, purpose, expires_at) VALUES (?,?,?,?)",
            (email, otp_hash, "login", expires)
        )

    return jsonify({"message": "OTP sent to your email", "email": email})


@app.post("/api/v1/auth/resend-otp")
def resend_otp():
    d       = request.get_json(force=True)
    email   = (d.get("email") or "").strip().lower()
    purpose = d.get("purpose", "verify")

    with get_db() as conn:
        user = conn.execute("SELECT id, username FROM users WHERE email=?", (email,)).fetchone()
        if not user:
            return err("User not found", status=404)
        conn.execute("UPDATE otp_tokens SET used=1 WHERE email=? AND purpose=?", (email, purpose))
        otp_hash, expires = send_otp(email, purpose, user["username"])
        conn.execute(
            "INSERT INTO otp_tokens (email, otp_hash, purpose, expires_at) VALUES (?,?,?,?)",
            (email, otp_hash, purpose, expires)
        )
    return jsonify({"message": "New OTP sent"})


@app.get("/api/v1/auth/me")
@require_auth
def me():
    with get_db() as conn:
        user = conn.execute(
            "SELECT id, email, username, avatar_color, created_at FROM users WHERE id=?",
            (g.user_id,)
        ).fetchone()
    return jsonify(dict(user)) if user else err("Not found", status=404)


# ── GROUPS ───────────────────────────────────────────────────────────────────

@app.get("/api/v1/groups")
@require_auth
def list_groups():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT g.id, g.name, g.description, g.emoji, g.created_at,
                   COUNT(DISTINCT gm2.user_id) as member_count,
                   COALESCE(SUM(CASE WHEN e.deleted_at IS NULL THEN e.amount ELSE 0 END),0) as total_spend
            FROM groups g
            JOIN group_members gm  ON gm.group_id=g.id AND gm.user_id=?
            LEFT JOIN group_members gm2 ON gm2.group_id=g.id
            LEFT JOIN expenses e   ON e.group_id=g.id
            GROUP BY g.id ORDER BY g.created_at DESC
        """, (g.user_id,)).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/v1/groups")
@require_auth
def create_group():
    d    = request.get_json(force=True)
    name = (d.get("name") or "").strip()
    desc = (d.get("description") or "").strip()
    emoji = d.get("emoji", "💰")
    if len(name) < 2:
        return err("Group name must be ≥ 2 characters")
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO groups (name, description, emoji, created_by) VALUES (?,?,?,?)",
            (name, desc, emoji, g.user_id)
        )
        gid = cur.lastrowid
        conn.execute("INSERT INTO group_members (group_id, user_id, role) VALUES (?,?,?)",
                     (gid, g.user_id, "admin"))
        log_activity(conn, gid, g.user_id, "group_created", gid, {"name": name})
    return jsonify({"id": gid, "name": name, "emoji": emoji}), 201


@app.get("/api/v1/groups/<int:group_id>")
@require_auth
@require_member
def get_group(group_id):
    with get_db() as conn:
        group = conn.execute(
            "SELECT id,name,description,emoji,created_by,created_at FROM groups WHERE id=?",
            (group_id,)
        ).fetchone()
        if not group: return err("Not found", status=404)
        members = conn.execute("""
            SELECT u.id as user_id, u.username as name, u.email, u.avatar_color, gm.role, gm.joined_at
            FROM group_members gm JOIN users u ON u.id=gm.user_id
            WHERE gm.group_id=? ORDER BY gm.joined_at
        """, (group_id,)).fetchall()
    return jsonify({**dict(group), "members": [dict(m) for m in members]})


@app.delete("/api/v1/groups/<int:group_id>")
@require_auth
@require_member
def delete_group(group_id):
    with get_db() as conn:
        grp = conn.execute("SELECT created_by FROM groups WHERE id=?", (group_id,)).fetchone()
        if not grp or grp["created_by"] != g.user_id:
            return err("Only admin can delete group", "FORBIDDEN", 403)
        conn.execute("DELETE FROM groups WHERE id=?", (group_id,))
    return jsonify({"message": "Group deleted"})


@app.post("/api/v1/groups/<int:group_id>/members")
@require_auth
@require_member
def add_member(group_id):
    d     = request.get_json(force=True)
    email = (d.get("email") or "").strip().lower()
    with get_db() as conn:
        user = conn.execute("SELECT id, username FROM users WHERE email=? AND is_verified=1", (email,)).fetchone()
        if not user: return err("No verified user with that email", "NOT_FOUND", 404)
        if conn.execute("SELECT id FROM group_members WHERE group_id=? AND user_id=?",
                        (group_id, user["id"])).fetchone():
            return err("User already in group", "ALREADY_MEMBER", 409)
        conn.execute("INSERT INTO group_members (group_id, user_id) VALUES (?,?)",
                     (group_id, user["id"]))
        log_activity(conn, group_id, g.user_id, "member_added", user["id"],
                     {"username": user["username"]})
    return jsonify({"message": f"{user['username']} added"}), 201


@app.delete("/api/v1/groups/<int:group_id>/members/<int:user_id>")
@require_auth
@require_member
def remove_member(group_id, user_id):
    with get_db() as conn:
        result = _balances(conn, group_id, user_id)
        if abs(result["user_balances"].get(user_id, {}).get("net_balance", 0)) > 0.01:
            return err("Settle balance first before removing", "PENDING_BALANCE", 409)
        conn.execute("DELETE FROM group_members WHERE group_id=? AND user_id=?", (group_id, user_id))
    return jsonify({"message": "Removed"})


# ── INVITE LINKS ─────────────────────────────────────────────────────────────

@app.post("/api/v1/groups/<int:group_id>/invite")
@require_auth
@require_member
def create_invite(group_id):
    token = secrets.token_urlsafe(20)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO invite_links (group_id, token, created_by) VALUES (?,?,?)",
            (group_id, token, g.user_id)
        )
    base_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    return jsonify({"invite_url": f"{base_url}/join/{token}", "token": token}), 201


@app.get("/api/v1/invite/<token>")
@require_auth
def join_via_invite(token):
    with get_db() as conn:
        link = conn.execute(
            "SELECT * FROM invite_links WHERE token=?", (token,)
        ).fetchone()
        if not link:
            return err("Invalid invite link", "INVALID_INVITE", 404)
        if link["expires_at"] and link["expires_at"] < datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"):
            return err("Invite link expired", "EXPIRED", 410)
        if conn.execute("SELECT id FROM group_members WHERE group_id=? AND user_id=?",
                        (link["group_id"], g.user_id)).fetchone():
            return err("Already a member", "ALREADY_MEMBER", 409)
        conn.execute("INSERT INTO group_members (group_id, user_id) VALUES (?,?)",
                     (link["group_id"], g.user_id))
        conn.execute("UPDATE invite_links SET uses=uses+1 WHERE token=?", (token,))
        grp = conn.execute("SELECT name FROM groups WHERE id=?", (link["group_id"],)).fetchone()
        log_activity(conn, link["group_id"], g.user_id, "member_added", g.user_id,
                     {"via": "invite_link"})
    return jsonify({"group_id": link["group_id"], "group_name": grp["name"]})


# ── EXPENSES ─────────────────────────────────────────────────────────────────

@app.get("/api/v1/groups/<int:group_id>/expenses")
@require_auth
@require_member
def list_expenses(group_id):
    limit  = min(int(request.args.get("limit", 100)), 200)
    offset = int(request.args.get("offset", 0))
    with get_db() as conn:
        exps = conn.execute("""
            SELECT e.id, e.description, e.amount, e.split_type, e.category,
                   e.date, e.created_at, e.paid_by_user_id,
                   u.username as paid_by_name, u.avatar_color
            FROM expenses e JOIN users u ON u.id=e.paid_by_user_id
            WHERE e.group_id=? AND e.deleted_at IS NULL
            ORDER BY e.date DESC, e.created_at DESC
            LIMIT ? OFFSET ?
        """, (group_id, limit, offset)).fetchall()

        eids = [e["id"] for e in exps]
        splits = []
        if eids:
            ph = ",".join("?"*len(eids))
            splits = conn.execute(
                f"SELECT es.expense_id, es.user_id, es.amount, u.username "
                f"FROM expense_splits es JOIN users u ON u.id=es.user_id "
                f"WHERE es.expense_id IN ({ph})", eids
            ).fetchall()

        comment_counts = {}
        if eids:
            rows = conn.execute(
                f"SELECT expense_id, COUNT(*) as c FROM expense_comments WHERE expense_id IN ({ph}) GROUP BY expense_id",
                eids
            ).fetchall()
            comment_counts = {r["expense_id"]: r["c"] for r in rows}

    sm = {}
    for s in splits:
        sm.setdefault(s["expense_id"], []).append(
            {"user_id": s["user_id"], "username": s["username"], "amount": s["amount"]}
        )
    result = []
    for e in exps:
        row = dict(e)
        row["splits"]        = sm.get(e["id"], [])
        row["comment_count"] = comment_counts.get(e["id"], 0)
        result.append(row)
    return jsonify(result)


@app.post("/api/v1/groups/<int:group_id>/expenses")
@require_auth
@require_member
def create_expense(group_id):
    d           = request.get_json(force=True)
    description = (d.get("description") or "").strip()
    amount      = d.get("amount")
    split_type  = d.get("split_type", "equal")
    participants= d.get("participants", [])
    paid_by     = d.get("paid_by_user_id", g.user_id)
    category    = d.get("category", "general")
    date        = d.get("date") or datetime.now().strftime("%Y-%m-%d")

    if not description:                     return err("Description required")
    if not amount or float(amount) <= 0:    return err("Amount must be positive")
    if not participants:                    return err("At least one participant required")
    if split_type not in ("equal","exact","percentage"): return err("Invalid split_type")

    try:
        splits = calculate_splits(float(amount), split_type, participants)
    except ValueError as e:
        return err(str(e), "SPLIT_ERROR")

    with get_db() as conn:
        member_ids = {r["user_id"] for r in conn.execute(
            "SELECT user_id FROM group_members WHERE group_id=?", (group_id,)
        ).fetchall()}
        if not {p["user_id"] for p in participants}.issubset(member_ids):
            return err("Some participants are not group members")

        cur = conn.execute(
            "INSERT INTO expenses (group_id,paid_by_user_id,description,amount,split_type,category,date) VALUES (?,?,?,?,?,?,?)",
            (group_id, paid_by, description, float(amount), split_type, category, date)
        )
        eid = cur.lastrowid
        conn.executemany(
            "INSERT INTO expense_splits (expense_id,user_id,amount) VALUES (?,?,?)",
            [(eid, s["user_id"], s["amount"]) for s in splits]
        )
        payer_name = conn.execute("SELECT username FROM users WHERE id=?", (paid_by,)).fetchone()["username"]
        log_activity(conn, group_id, g.user_id, "expense_added", eid,
                     {"description": description, "amount": float(amount), "payer": payer_name})
    return jsonify({"id": eid, "splits": splits}), 201


@app.put("/api/v1/groups/<int:group_id>/expenses/<int:expense_id>")
@require_auth
@require_member
def update_expense(group_id, expense_id):
    with get_db() as conn:
        exp = conn.execute(
            "SELECT * FROM expenses WHERE id=? AND group_id=? AND deleted_at IS NULL",
            (expense_id, group_id)
        ).fetchone()
        if not exp: return err("Not found", status=404)

        d           = request.get_json(force=True)
        description = d.get("description", exp["description"])
        amount      = float(d.get("amount", exp["amount"]))
        split_type  = d.get("split_type", exp["split_type"])
        category    = d.get("category", exp["category"])
        date        = d.get("date", exp["date"])
        participants= d.get("participants")

        if participants:
            try:
                splits = calculate_splits(amount, split_type, participants)
            except ValueError as e:
                return err(str(e), "SPLIT_ERROR")
            conn.execute("DELETE FROM expense_splits WHERE expense_id=?", (expense_id,))
            conn.executemany(
                "INSERT INTO expense_splits (expense_id,user_id,amount) VALUES (?,?,?)",
                [(expense_id, s["user_id"], s["amount"]) for s in splits]
            )
        conn.execute(
            "UPDATE expenses SET description=?,amount=?,split_type=?,category=?,date=?,updated_at=datetime('now') WHERE id=?",
            (description, amount, split_type, category, date, expense_id)
        )
        log_activity(conn, group_id, g.user_id, "expense_edited", expense_id,
                     {"description": description})
    return jsonify({"message": "Updated"})


@app.delete("/api/v1/groups/<int:group_id>/expenses/<int:expense_id>")
@require_auth
@require_member
def delete_expense(group_id, expense_id):
    with get_db() as conn:
        exp = conn.execute(
            "SELECT description FROM expenses WHERE id=? AND group_id=? AND deleted_at IS NULL",
            (expense_id, group_id)
        ).fetchone()
        if not exp: return err("Not found", status=404)
        conn.execute("UPDATE expenses SET deleted_at=datetime('now') WHERE id=?", (expense_id,))
        log_activity(conn, group_id, g.user_id, "expense_deleted", expense_id,
                     {"description": exp["description"]})
    return jsonify({"message": "Deleted"})


# ── COMMENTS ─────────────────────────────────────────────────────────────────

@app.get("/api/v1/groups/<int:group_id>/expenses/<int:expense_id>/comments")
@require_auth
@require_member
def get_comments(group_id, expense_id):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT c.id, c.body, c.created_at, u.username, u.avatar_color
            FROM expense_comments c JOIN users u ON u.id=c.user_id
            WHERE c.expense_id=? ORDER BY c.created_at
        """, (expense_id,)).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/v1/groups/<int:group_id>/expenses/<int:expense_id>/comments")
@require_auth
@require_member
def add_comment(group_id, expense_id):
    d    = request.get_json(force=True)
    body = (d.get("body") or "").strip()
    if not body: return err("Comment body required")
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO expense_comments (expense_id, user_id, body) VALUES (?,?,?)",
            (expense_id, g.user_id, body)
        )
    return jsonify({"id": cur.lastrowid, "body": body}), 201


# ── BALANCES ─────────────────────────────────────────────────────────────────

def _balances(conn, group_id, current_user_id):
    members  = conn.execute("""
        SELECT u.id as user_id, u.username as name
        FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=?
    """, (group_id,)).fetchall()
    expenses = conn.execute(
        "SELECT id, paid_by_user_id, amount FROM expenses WHERE group_id=? AND deleted_at IS NULL",
        (group_id,)
    ).fetchall()
    splits = conn.execute("""
        SELECT es.expense_id, es.user_id, es.amount
        FROM expense_splits es JOIN expenses e ON e.id=es.expense_id
        WHERE e.group_id=? AND e.deleted_at IS NULL
    """, (group_id,)).fetchall()
    payments = conn.execute(
        "SELECT from_user_id, to_user_id, amount FROM settlements WHERE group_id=?",
        (group_id,)
    ).fetchall()
    return compute_group_balances(
        [dict(m) for m in members],
        [dict(e) for e in expenses],
        [dict(s) for s in splits],
        [dict(p) for p in payments],
        current_user_id,
    )


@app.get("/api/v1/groups/<int:group_id>/balances")
@require_auth
@require_member
def get_balances(group_id):
    with get_db() as conn:
        result = _balances(conn, group_id, g.user_id)
    return jsonify(result)


@app.post("/api/v1/groups/<int:group_id>/settle")
@require_auth
@require_member
def record_settlement(group_id):
    d          = request.get_json(force=True)
    to_user_id = d.get("to_user_id")
    amount     = d.get("amount")
    note       = d.get("note", "")
    if not to_user_id or not amount or float(amount) <= 0:
        return err("to_user_id and positive amount required")
    with get_db() as conn:
        if not conn.execute("SELECT id FROM group_members WHERE group_id=? AND user_id=?",
                            (group_id, to_user_id)).fetchone():
            return err("Target not in group", status=404)
        conn.execute(
            "INSERT INTO settlements (group_id, from_user_id, to_user_id, amount, note) VALUES (?,?,?,?,?)",
            (group_id, g.user_id, to_user_id, float(amount), note)
        )
        payee = conn.execute("SELECT username FROM users WHERE id=?", (to_user_id,)).fetchone()
        log_activity(conn, group_id, g.user_id, "settled", to_user_id,
                     {"amount": float(amount), "to": payee["username"]})
    return jsonify({"message": "Settlement recorded"}), 201


@app.get("/api/v1/groups/<int:group_id>/settlements")
@require_auth
@require_member
def list_settlements(group_id):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT s.id, s.amount, s.note, s.created_at,
                   u1.username as from_name, u2.username as to_name,
                   s.from_user_id, s.to_user_id
            FROM settlements s
            JOIN users u1 ON u1.id=s.from_user_id
            JOIN users u2 ON u2.id=s.to_user_id
            WHERE s.group_id=? ORDER BY s.created_at DESC LIMIT 50
        """, (group_id,)).fetchall()
    return jsonify([dict(r) for r in rows])


# ── ANALYTICS ────────────────────────────────────────────────────────────────

@app.get("/api/v1/groups/<int:group_id>/analytics")
@require_auth
@require_member
def analytics(group_id):
    with get_db() as conn:
        # Spend by category
        by_cat = conn.execute("""
            SELECT category, SUM(amount) as total, COUNT(*) as count
            FROM expenses WHERE group_id=? AND deleted_at IS NULL
            GROUP BY category ORDER BY total DESC
        """, (group_id,)).fetchall()

        # Spend by member (who paid)
        by_member = conn.execute("""
            SELECT u.username, u.avatar_color, SUM(e.amount) as paid,
                   COUNT(e.id) as expense_count
            FROM expenses e JOIN users u ON u.id=e.paid_by_user_id
            WHERE e.group_id=? AND e.deleted_at IS NULL
            GROUP BY u.id ORDER BY paid DESC
        """, (group_id,)).fetchall()

        # Monthly trend (last 6 months)
        monthly = conn.execute("""
            SELECT strftime('%Y-%m', date) as month,
                   SUM(amount) as total, COUNT(*) as count
            FROM expenses WHERE group_id=? AND deleted_at IS NULL
              AND date >= date('now', '-6 months')
            GROUP BY month ORDER BY month
        """, (group_id,)).fetchall()

        # Biggest single expense
        biggest = conn.execute("""
            SELECT e.description, e.amount, u.username as paid_by, e.date
            FROM expenses e JOIN users u ON u.id=e.paid_by_user_id
            WHERE e.group_id=? AND e.deleted_at IS NULL
            ORDER BY e.amount DESC LIMIT 1
        """, (group_id,)).fetchone()

        # Fastest settler (most settlements recorded)
        leaderboard = conn.execute("""
            SELECT u.username, u.avatar_color,
                   COUNT(s.id) as settlements,
                   COALESCE(SUM(s.amount), 0) as total_settled
            FROM users u
            JOIN group_members gm ON gm.user_id=u.id AND gm.group_id=?
            LEFT JOIN settlements s ON s.from_user_id=u.id AND s.group_id=?
            GROUP BY u.id ORDER BY total_settled DESC
        """, (group_id, group_id)).fetchall()

    return jsonify({
        "by_category": [dict(r) for r in by_cat],
        "by_member":   [dict(r) for r in by_member],
        "monthly":     [dict(r) for r in monthly],
        "biggest":     dict(biggest) if biggest else None,
        "leaderboard": [dict(r) for r in leaderboard],
    })


# ── ACTIVITY FEED ────────────────────────────────────────────────────────────

@app.get("/api/v1/groups/<int:group_id>/activity")
@require_auth
@require_member
def get_activity(group_id):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT a.id, a.action, a.entity_id, a.meta, a.created_at,
                   u.username, u.avatar_color
            FROM activity_feed a LEFT JOIN users u ON u.id=a.user_id
            WHERE a.group_id=? ORDER BY a.created_at DESC LIMIT 30
        """, (group_id,)).fetchall()
    result = []
    for r in rows:
        row = dict(r)
        row["meta"] = json.loads(r["meta"]) if r["meta"] else {}
        result.append(row)
    return jsonify(result)


# ── PDF REPORT ───────────────────────────────────────────────────────────────

@app.get("/api/v1/groups/<int:group_id>/report")
@require_auth
@require_member
def report(group_id):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors as rlcolors
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        import io

        with get_db() as conn:
            grp      = conn.execute("SELECT name FROM groups WHERE id=?", (group_id,)).fetchone()
            balances = _balances(conn, group_id, g.user_id)
            expenses = conn.execute("""
                SELECT e.description, e.amount, e.date, e.category, u.username as paid_by
                FROM expenses e JOIN users u ON u.id=e.paid_by_user_id
                WHERE e.group_id=? AND e.deleted_at IS NULL ORDER BY e.date DESC
            """, (group_id,)).fetchall()

        buf  = io.BytesIO()
        doc  = SimpleDocTemplate(buf, pagesize=A4, topMargin=18*mm, bottomMargin=18*mm,
                                  leftMargin=18*mm, rightMargin=18*mm)
        S    = getSampleStyleSheet()
        DK   = rlcolors.HexColor("#052e16")
        GRN  = rlcolors.HexColor("#16a34a")
        LGRY = rlcolors.HexColor("#f8fafc")
        story = []

        story.append(Paragraph(f"Settlement Report — {grp['name']}", S["Title"]))
        story.append(Paragraph(f"Generated {datetime.now().strftime('%d %b %Y, %H:%M')}", S["Normal"]))
        story.append(Spacer(1, 8*mm))

        # Balance table
        story.append(Paragraph("Balance Summary", S["Heading2"]))
        bd = [["Member","Paid","Owes","Net"]]
        for uid, info in balances["user_balances"].items():
            net = info["net_balance"]
            bd.append([info["name"], f"₹{info['paid']:.2f}",
                       f"₹{info['owes']:.2f}", f"{'+'if net>=0 else ''}₹{net:.2f}"])
        bt = Table(bd, colWidths=[55*mm,35*mm,35*mm,40*mm])
        bt.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(-1,0),DK), ("TEXTCOLOR",(0,0),(-1,0),rlcolors.white),
            ("FONTSIZE",(0,0),(-1,-1),9), ("GRID",(0,0),(-1,-1),0.5,rlcolors.lightgrey),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[rlcolors.white,LGRY]),
        ]))
        story.append(bt); story.append(Spacer(1,6*mm))

        # Settlements
        if balances["transactions"]:
            story.append(Paragraph("Recommended Settlements", S["Heading2"]))
            for t in balances["transactions"]:
                story.append(Paragraph(
                    f"• <b>{t['from_name']}</b> → <b>{t['to_name']}</b>: ₹{t['amount']:.2f}", S["Normal"]
                ))
            story.append(Spacer(1,6*mm))

        # Expenses
        story.append(Paragraph("Expense History", S["Heading2"]))
        ed = [["Date","Description","Category","Paid By","Amount"]]
        for e in expenses:
            ed.append([e["date"], e["description"][:36], e["category"].title(), e["paid_by"], f"₹{e['amount']:.2f}"])
        et = Table(ed, colWidths=[22*mm,65*mm,24*mm,35*mm,24*mm])
        et.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(-1,0),DK), ("TEXTCOLOR",(0,0),(-1,0),rlcolors.white),
            ("FONTSIZE",(0,0),(-1,-1),8), ("GRID",(0,0),(-1,-1),0.5,rlcolors.lightgrey),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[rlcolors.white,LGRY]),
        ]))
        story.append(et)

        doc.build(story)
        buf.seek(0)
        safe = grp["name"].replace(" ","_")
        return send_file(buf, mimetype="application/pdf", as_attachment=True,
                         download_name=f"SplitSmart_{safe}.pdf")
    except ImportError:
        return err("ReportLab not installed. Run: pip install reportlab", "MISSING_DEP")



@app.put("/api/v1/auth/profile")
@require_auth
def update_profile():
    d        = request.get_json(force=True)
    username = (d.get("username") or "").strip()
    color    = d.get("avatar_color", "").strip()
    if len(username) < 2:
        return err("Name must be at least 2 characters")
    valid_colors = ["#16a34a","#2563eb","#7c3aed","#dc2626","#d97706","#0891b2","#db2777","#65a30d","#0f172a","#be185d"]
    if color and color not in valid_colors:
        return err("Invalid color")
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET username=?, avatar_color=?, updated_at=datetime('now') WHERE id=?",
            (username, color or "#16a34a", g.user_id)
        )
    return jsonify({"message": "Profile updated"})


# ── RECURRING EXPENSES ───────────────────────────────────────────────────────

@app.get("/api/v1/groups/<int:group_id>/recurring")
@require_auth
@require_member
def list_recurring(group_id):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT r.*, u.username as paid_by_name
            FROM recurring_expenses r JOIN users u ON u.id=r.paid_by_user_id
            WHERE r.group_id=? AND r.active=1 ORDER BY r.next_due
        """, (group_id,)).fetchall()
    result = []
    for r in rows:
        row = dict(r)
        row["participants"] = json.loads(r["participants"])
        result.append(row)
    return jsonify(result)


@app.post("/api/v1/groups/<int:group_id>/recurring")
@require_auth
@require_member
def create_recurring(group_id):
    d            = request.get_json(force=True)
    description  = (d.get("description") or "").strip()
    amount       = d.get("amount")
    frequency    = d.get("frequency", "monthly")
    category     = d.get("category", "general")
    participants = d.get("participants", [])
    paid_by      = d.get("paid_by_user_id", g.user_id)
    next_due     = d.get("next_due") or datetime.now().strftime("%Y-%m-%d")

    if not description or not amount or float(amount) <= 0:
        return err("Description and positive amount required")
    if frequency not in ("weekly", "monthly"):
        return err("Frequency must be weekly or monthly")

    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO recurring_expenses
               (group_id, paid_by_user_id, description, amount, frequency, category, next_due, participants)
               VALUES (?,?,?,?,?,?,?,?)""",
            (group_id, paid_by, description, float(amount), frequency, category,
             next_due, json.dumps(participants))
        )
    return jsonify({"id": cur.lastrowid}), 201


@app.post("/api/v1/groups/<int:group_id>/recurring/<int:rid>/apply")
@require_auth
@require_member
def apply_recurring(group_id, rid):
    """Manually trigger a recurring expense — creates a real expense and advances next_due."""
    with get_db() as conn:
        rec = conn.execute(
            "SELECT * FROM recurring_expenses WHERE id=? AND group_id=? AND active=1",
            (rid, group_id)
        ).fetchone()
        if not rec: return err("Not found", status=404)

        participants_raw = json.loads(rec["participants"])
        if not participants_raw:
            members = conn.execute(
                "SELECT user_id FROM group_members WHERE group_id=?", (group_id,)
            ).fetchall()
            participants_raw = [{"user_id": m["user_id"]} for m in members]

        try:
            splits = calculate_splits(float(rec["amount"]), rec["split_type"], participants_raw)
        except ValueError as e:
            return err(str(e), "SPLIT_ERROR")

        cur = conn.execute(
            "INSERT INTO expenses (group_id,paid_by_user_id,description,amount,split_type,category) VALUES (?,?,?,?,?,?)",
            (group_id, rec["paid_by_user_id"], rec["description"], rec["amount"],
             rec["split_type"], rec["category"])
        )
        eid = cur.lastrowid
        conn.executemany(
            "INSERT INTO expense_splits (expense_id,user_id,amount) VALUES (?,?,?)",
            [(eid, s["user_id"], s["amount"]) for s in splits]
        )

        # Advance next_due
        from datetime import timedelta
        current = datetime.strptime(rec["next_due"], "%Y-%m-%d")
        delta   = timedelta(days=7) if rec["frequency"] == "weekly" else timedelta(days=30)
        next_d  = (current + delta).strftime("%Y-%m-%d")
        conn.execute("UPDATE recurring_expenses SET next_due=? WHERE id=?", (next_d, rid))
        log_activity(conn, group_id, g.user_id, "expense_added", eid,
                     {"description": rec["description"], "amount": float(rec["amount"]), "recurring": True})

    return jsonify({"expense_id": eid, "next_due": next_d}), 201


@app.delete("/api/v1/groups/<int:group_id>/recurring/<int:rid>")
@require_auth
@require_member
def delete_recurring(group_id, rid):
    with get_db() as conn:
        conn.execute(
            "UPDATE recurring_expenses SET active=0 WHERE id=? AND group_id=?", (rid, group_id)
        )
    return jsonify({"message": "Deleted"})


# ── SPLIT SUGGESTIONS ────────────────────────────────────────────────────────

@app.get("/api/v1/groups/<int:group_id>/suggestions")
@require_auth
@require_member
def split_suggestions(group_id):
    """Analyse past 30 expenses to suggest who usually pays for what category."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT e.category, e.paid_by_user_id, u.username, COUNT(*) as cnt
            FROM expenses e JOIN users u ON u.id=e.paid_by_user_id
            WHERE e.group_id=? AND e.deleted_at IS NULL
            GROUP BY e.category, e.paid_by_user_id
            ORDER BY e.category, cnt DESC
        """, (group_id,)).fetchall()

    # Top payer per category
    seen = set()
    suggestions = []
    for r in rows:
        if r["category"] not in seen:
            seen.add(r["category"])
            suggestions.append({
                "category":  r["category"],
                "payer_id":  r["paid_by_user_id"],
                "payer_name": r["username"],
                "times":     r["cnt"],
            })
    return jsonify(suggestions)


# ── HEALTH ───────────────────────────────────────────────────────────────────

@app.get("/api/v1/health")
def health():
    return jsonify({"status": "ok", "version": "2.0.0",
                    "otp_mode": "gmail_smtp" if os.environ.get("GMAIL_USER") else "console_dev"})


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG","1")=="1", port=5000)
