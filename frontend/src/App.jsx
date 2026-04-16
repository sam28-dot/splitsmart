import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./store/AuthContext";
import { api } from "./utils/api";
import AuthPage from "./pages/Auth";
import GroupsPage from "./pages/Groups";
import GroupDetail from "./pages/GroupDetail";

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f8fafc" }}>
      <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTopColor:"#16a34a", borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/>
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : children;
}

function JoinPage() {
  const { token } = useParams();
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [status, setStatus] = useState("joining");

  useEffect(() => {
    if (!user) { navigate(`/login?next=/join/${token}`); return; }
    api.joinInvite(token)
      .then(d => { setStatus("success"); setTimeout(() => navigate(`/groups/${d.group_id}`), 1500); })
      .catch(err => setStatus(err.message));
  }, [token, user, navigate]);

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f8fafc", fontFamily:"Inter,sans-serif" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:16 }}>{status === "joining" ? "⏳" : status === "success" ? "🎉" : "❌"}</div>
        <p style={{ fontSize:18, fontWeight:700, color:"#0f172a" }}>
          {status === "joining" ? "Joining group…" : status === "success" ? "Joined! Redirecting…" : status}
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <Routes>
          <Route path="/login"        element={<PublicRoute><AuthPage /></PublicRoute>} />
          <Route path="/"             element={<PrivateRoute><GroupsPage /></PrivateRoute>} />
          <Route path="/groups/:groupId" element={<PrivateRoute><GroupDetail /></PrivateRoute>} />
          <Route path="/join/:token"  element={<PrivateRoute><JoinPage /></PrivateRoute>} />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
