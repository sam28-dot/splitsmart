// components/expenses/ExpenseList.jsx
import { useState } from "react";
import Avatar from "../ui/Avatar";
import EmptyState from "../ui/EmptyState";
import ConfirmDialog from "../ui/ConfirmDialog";

const CATEGORY_ICONS = {
  food: "🍽️", travel: "✈️", rent: "🏠",
  entertainment: "🎬", utilities: "💡", general: "💳",
};

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function groupByDate(expenses) {
  const groups = {};
  for (const e of expenses) {
    const key = e.date;
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

export default function ExpenseList({ expenses, currentUserId, members, onDelete, onEdit }) {
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(null);

  if (expenses.length === 0) {
    return (
      <EmptyState
        icon="💸"
        title="No expenses yet"
        subtitle="Add your first expense to start tracking"
      />
    );
  }

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(confirmDelete.id);
    await onDelete(confirmDelete.id);
    setConfirmDelete(null);
    setDeleting(null);
  };

  const grouped = groupByDate(expenses);

  return (
    <>
      <div className="space-y-4">
        {grouped.map(([date, dayExpenses]) => (
          <div key={date}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
              {formatDate(date)}
            </p>
            <div className="space-y-2">
              {dayExpenses.map((expense) => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  currentUserId={currentUserId}
                  onEdit={() => onEdit(expense)}
                  onDelete={() => setConfirmDelete(expense)}
                  isDeleting={deleting === expense.id}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Delete Expense"
        message={`Delete "${confirmDelete?.description}"? This will affect group balances.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
        danger
      />
    </>
  );
}

function ExpenseCard({ expense, currentUserId, onEdit, onDelete, isDeleting }) {
  const [showActions, setShowActions] = useState(false);
  const iPaid = expense.paid_by_user_id === currentUserId;
  const myShare = expense.splits?.find((s) => s.user_id === currentUserId);

  return (
    <div className={`bg-white border border-gray-100 rounded-2xl overflow-hidden transition-opacity ${
      isDeleting ? "opacity-50" : ""
    }`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
            {CATEGORY_ICONS[expense.category] || "💳"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-gray-900 text-sm truncate">{expense.description}</p>
              <div className="flex items-center gap-1 flex-shrink-0">
                <p className="font-bold text-gray-900 text-sm">₹{expense.amount.toFixed(2)}</p>
                <button
                  onClick={() => setShowActions(!showActions)}
                  className="p-1 text-gray-300 hover:text-gray-500 rounded transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Avatar name={expense.paid_by_name} color={expense.avatar_color} size="xs" />
              <p className="text-xs text-gray-400">
                {iPaid ? "You paid" : `${expense.paid_by_name} paid`}
                {myShare && (
                  <span className={`ml-1.5 font-medium ${iPaid ? "text-emerald-600" : "text-red-500"}`}>
                    {iPaid
                      ? `+₹${(expense.amount - (myShare?.amount || 0)).toFixed(2)}`
                      : `-₹${myShare.amount.toFixed(2)}`}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {showActions && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
            <button onClick={() => { setShowActions(false); onEdit(); }}
              className="flex-1 py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
              Edit
            </button>
            <button onClick={() => { setShowActions(false); onDelete(); }}
              className="flex-1 py-2 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
