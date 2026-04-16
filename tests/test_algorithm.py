"""
Unit tests for the debt simplification engine.
Run from splitsmart/ root: python -m pytest tests/ -v
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest
from core.debt_simplifier import simplify_debts, calculate_splits, compute_group_balances


# ─── simplify_debts ───────────────────────────────────────────────────────────

def test_simple_two_person():
    balances = {
        1: {"name": "Alice", "net_balance": 10.0},
        2: {"name": "Bob",   "net_balance": -10.0},
    }
    txns = simplify_debts(balances)
    assert len(txns) == 1
    assert txns[0].from_user_id == 2
    assert txns[0].to_user_id == 1
    assert abs(txns[0].amount - 10.0) < 0.01


def test_chain_simplification():
    balances = {
        1: {"name": "Alice",   "net_balance": -10.0},
        2: {"name": "Bob",     "net_balance": 0.0},
        3: {"name": "Charlie", "net_balance": 10.0},
    }
    txns = simplify_debts(balances)
    assert len(txns) == 1
    assert txns[0].from_user_id == 1
    assert txns[0].to_user_id == 3


def test_all_settled():
    balances = {
        1: {"name": "Alice", "net_balance": 0.0},
        2: {"name": "Bob",   "net_balance": 0.0},
    }
    assert simplify_debts(balances) == []


def test_three_person_complex():
    balances = {
        1: {"name": "Alice",   "net_balance": 20.0},
        2: {"name": "Bob",     "net_balance": -10.0},
        3: {"name": "Charlie", "net_balance": -10.0},
    }
    txns = simplify_debts(balances)
    assert len(txns) == 2
    assert abs(sum(t.amount for t in txns) - 20.0) < 0.01


def test_floating_point_precision():
    balances = {
        1: {"name": "A", "net_balance": 6.67},
        2: {"name": "B", "net_balance": -3.33},
        3: {"name": "C", "net_balance": -3.34},
    }
    txns = simplify_debts(balances)
    assert len(txns) <= 2


def test_large_group():
    balances = {}
    for i in range(1, 6):
        balances[i]   = {"name": f"Creditor{i}", "net_balance": 10.0}
        balances[i+5] = {"name": f"Debtor{i}",   "net_balance": -10.0}
    txns = simplify_debts(balances)
    assert abs(sum(t.amount for t in txns if t.to_user_id <= 5) - 50.0) < 0.1
    assert len(txns) <= 9


# ─── calculate_splits ────────────────────────────────────────────────────────

def test_equal_split():
    splits = calculate_splits(30.0, "equal", [{"user_id": i} for i in range(1, 4)])
    assert all(s["amount"] == pytest.approx(10.0) for s in splits)
    assert sum(s["amount"] for s in splits) == pytest.approx(30.0)


def test_equal_split_rounding():
    splits = calculate_splits(10.0, "equal", [{"user_id": i} for i in range(1, 4)])
    assert abs(sum(s["amount"] for s in splits) - 10.0) < 0.001


def test_exact_split():
    splits = calculate_splits(100.0, "exact", [
        {"user_id": 1, "value": 25.0},
        {"user_id": 2, "value": 75.0},
    ])
    assert splits[0]["amount"] == pytest.approx(25.0)
    assert splits[1]["amount"] == pytest.approx(75.0)


def test_exact_split_mismatch_raises():
    with pytest.raises(ValueError):
        calculate_splits(100.0, "exact", [{"user_id": 1, "value": 30.0}, {"user_id": 2, "value": 30.0}])


def test_percentage_split():
    splits = calculate_splits(200.0, "percentage", [
        {"user_id": 1, "value": 60},
        {"user_id": 2, "value": 40},
    ])
    assert splits[0]["amount"] == pytest.approx(120.0)
    assert splits[1]["amount"] == pytest.approx(80.0)
    assert sum(s["amount"] for s in splits) == pytest.approx(200.0)


def test_percentage_not_100_raises():
    with pytest.raises(ValueError):
        calculate_splits(100.0, "percentage", [{"user_id": 1, "value": 50}, {"user_id": 2, "value": 30}])


# ─── compute_group_balances ──────────────────────────────────────────────────

def test_compute_balances():
    result = compute_group_balances(
        members=[{"user_id": 1, "name": "Alice"}, {"user_id": 2, "name": "Bob"}],
        expenses=[{"id": 1, "paid_by_user_id": 1, "amount": 100.0}],
        splits=[
            {"expense_id": 1, "user_id": 1, "amount": 50.0},
            {"expense_id": 1, "user_id": 2, "amount": 50.0},
        ],
        payments=[],
        current_user_id=1,
    )
    assert result["user_balances"][1]["net_balance"] == pytest.approx(50.0)
    assert result["user_balances"][2]["net_balance"] == pytest.approx(-50.0)
    assert result["current_user_summary"]["you_are_owed"] == pytest.approx(50.0)


def test_partial_payment():
    result = compute_group_balances(
        members=[{"user_id": 1, "name": "A"}, {"user_id": 2, "name": "B"}],
        expenses=[{"id": 1, "paid_by_user_id": 1, "amount": 100.0}],
        splits=[
            {"expense_id": 1, "user_id": 1, "amount": 50.0},
            {"expense_id": 1, "user_id": 2, "amount": 50.0},
        ],
        payments=[{"from_user_id": 2, "to_user_id": 1, "amount": 30.0}],
        current_user_id=1,
    )
    txns = result["transactions"]
    assert len(txns) == 1
    assert abs(txns[0]["amount"] - 20.0) < 0.01
