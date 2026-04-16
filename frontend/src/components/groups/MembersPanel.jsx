// components/groups/MembersPanel.jsx
import { useState } from "react";
import { api } from "../../utils/api";
import Avatar from "../ui/Avatar";

export default function MembersPanel({ group, currentUserId, onUpdated }) {
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isAdmin = group.members?.find((m) => m.user_id === currentUserId)?.role === "admin";

  const addMember = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    setAdding(true);
    try {
      await api.addMember(group.id, email);
      setSuccess(`Member added successfully`);
      setEmail("");
      onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const removeMember = async (userId, name) => {
    if (!window.confirm(`Remove ${name} from this group?`)) return;
    try {
      await api.removeMember(group.id, userId);
      onUpdated();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Member List */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          {group.members?.length} Members
        </h3>
        <div className="space-y-2">
          {group.members?.map((m) => (
            <div key={m.user_id} className="bg-white border border-gray-100 rounded-xl p-3.5 flex items-center gap-3">
              <Avatar name={m.name} color={m.avatar_color} size="sm" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">
                  {m.user_id === currentUserId ? `${m.name} (You)` : m.name}
                </p>
                <p className="text-xs text-gray-400">{m.email}</p>
              </div>
              {m.role === "admin" && (
                <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md font-medium">admin</span>
              )}
              {isAdmin && m.user_id !== currentUserId && (
                <button
                  onClick={() => removeMember(m.user_id, m.name)}
                  className="p-1.5 text-gray-300 hover:text-red-400 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Add Member */}
      {isAdmin && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Add Member</h3>
          <form onSubmit={addMember} className="flex gap-2">
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter their email"
              className="flex-1 px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button type="submit" disabled={adding}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors">
              {adding ? "…" : "Add"}
            </button>
          </form>
          {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
          {success && <p className="text-sm text-emerald-600 mt-2">{success}</p>}
          <p className="text-xs text-gray-400 mt-2">The person must already have a SplitSmart account.</p>
        </div>
      )}
    </div>
  );
}
