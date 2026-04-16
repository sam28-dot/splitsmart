const BASE = import.meta.env.VITE_API_URL || "/api/v1";

export class ApiError extends Error {
  constructor(message, code, status) {
    super(message); this.code = code; this.status = status;
  }
}

async function req(path, opts = {}) {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (res.status === 204) return null;
  let data;
  try { data = await res.json(); } catch { throw new ApiError("Network error", "NETWORK_ERROR", res.status); }
  if (!res.ok) {
    if (res.status === 401 && data.code === "TOKEN_EXPIRED") {
      localStorage.removeItem("token"); window.location.href = "/login";
    }
    throw new ApiError(data.error || "Unknown error", data.code, res.status);
  }
  return data;
}

export const api = {
  // Auth + OTP
  register:    (d) => req("/auth/register",    { method:"POST", body:JSON.stringify(d) }),
  login:       (d) => req("/auth/login",        { method:"POST", body:JSON.stringify(d) }),
  verifyOtp:   (d) => req("/auth/verify-otp",   { method:"POST", body:JSON.stringify(d) }),
  resendOtp:   (d) => req("/auth/resend-otp",   { method:"POST", body:JSON.stringify(d) }),
  me:          ()  => req("/auth/me"),
  updateProfile: (d) => req("/auth/profile", { method:"PUT", body:JSON.stringify(d) }),

  // Groups
  getGroups:      ()  => req("/groups"),
  createGroup:    (d) => req("/groups",               { method:"POST",   body:JSON.stringify(d) }),
  getGroup:       (id)=> req(`/groups/${id}`),
  deleteGroup:    (id)=> req(`/groups/${id}`,          { method:"DELETE" }),
  addMember:      (gid, email) => req(`/groups/${gid}/members`, { method:"POST", body:JSON.stringify({email}) }),
  removeMember:   (gid, uid)   => req(`/groups/${gid}/members/${uid}`, { method:"DELETE" }),

  // Invite
  createInvite: (gid) => req(`/groups/${gid}/invite`, { method:"POST" }),
  joinInvite:   (tok) => req(`/invite/${tok}`),

  // Expenses
  getExpenses:    (gid, p={}) => req(`/groups/${gid}/expenses?${new URLSearchParams(p)}`),
  createExpense:  (gid, d) => req(`/groups/${gid}/expenses`,         { method:"POST",   body:JSON.stringify(d) }),
  updateExpense:  (gid, eid, d) => req(`/groups/${gid}/expenses/${eid}`, { method:"PUT",    body:JSON.stringify(d) }),
  deleteExpense:  (gid, eid)    => req(`/groups/${gid}/expenses/${eid}`, { method:"DELETE" }),

  // Comments
  getComments: (gid, eid) => req(`/groups/${gid}/expenses/${eid}/comments`),
  addComment:  (gid, eid, body) => req(`/groups/${gid}/expenses/${eid}/comments`, { method:"POST", body:JSON.stringify({body}) }),

  // Balances & Settlements
  getBalances:    (gid) => req(`/groups/${gid}/balances`),
  settle:         (gid, d) => req(`/groups/${gid}/settle`, { method:"POST", body:JSON.stringify(d) }),
  getSettlements: (gid) => req(`/groups/${gid}/settlements`),

  // Analytics & Feed
  getAnalytics: (gid) => req(`/groups/${gid}/analytics`),
  getActivity:  (gid) => req(`/groups/${gid}/activity`),

  // PDF
  downloadReport: (gid) => {
    const token = localStorage.getItem("token");
    const base  = import.meta.env.VITE_API_URL || "http://localhost:5000/api/v1";
    fetch(`${base}/groups/${gid}/report`, { headers:{ Authorization:`Bearer ${token}` }})
      .then(r => r.blob()).then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "report.pdf"; a.click();
        URL.revokeObjectURL(a.href);
      });
  },
};

// Recurring expenses
Object.assign(api, {
  getRecurring:    (gid)      => req(`/groups/${gid}/recurring`),
  createRecurring: (gid, d)   => req(`/groups/${gid}/recurring`, { method:"POST", body:JSON.stringify(d) }),
  applyRecurring:  (gid, rid) => req(`/groups/${gid}/recurring/${rid}/apply`, { method:"POST" }),
  deleteRecurring: (gid, rid) => req(`/groups/${gid}/recurring/${rid}`, { method:"DELETE" }),
  getSuggestions:  (gid)      => req(`/groups/${gid}/suggestions`),
});
