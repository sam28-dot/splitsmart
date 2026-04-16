"""
Database Schema — SplitSmart
Production-grade SQLite (WAL mode), PostgreSQL-compatible DDL.

Tables:
  users, groups, group_members, expenses, expense_splits,
  settlements, otp_tokens, invite_links, expense_comments,
  activity_feed, audit_log

Migration to PostgreSQL:
  - INTEGER PRIMARY KEY AUTOINCREMENT  →  BIGSERIAL PRIMARY KEY
  - TEXT timestamps  →  TIMESTAMPTZ DEFAULT NOW()
  - Add CREATE EXTENSION pg_trgm  for full-text expense search
"""

import sqlite3, os
from contextlib import contextmanager

# Render free tier has no persistent disk.
# Default to /tmp/splitwise.db (survives restarts, resets on redeploy).
# For persistent storage: upgrade to Render paid tier ($7/mo) and set
# DATABASE_PATH=/data/splitwise.db + add a disk mount at /data.
DATABASE_PATH = os.environ.get("DATABASE_PATH", "/tmp/splitwise.db")


def get_connection():
    # Ensure the directory for the database exists
    db_dir = os.path.dirname(DATABASE_PATH)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir)
        print(f"Created directory: {db_dir}")

    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


SCHEMA_SQL = """
-- ── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    username      TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    avatar_color  TEXT    NOT NULL DEFAULT '#16a34a',
    is_verified   INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ── OTP TOKENS ───────────────────────────────────────────────────────────────
-- purpose: 'verify' (registration) | 'login' (MFA on login)
CREATE TABLE IF NOT EXISTS otp_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    NOT NULL,
    otp_hash   TEXT    NOT NULL,        -- bcrypt hash of the 6-digit code
    purpose    TEXT    NOT NULL DEFAULT 'login',
    attempts   INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT    NOT NULL,        -- datetime string UTC
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_otp_email   ON otp_tokens(email, purpose);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_tokens(expires_at);

-- ── GROUPS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    emoji       TEXT NOT NULL DEFAULT '💰',
    created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by);

-- ── GROUP MEMBERS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_members (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id  INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
    role      TEXT    NOT NULL DEFAULT 'member',
    joined_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_gm_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_gm_user  ON group_members(user_id);

-- ── INVITE LINKS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invite_links (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    token      TEXT    NOT NULL UNIQUE,
    created_by INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT,
    uses       INTEGER NOT NULL DEFAULT 0,
    max_uses   INTEGER,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invite_token ON invite_links(token);

-- ── EXPENSES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id         INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    paid_by_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    description      TEXT    NOT NULL,
    amount           REAL    NOT NULL CHECK(amount > 0),
    split_type       TEXT    NOT NULL DEFAULT 'equal',
    category         TEXT    NOT NULL DEFAULT 'general',
    receipt_image    TEXT,
    date             TEXT    NOT NULL DEFAULT (date('now')),
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    deleted_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_expenses_group  ON expenses(group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_date   ON expenses(group_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_payer  ON expenses(paid_by_user_id);

-- ── EXPENSE SPLITS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_splits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
    amount     REAL    NOT NULL CHECK(amount >= 0),
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(expense_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_splits_expense  ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_splits_user     ON expense_splits(user_id);

-- ── SETTLEMENTS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlements (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    from_user_id INTEGER NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
    to_user_id   INTEGER NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
    amount       REAL    NOT NULL CHECK(amount > 0),
    note         TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_settle_group ON settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_settle_from  ON settlements(from_user_id);
CREATE INDEX IF NOT EXISTS idx_settle_to    ON settlements(to_user_id);

-- ── EXPENSE COMMENTS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
    body       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_expense ON expense_comments(expense_id);

-- ── ACTIVITY FEED ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_feed (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT    NOT NULL,   -- 'expense_added' | 'expense_deleted' | 'settled' | 'member_added'
    entity_id  INTEGER,
    meta       TEXT,               -- JSON blob
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feed_group ON activity_feed(group_id, created_at DESC);


-- ── RECURRING EXPENSES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id         INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    paid_by_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    description      TEXT    NOT NULL,
    amount           REAL    NOT NULL CHECK(amount > 0),
    split_type       TEXT    NOT NULL DEFAULT 'equal',
    category         TEXT    NOT NULL DEFAULT 'general',
    frequency        TEXT    NOT NULL DEFAULT 'monthly',  -- 'weekly' | 'monthly'
    next_due         TEXT    NOT NULL DEFAULT (date('now')),
    participants     TEXT    NOT NULL DEFAULT '[]',        -- JSON array of user_ids
    active           INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recurring_group ON recurring_expenses(group_id) WHERE active=1;
CREATE INDEX IF NOT EXISTS idx_recurring_due   ON recurring_expenses(next_due) WHERE active=1;

-- ── AUDIT LOG ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   INTEGER,
    payload     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def init_db():
    with get_db() as conn:
        conn.executescript(SCHEMA_SQL)
    print(f"[DB] Schema ready at {DATABASE_PATH}")


def log_activity(conn, group_id, user_id, action, entity_id=None, meta=None):
    import json
    conn.execute(
        "INSERT INTO activity_feed (group_id, user_id, action, entity_id, meta) VALUES (?,?,?,?,?)",
        (group_id, user_id, action, entity_id, json.dumps(meta) if meta else None)
    )
