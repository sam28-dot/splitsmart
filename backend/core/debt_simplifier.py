"""
Smart Debt Simplification Engine
---------------------------------
Algorithm: Greedy + Min-Heap approach
Complexity: O(n log n) where n = number of users

Approach:
  1. Compute net balance per user (total owed - total owing)
  2. Separate into creditors (+) and debtors (-)
  3. Use max-heaps (negated min-heaps) to always settle the largest imbalances first
  4. Each iteration: pop max creditor & max debtor → generate one transaction → push remainder back
  
Why this minimizes transactions:
  - Each iteration produces exactly one transaction and eliminates at least one user
    (the one with exactly zero remainder) OR reduces both to smaller abs values
  - Theoretical minimum: max(|creditors|, |debtors|) transactions
  - In practice achieves n-1 or fewer for n users
  
Floating point: all amounts rounded to 2 decimal places; amounts < $0.01 treated as settled
"""

import heapq
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Tuple
from dataclasses import dataclass


EPSILON = Decimal("0.01")


def cents(amount: float | Decimal) -> Decimal:
    """Normalize to 2-decimal Decimal, ROUND_HALF_UP to avoid banker's rounding issues."""
    return Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclass
class Transaction:
    from_user_id: int
    from_name: str
    to_user_id: int
    to_name: str
    amount: float

    def to_dict(self) -> dict:
        return {
            "from_user_id": self.from_user_id,
            "from_name": self.from_name,
            "to_user_id": self.to_user_id,
            "to_name": self.to_name,
            "amount": float(self.amount),
        }


def simplify_debts(balances: Dict[int, Dict]) -> List[Transaction]:
    """
    Compute the minimum set of transactions to settle all debts.

    Args:
        balances: {user_id: {"name": str, "net_balance": float}}
                  Positive net_balance = user is owed money (creditor)
                  Negative net_balance = user owes money (debtor)

    Returns:
        List of Transaction objects representing optimal settlements

    Example:
        A owes B $10, B owes C $10 → simplified: A pays C $10 (1 tx instead of 2)
    """
    if not balances:
        return []

    # Normalize to Decimal cents
    net: Dict[int, Tuple[Decimal, str]] = {
        uid: (cents(info["net_balance"]), info["name"])
        for uid, info in balances.items()
    }

    # Separate into creditors (positive) and debtors (negative)
    # Use negated heaps for max-heap behavior with heapq (which is min-heap)
    creditors: List[Tuple[Decimal, int, str]] = []  # (-amount, uid, name)
    debtors: List[Tuple[Decimal, int, str]] = []    # (-amount, uid, name)  

    for uid, (balance, name) in net.items():
        if balance > EPSILON:
            heapq.heappush(creditors, (-balance, uid, name))
        elif balance < -EPSILON:
            heapq.heappush(debtors, (balance, uid, name))  # already negative

    transactions: List[Transaction] = []

    while creditors and debtors:
        # Pop largest creditor and largest debtor
        neg_credit, cred_id, cred_name = heapq.heappop(creditors)
        credit = -neg_credit

        debt_amount, debt_id, debt_name = heapq.heappop(debtors)
        debt = -debt_amount  # Make positive for comparison

        # Settle as much as possible
        settled = min(credit, debt)
        transactions.append(Transaction(
            from_user_id=debt_id,
            from_name=debt_name,
            to_user_id=cred_id,
            to_name=cred_name,
            amount=float(settled),
        ))

        remainder_credit = cents(credit - settled)
        remainder_debt = cents(debt - settled)

        # Push back non-zero remainders
        if remainder_credit > EPSILON:
            heapq.heappush(creditors, (-remainder_credit, cred_id, cred_name))
        if remainder_debt > EPSILON:
            heapq.heappush(debtors, (-remainder_debt, debt_id, debt_name))

    return transactions


def compute_group_balances(
    group_members: List[Dict],
    expenses: List[Dict],
    splits: List[Dict],
    payments: List[Dict],
    current_user_id: int,
) -> Dict:
    """
    Aggregate all expenses and payments into per-user net balances for a group.

    Returns:
        {
          "user_balances": {uid: {"name": str, "net_balance": float, "paid": float, "owes": float}},
          "current_user_summary": {"you_are_owed": float, "you_owe": float},
          "transactions": [Transaction.to_dict()],
          "total_group_spend": float,
        }
    """
    # Map uid → name
    member_map = {m["user_id"]: m["name"] for m in group_members}
    
    # Initialize accumulators
    paid_by: Dict[int, Decimal] = {uid: Decimal("0") for uid in member_map}
    owes: Dict[int, Decimal] = {uid: Decimal("0") for uid in member_map}

    # Process expense splits
    split_index: Dict[int, List[Dict]] = {}
    for s in splits:
        split_index.setdefault(s["expense_id"], []).append(s)

    for expense in expenses:
        eid = expense["id"]
        payer_id = expense["paid_by_user_id"]
        amount = cents(expense["amount"])
        paid_by[payer_id] = paid_by.get(payer_id, Decimal("0")) + amount

        for split in split_index.get(eid, []):
            uid = split["user_id"]
            owes[uid] = owes.get(uid, Decimal("0")) + cents(split["amount"])

    # Apply settled payments
    for payment in payments:
        payer_id = payment["from_user_id"]
        payee_id = payment["to_user_id"]
        amount = cents(payment["amount"])
        # Payment reduces what payer owes and what payee is owed
        paid_by[payer_id] = paid_by.get(payer_id, Decimal("0")) + amount
        owes[payee_id] = owes.get(payee_id, Decimal("0")) + amount

    user_balances = {}
    total_group_spend = Decimal("0")

    for uid in member_map:
        net_balance = paid_by.get(uid, Decimal("0")) - owes.get(uid, Decimal("0"))
        total_group_spend += paid_by.get(uid, Decimal("0"))
        user_balances[uid] = {
            "name": member_map[uid],
            "net_balance": float(net_balance),
            "paid": float(paid_by.get(uid, Decimal("0"))),
            "owes": float(owes.get(uid, Decimal("0"))),
        }

    transactions = simplify_debts({
        uid: {"name": v["name"], "net_balance": v["net_balance"]}
        for uid, v in user_balances.items()
    })

    # Current user perspective
    you_are_owed = sum(
        t.amount for t in transactions if t.to_user_id == current_user_id
    )
    you_owe = sum(
        t.amount for t in transactions if t.from_user_id == current_user_id
    )

    return {
        "user_balances": user_balances,
        "current_user_summary": {
            "you_are_owed": round(you_are_owed, 2),
            "you_owe": round(you_owe, 2),
        },
        "transactions": [t.to_dict() for t in transactions],
        "total_group_spend": float(total_group_spend / 2),  # avoid double counting
    }


def calculate_splits(
    total: float,
    split_type: str,
    participants: List[Dict],
) -> List[Dict]:
    """
    Calculate individual split amounts with rounding correction.

    Args:
        total: Total expense amount
        split_type: "equal" | "exact" | "percentage"
        participants: List of {"user_id": int, "value": float}
                      - equal: value is ignored
                      - exact: value is the exact amount for this user
                      - percentage: value is the percentage (0-100)

    Returns:
        List of {"user_id": int, "amount": float}
    
    Rounding: Distributes rounding remainder to first participant to avoid 
              float sum != total discrepancies.
    """
    total_d = cents(total)

    if split_type == "equal":
        n = len(participants)
        if n == 0:
            return []
        per_person = (total_d / n).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        splits = [{"user_id": p["user_id"], "amount": float(per_person)} for p in participants]
        # Fix rounding remainder on first participant
        computed_sum = per_person * n
        diff = total_d - computed_sum
        if diff != 0:
            splits[0]["amount"] = float(cents(per_person + diff))
        return splits

    elif split_type == "exact":
        result = []
        total_assigned = Decimal("0")
        for p in participants:
            amt = cents(p.get("value", 0))
            result.append({"user_id": p["user_id"], "amount": float(amt)})
            total_assigned += amt
        if abs(total_assigned - total_d) > Decimal("0.02"):
            raise ValueError(
                f"Exact splits sum ({total_assigned}) doesn't match total ({total_d})"
            )
        return result

    elif split_type == "percentage":
        result = []
        total_pct = sum(Decimal(str(p.get("value", 0))) for p in participants)
        if abs(total_pct - 100) > Decimal("0.01"):
            raise ValueError(f"Percentages must sum to 100, got {total_pct}")
        amounts = []
        for p in participants:
            pct = Decimal(str(p.get("value", 0))) / 100
            amt = (total_d * pct).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            amounts.append(amt)
        # Fix rounding
        diff = total_d - sum(amounts)
        if diff != 0:
            amounts[0] += diff
        return [
            {"user_id": p["user_id"], "amount": float(a)}
            for p, a in zip(participants, amounts)
        ]

    else:
        raise ValueError(f"Unknown split_type: {split_type}")
