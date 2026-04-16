# SplitSmart — Smart Expense Splitter SaaS

> Created by **Samyak Ahiwale, Dipesh Bante & Yash Bonde**

A production-grade Splitwise alternative built with Flask, React, and SQLite. Splits expenses optimally, handles complex group debts, scans receipts locally, and generates settlement PDFs — no paid APIs, no cloud dependencies.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, Flask 3.x, REST API |
| Auth | JWT (PyJWT) + bcrypt |
| Frontend | React 18, Vite, Tailwind CSS |
| Database | SQLite (WAL mode) → PostgreSQL-ready |
| OCR | Tesseract.js (client-side, no server load) |
| PDF | ReportLab |
| Algorithm | Greedy max-heap, O(n log n) |

---

## Project Structure

```
splitwise/
├── backend/
│   ├── app.py                   # Flask app + all REST endpoints
│   ├── requirements.txt
│   ├── core/
│   │   └── debt_simplifier.py   # Core algorithm: simplify_debts, calculate_splits
│   └── models/
│       └── schema.py            # DB schema, init_db, get_db context manager
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── App.jsx              # Router + auth guards
│       ├── index.jsx
│       ├── index.css
│       ├── store/
│       │   └── AuthContext.jsx  # Global auth state
│       ├── utils/
│       │   └── api.js           # Typed API client, error handling, token refresh
│       ├── pages/
│       │   ├── Auth.jsx         # Login + Register
│       │   ├── Groups.jsx       # Groups list (home)
│       │   └── GroupDetail.jsx  # Group dashboard: expenses / balances / members
│       └── components/
│           ├── expenses/
│           │   ├── AddExpenseModal.jsx   # Add/Edit with OCR + split types
│           │   └── ExpenseList.jsx       # Grouped by date, edit/delete actions
│           ├── groups/
│           │   ├── BalanceSummary.jsx    # Per-member net + optimal settlements
│           │   └── MembersPanel.jsx      # Add/remove members
│           ├── settlements/
│           │   └── SettleUpModal.jsx     # Record partial/full payments
│           └── ui/
│               ├── Modal.jsx
│               ├── Avatar.jsx
│               ├── EmptyState.jsx
│               ├── Spinner.jsx
│               └── ConfirmDialog.jsx
└── tests/
    └── test_algorithm.py        # 15 unit tests for core algorithm
```

---

## Setup & Run

### Backend

```bash
cd splitwise/backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py
# → Running on http://localhost:5000
```

**Environment variables** (optional):
```bash
export JWT_SECRET="your-super-secret-key-here"
export DATABASE_PATH="/data/splitwise.db"
```

### Frontend

```bash
cd splitwise/frontend
npm install
npm run dev
# → Running on http://localhost:3000
```

---

## Core Algorithm

### Debt Simplification (O(n log n))

The engine in `core/debt_simplifier.py` minimizes the number of transactions using a greedy max-heap approach:

```
Input:  {Alice: +₹50, Bob: -₹30, Charlie: -₹20}
Output: [Bob → Alice ₹30, Charlie → Alice ₹20]   (2 transactions, optimal)

Naïve approach for A→B→C→A chain: 3 transactions
Our approach: reduces to 0 (all cancel out)
```

**Why greedy is optimal here:** Each iteration, we match the largest creditor with the largest debtor. This guarantees at least one party reaches zero balance per step, producing at most `n-1` transactions for `n` users. For typical groups (5-20 people), this matches the theoretical minimum.

**Floating point:** All arithmetic uses Python's `Decimal` with `ROUND_HALF_UP`. Rounding remainder is assigned to the first participant to ensure splits always sum exactly to the total.

### Split Types

| Type | Behavior |
|---|---|
| `equal` | Divides total evenly; rounding remainder on first participant |
| `exact` | Each participant specifies their amount; validated to sum to total ±0.02 |
| `percentage` | Each participant specifies %; must sum to 100 |

---

## API Reference

### Auth
```
POST /api/v1/auth/register   { email, username, password }
POST /api/v1/auth/login      { email, password }
GET  /api/v1/auth/me
```

### Groups
```
GET    /api/v1/groups
POST   /api/v1/groups           { name, description }
GET    /api/v1/groups/:id
DELETE /api/v1/groups/:id
POST   /api/v1/groups/:id/members        { email }
DELETE /api/v1/groups/:id/members/:uid
```

### Expenses
```
GET    /api/v1/groups/:id/expenses         ?limit=50&offset=0
POST   /api/v1/groups/:id/expenses         { description, amount, split_type, participants, paid_by_user_id, category, date }
PUT    /api/v1/groups/:id/expenses/:eid
DELETE /api/v1/groups/:id/expenses/:eid    (soft delete)
```

### Balances & Settlements
```
GET  /api/v1/groups/:id/balances           → { user_balances, transactions, current_user_summary }
POST /api/v1/groups/:id/settle             { to_user_id, amount, note }
GET  /api/v1/groups/:id/settlements
GET  /api/v1/groups/:id/report             → PDF download
```

### Response Format
```json
// Success
{ "id": 1, "name": "Goa Trip" }

// Error
{ "error": "Email already registered", "code": "EMAIL_EXISTS" }
```

---

## Database Schema

```sql
users           (id, email UNIQUE, username, password_hash, avatar_color, created_at)
groups          (id, name, description, created_by → users.id RESTRICT)
group_members   (id, group_id → CASCADE, user_id → RESTRICT, role, UNIQUE(group_id, user_id))
expenses        (id, group_id → CASCADE, paid_by_user_id, amount, split_type, deleted_at)
expense_splits  (id, expense_id → CASCADE, user_id → RESTRICT, amount, UNIQUE(expense_id, user_id))
settlements     (id, group_id, from_user_id, to_user_id, amount, note)
audit_log       (id, user_id, action, entity_type, entity_id, payload JSON)
```

**Key indexes:**
- `expenses(group_id) WHERE deleted_at IS NULL` — most queries filter active expenses
- `expense_splits(user_id, expense_id)` — "what does user X owe in group Y" pattern
- `settlements(from_user_id)`, `(to_user_id)` — balance computation joins

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Delete user with pending balance | HTTP 409, frontend shows error |
| Edit old expense | Recalculates splits, balance recomputed on next `GET /balances` |
| Rounding mismatch | `ROUND_HALF_UP` + first-participant correction |
| Duplicate expense submission | Idempotency via disabled submit button during save |
| Zero-balance users | Excluded from transaction output |
| OCR failure | Graceful error message, manual entry always available |
| Token expiry | Auto-redirect to `/login`, token cleared from localStorage |
| Group member removal with balance | Backend blocks with `PENDING_BALANCE` code |

---

## PostgreSQL Migration

1. **Schema changes:**
   - `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGSERIAL PRIMARY KEY`
   - `TEXT` timestamps → `TIMESTAMPTZ DEFAULT NOW()`
   - Add `CREATE EXTENSION pg_trgm` for fuzzy expense search

2. **Connection:** Replace `sqlite3.connect()` with `psycopg2` or `SQLAlchemy`

3. **Performance at scale:**
   - Partition `expenses` by `group_id` for groups with >10k expenses
   - Add `BRIN` index on `expenses.created_at` for time-range queries
   - Use `MATERIALIZED VIEW` for group balance summaries (refresh on insert/delete)

4. **Data migration:**
   ```bash
   sqlite3 splitwise.db .dump | psql -U postgres splitwise
   ```

---

## Running Tests

```bash
cd splitwise
pip install pytest
python -m pytest tests/ -v
```

15 tests covering: debt simplification, chain optimization, split types, rounding, partial payments, large groups.

---

## Deployment Checklist

- [ ] Set `JWT_SECRET` to a long random string in production
- [ ] Set `DATABASE_PATH` to a persistent volume path
- [ ] Enable HTTPS (nginx reverse proxy recommended)
- [ ] Change CORS origins from `localhost:3000` to your domain
- [ ] Set `debug=False` in `app.run()`
- [ ] Add rate limiting (Flask-Limiter) on auth endpoints
- [ ] Schedule SQLite backups (or migrate to PostgreSQL)
- [ ] Run `npm run build` and serve `dist/` as static files
