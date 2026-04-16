import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../utils/api";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      api.me().then(setUser).catch(()=>localStorage.removeItem("token")).finally(()=>setLoading(false));
    } else { setLoading(false); }
  }, []);

  const login = useCallback(async (email, password) => {
    // Returns {message, email} — OTP has been sent
    return api.login({ email, password });
  }, []);

  const register = useCallback(async (email, username, password) => {
    return api.register({ email, username, password });
  }, []);

  const verifyOtp = useCallback(async (email, otp, purpose) => {
    const data = await api.verifyOtp({ email, otp, purpose });
    localStorage.setItem("token", data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const resendOtp = useCallback((email, purpose) => api.resendOtp({ email, purpose }), []);

  const logout = useCallback(() => {
    localStorage.removeItem("token"); setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, login, register, verifyOtp, resendOtp, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
