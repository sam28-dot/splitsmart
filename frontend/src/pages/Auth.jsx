import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";

const S = {
  input: { height:44,padding:"0 14px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14,color:"#0f172a",background:"#fff",outline:"none",width:"100%",fontFamily:"Inter,sans-serif",transition:"border 0.15s" },
  label: { fontSize:13,fontWeight:500,color:"#475569",display:"block",marginBottom:6 },
  btn:   { width:"100%",height:46,background:"#16a34a",color:"#fff",border:"none",borderRadius:11,fontWeight:700,fontSize:15,cursor:"pointer",transition:"background 0.15s",fontFamily:"Inter,sans-serif" },
};
const fo = e => e.target.style.borderColor="#16a34a";
const fb = e => e.target.style.borderColor="#e2e8f0";

function OTPInput({ onComplete }) {
  const [vals, setVals] = useState(["","","","","",""]);
  const refs = [useRef(),useRef(),useRef(),useRef(),useRef(),useRef()];

  const handle = (i, v) => {
    if (!/^\d?$/.test(v)) return;
    const next = [...vals]; next[i] = v; setVals(next);
    if (v && i < 5) refs[i+1].current?.focus();
    if (next.every(x=>x)) onComplete(next.join(""));
  };
  const handleKey = (i, e) => {
    if (e.key === "Backspace" && !vals[i] && i > 0) refs[i-1].current?.focus();
  };
  const handlePaste = (e) => {
    const txt = e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6);
    if (txt.length === 6) {
      const next = txt.split(""); setVals(next);
      refs[5].current?.focus();
      onComplete(txt);
    }
  };

  return (
    <div style={{display:"flex",gap:8,justifyContent:"center",margin:"8px 0"}}>
      {vals.map((v,i) => (
        <input key={i} ref={refs[i]} value={v} maxLength={1}
          onChange={e=>handle(i,e.target.value)}
          onKeyDown={e=>handleKey(i,e)} onPaste={handlePaste}
          style={{width:46,height:54,textAlign:"center",fontSize:22,fontWeight:700,
            border:`2px solid ${v?"#16a34a":"#e2e8f0"}`,borderRadius:12,
            background:v?"#f0fdf4":"#fff",color:"#0f172a",outline:"none",
            fontFamily:"monospace",transition:"all 0.15s"}}/>
      ))}
    </div>
  );
}

export default function AuthPage() {
  const [step, setStep] = useState("form"); // form | otp
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email:"", username:"", password:"" });
  const [pendingEmail, setPendingEmail] = useState("");
  const [otpError, setOtpError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const { login, register, verifyOtp, resendOtp } = useAuth();
  const navigate = useNavigate();
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c-1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const submitForm = async e => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      if (mode === "login") {
        await login(form.email, form.password);
        setPendingEmail(form.email);
        setStep("otp");
        setResendCooldown(30);
      } else {
        await register(form.email, form.username, form.password);
        setPendingEmail(form.email);
        setStep("otp");
        setResendCooldown(30);
      }
    } catch(err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const submitOtp = async (otp) => {
    setOtpError(""); setLoading(true);
    try {
      await verifyOtp(pendingEmail, otp, mode === "login" ? "login" : "verify");
      navigate("/");
    } catch(err) { setOtpError(err.message); setLoading(false); }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await resendOtp(pendingEmail, mode === "login" ? "login" : "verify");
      setResendCooldown(30);
      setOtpError("");
    } catch(err) { setOtpError(err.message); }
  };

  return (
    <div style={{display:"flex",minHeight:"100vh",background:"#fff",fontFamily:"Inter,sans-serif"}}>
      {/* LEFT — branding */}
      <div style={{width:"44%",background:"linear-gradient(160deg,#052e16 0%,#14532d 55%,#166534 100%)",display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"40px 44px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-70,right:-70,width:240,height:240,borderRadius:"50%",background:"rgba(255,255,255,0.04)"}}/>
        <div style={{position:"absolute",bottom:20,left:-90,width:320,height:320,borderRadius:"50%",background:"rgba(255,255,255,0.03)"}}/>
        <div style={{display:"flex",alignItems:"center",gap:10,position:"relative",zIndex:1}}>
          <div style={{width:36,height:36,background:"rgba(255,255,255,0.15)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontSize:18}}>💰</span>
          </div>
          <span style={{color:"#fff",fontWeight:700,fontSize:18,letterSpacing:"-0.02em"}}>SplitSmart</span>
        </div>
        <div style={{position:"relative",zIndex:1}}>
          <h1 style={{color:"#fff",fontSize:30,fontWeight:700,lineHeight:1.3,letterSpacing:"-0.03em",marginBottom:36}}>Split expenses.<br/>Not friendships.</h1>
          {[
            {e:"⚡",t:"Smart debt simplification",s:"Minimum transactions, always"},
            {e:"📊",t:"Spending analytics",s:"Category charts & leaderboards"},
            {e:"🔗",t:"Invite via link",s:"Share a link, no email needed"},
            {e:"📄",t:"PDF reports",s:"Download anytime, share easily"},
            {e:"🔒",t:"OTP-secured login",s:"Every login verified via email"},
          ].map((f,i) => (
            <div key={i} style={{display:"flex",gap:14,marginBottom:18}}>
              <div style={{width:32,height:32,background:"rgba(255,255,255,0.1)",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:14}}>{f.e}</div>
              <div>
                <p style={{color:"#fff",fontWeight:600,fontSize:13,marginBottom:1}}>{f.t}</p>
                <p style={{color:"rgba(255,255,255,0.5)",fontSize:12}}>{f.s}</p>
              </div>
            </div>
          ))}
        </div>
        <p style={{color:"rgba(255,255,255,0.25)",fontSize:11.5,position:"relative",zIndex:1}}>© 2025 Ahiwale · Bante · Bonde</p>
      </div>

      {/* RIGHT — form or OTP */}
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:32}}>
        {step === "form" ? (
          <div style={{width:"100%",maxWidth:380}}>
            <div style={{marginBottom:26}}>
              <h2 style={{fontSize:24,fontWeight:700,letterSpacing:"-0.025em",color:"#0f172a",marginBottom:6}}>
                {mode==="login"?"Welcome back":"Get started free"}
              </h2>
              <p style={{color:"#94a3b8",fontSize:14}}>{mode==="login"?"Sign in — we'll send a verification code":"Create account — we'll verify your email"}</p>
            </div>

            <div style={{display:"flex",background:"#f1f5f9",borderRadius:12,padding:3,marginBottom:22,gap:3}}>
              {[["login","Sign In"],["register","Create Account"]].map(([m,l]) => (
                <button key={m} onClick={() => {setMode(m);setError("");}}
                  style={{flex:1,height:34,border:"none",borderRadius:10,fontSize:13,fontWeight:500,cursor:"pointer",transition:"all 0.15s",
                    background:mode===m?"#fff":"transparent",color:mode===m?"#0f172a":"#64748b",
                    boxShadow:mode===m?"0 1px 4px rgba(0,0,0,0.1)":"none"}}>{l}</button>
              ))}
            </div>

            <form onSubmit={submitForm}>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div>
                  <label style={S.label}>Email address</label>
                  <input style={S.input} type="email" required value={form.email} onChange={set("email")} placeholder="you@example.com" onFocus={fo} onBlur={fb}/>
                </div>
                {mode==="register" && (
                  <div>
                    <label style={S.label}>Full name</label>
                    <input style={S.input} type="text" required value={form.username} onChange={set("username")} placeholder="Your name" onFocus={fo} onBlur={fb}/>
                  </div>
                )}
                <div>
                  <label style={S.label}>Password</label>
                  <input style={S.input} type="password" required value={form.password} onChange={set("password")} placeholder="Min 6 characters" onFocus={fo} onBlur={fb}/>
                </div>
              </div>
              {error && <div style={{marginTop:12,padding:"10px 14px",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,fontSize:13,color:"#dc2626"}}>{error}</div>}
              <button type="submit" disabled={loading} style={{...S.btn,marginTop:18,opacity:loading?0.7:1}}>
                {loading ? "Sending code…" : mode==="login" ? "Sign in →" : "Create account →"}
              </button>
            </form>

            <p style={{textAlign:"center",marginTop:16,fontSize:13,color:"#94a3b8"}}>
              {mode==="login"?"No account? ":"Have an account? "}
              <button onClick={()=>{setMode(mode==="login"?"register":"login");setError("");}}
                style={{background:"none",border:"none",color:"#16a34a",fontWeight:600,cursor:"pointer",fontSize:13}}>
                {mode==="login"?"Sign up free":"Sign in"}
              </button>
            </p>
          </div>
        ) : (
          /* OTP STEP */
          <div style={{width:"100%",maxWidth:380,textAlign:"center"}}>
            <div style={{width:64,height:64,background:"#f0fdf4",borderRadius:18,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:28}}>📬</div>
            <h2 style={{fontSize:22,fontWeight:700,color:"#0f172a",marginBottom:8}}>Check your email</h2>
            <p style={{color:"#64748b",fontSize:14,marginBottom:6}}>
              We sent a 6-digit code to
            </p>
            <p style={{color:"#0f172a",fontWeight:700,fontSize:15,marginBottom:28}}>{pendingEmail}</p>

            <OTPInput onComplete={submitOtp} key={resendCooldown < 29 ? "fresh" : "init"} />

            {otpError && (
              <div style={{marginTop:12,padding:"10px 14px",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,fontSize:13,color:"#dc2626"}}>
                {otpError}
              </div>
            )}

            {loading && <p style={{marginTop:12,fontSize:13,color:"#94a3b8"}}>Verifying…</p>}

            <div style={{marginTop:24,display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={handleResend} disabled={resendCooldown > 0}
                style={{background:"none",border:"1.5px solid #e2e8f0",borderRadius:10,height:42,fontSize:14,fontWeight:500,cursor:resendCooldown>0?"not-allowed":"pointer",color:resendCooldown>0?"#94a3b8":"#0f172a",transition:"all 0.15s"}}>
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
              </button>
              <button onClick={() => {setStep("form");setOtpError("");}}
                style={{background:"none",border:"none",fontSize:13,color:"#94a3b8",cursor:"pointer"}}>
                ← Use a different email
              </button>
            </div>

            <p style={{marginTop:20,fontSize:12,color:"#cbd5e1"}}>
              💡 No email? Check spam, or if running locally, the OTP prints to your terminal.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
