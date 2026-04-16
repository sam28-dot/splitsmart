// components/groups/BalanceSummary.jsx
import Avatar from "../ui/Avatar";

export default function BalanceSummary({ balances, currentUserId, members, onSettleUp }) {
  const memberMap = Object.fromEntries(members.map((m) => [m.user_id, m]));

  return (
    <div className="space-y-4">
      {/* Per-member balances */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Member Balances</h3>
        <div className="space-y-2">
          {Object.entries(balances.user_balances).map(([uid, info]) => {
            const isMe = parseInt(uid) === currentUserId;
            const net = info.net_balance;
            const member = memberMap[uid];
            return (
              <div key={uid} className="bg-white border border-gray-100 rounded-xl p-3.5 flex items-center gap-3">
                <Avatar name={info.name} color={member?.avatar_color} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {isMe ? "You" : info.name}
                  </p>
                  <p className="text-xs text-gray-400">paid ₹{info.paid.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  {Math.abs(net) < 0.01 ? (
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">settled</span>
                  ) : net > 0 ? (
                    <div>
                      <p className="text-sm font-bold text-emerald-600">+₹{net.toFixed(2)}</p>
                      <p className="text-xs text-emerald-500">gets back</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-bold text-red-500">-₹{Math.abs(net).toFixed(2)}</p>
                      <p className="text-xs text-red-400">owes</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Optimal Settlements */}
      {balances.transactions.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Settle Up ({balances.transactions.length} transaction{balances.transactions.length !== 1 ? "s" : ""})
          </h3>
          <div className="space-y-2">
            {balances.transactions.map((t, i) => {
              const isMyPayment = t.from_user_id === currentUserId;
              const isMyReceipt = t.to_user_id === currentUserId;
              return (
                <div key={i} className={`rounded-xl p-3.5 border flex items-center gap-3 ${
                  isMyPayment
                    ? "bg-red-50 border-red-100"
                    : isMyReceipt
                    ? "bg-emerald-50 border-emerald-100"
                    : "bg-white border-gray-100"
                }`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Avatar name={t.from_name} size="xs" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">
                        <span className="font-medium">{isMyPayment ? "You" : t.from_name}</span>
                        <span className="text-gray-400 mx-1">→</span>
                        <span className="font-medium">{isMyReceipt ? "You" : t.to_name}</span>
                      </p>
                    </div>
                  </div>
                  <p className={`text-sm font-bold flex-shrink-0 ${
                    isMyPayment ? "text-red-600" : isMyReceipt ? "text-emerald-600" : "text-gray-700"
                  }`}>
                    ₹{t.amount.toFixed(2)}
                  </p>
                </div>
              );
            })}
          </div>

          {balances.current_user_summary.you_owe > 0.01 && (
            <button onClick={onSettleUp}
              className="w-full mt-3 py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl transition-colors">
              Record Settlement
            </button>
          )}
        </div>
      )}

      {balances.transactions.length === 0 && (
        <div className="text-center py-8">
          <p className="text-2xl mb-2">🎉</p>
          <p className="font-medium text-gray-700">All settled up!</p>
          <p className="text-sm text-gray-400">No outstanding balances in this group</p>
        </div>
      )}
    </div>
  );
}
