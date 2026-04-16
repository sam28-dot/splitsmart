import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../store/AuthContext";

const COLORS = ["#16a34a","#2563eb","#7c3aed","#dc2626","#d97706","#0891b2","#db2777","#65a30d"];
const getColor = (name="") => COLORS[name.charCodeAt(0) % COLORS.length];
const CAT_ICONS = {trip:"✈️",travel:"✈️",goa:"🏖️",holiday:"🏖️",rent:"🏠",flat:"🏠",house:"🏠",apartment:"🏠",food:"🍽️",dinner:"🍽️",lunch:"🍽️",party:"🎉",gym:"💪",cricket:"🏏",sport:"⚽"};
function groupIcon(name="") { const n=name.toLowerCase(); for(const[k,v] of Object.entries(CAT_ICONS)) if(n.includes(k)) return v; return "💰"; }

// ── Mini Calculator Component ──────────────────────────────────────────────
function Calculator() {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState(null);
  const [op, setOp] = useState(null);
  const [fresh, setFresh] = useState(true);

  const press = (val) => {
    if (val === "C") { setDisplay("0"); setPrev(null); setOp(null); setFresh(true); return; }
    if (val === "⌫") { setDisplay(d => d.length > 1 ? d.slice(0,-1) : "0"); return; }
    if (["+","-","×","÷"].includes(val)) {
      setPrev(parseFloat(display)); setOp(val); setFresh(true); return;
    }
    if (val === "=") {
      if (prev === null || !op) return;
      const cur = parseFloat(display);
      const res = op==="+" ? prev+cur : op==="-" ? prev-cur : op==="×" ? prev*cur : cur!==0 ? prev/cur : 0;
      setDisplay(String(parseFloat(res.toFixed(8))));
      setPrev(null); setOp(null); setFresh(true); return;
    }
    if (val === "." && display.includes(".")) return;
    setDisplay(d => fresh || d==="0" ? (val==="."?"0.":val) : d+val);
    setFresh(false);
  };

  const btns = ["C","⌫","÷","×","7","8","9","-","4","5","6","+","1","2","3","=","0","."];

  return (
    <div style={{position:"fixed",bottom:24,right:24,zIndex:40}}>
      {open && (
        <div style={{position:"absolute",bottom:56,right:0,background:"#fff",borderRadius:18,boxShadow:"0 8px 40px rgba(0,0,0,0.18)",border:"1px solid #e2e8f0",width:220,overflow:"hidden",animation:"scaleIn 0.15s ease"}}>
          <div style={{background:"linear-gradient(135deg,#052e16,#16a34a)",padding:"14px 16px 10px"}}>
            <p style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginBottom:2}}>{op ? `${prev} ${op}` : ""}</p>
            <p style={{fontSize:26,fontWeight:700,color:"#fff",textAlign:"right",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{display}</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:1,background:"#e2e8f0",padding:1}}>
            {btns.map(b => {
              const isOp=["+","-","×","÷"].includes(b);
              const isEq=b==="=";
              const isC=b==="C";
              return (
                <button key={b} onClick={()=>press(b)}
                  style={{height:46,border:"none",background:isEq?"#16a34a":isC?"#fef2f2":isOp?"#f0fdf4":"#fff",
                    color:isEq?"#fff":isC?"#dc2626":isOp?"#16a34a":"#0f172a",
                    fontSize:15,fontWeight:isEq||isOp?700:400,cursor:"pointer",transition:"background 0.1s",
                    gridColumn:b==="0"?"span 2":undefined}}
                  onMouseEnter={e=>e.target.style.filter="brightness(0.95)"}
                  onMouseLeave={e=>e.target.style.filter="none"}>
                  {b}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <button onClick={()=>setOpen(o=>!o)}
        style={{width:46,height:46,borderRadius:"50%",background:open?"#0f172a":"#16a34a",color:"#fff",border:"none",
          fontSize:18,cursor:"pointer",boxShadow:"0 4px 14px rgba(22,163,74,0.4)",transition:"all 0.2s",
          display:"flex",alignItems:"center",justifyContent:"center"}}>
        {open ? "✕" : "🧮"}
      </button>
    </div>
  );
}

export default function GroupsPage() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ name:"", description:"" });
  const [profileForm, setProfileForm] = useState({ username:"", avatar_color:"" });
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const AVATAR_COLORS = ["#16a34a","#2563eb","#7c3aed","#dc2626","#d97706","#0891b2","#db2777","#65a30d","#0f172a","#be185d"];

  useEffect(() => {
    api.getGroups().then(setGroups).catch(console.error).finally(()=>setLoading(false));
  }, []);

  useEffect(() => {
    if (user) setProfileForm({ username: user.username||"", avatar_color: user.avatar_color||"#16a34a" });
  }, [user]);

  const createGroup = async (e) => {
    e.preventDefault(); setCreating(true); setError("");
    try {
      const g = await api.createGroup(form);
      navigate(`/groups/${g.id}`);
    } catch(err){ setError(err.message); setCreating(false); }
  };

  const deleteGroup = async (group) => {
    setDeletingId(group.id);
    try {
      await api.deleteGroup(group.id);
      setGroups(gs => gs.filter(g => g.id !== group.id));
    } catch(err){ alert(err.message); }
    finally { setDeletingId(null); setShowDeleteConfirm(null); }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      await api.updateProfile(profileForm);
      setShowProfile(false);
      window.location.reload();
    } catch(err){ alert(err.message); }
  };

  const filtered = groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()));
  const totalSpend = groups.reduce((s,g)=>s+Number(g.total_spend||0),0);

  return (
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"Inter,sans-serif"}}>
      {/* TOPBAR */}
      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"0 28px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:30}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,background:"#16a34a",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          </div>
          <span style={{fontWeight:700,fontSize:17,letterSpacing:"-0.02em",color:"#0f172a"}}>SplitSmart</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setShowProfile(true)}
            style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"1px solid #e2e8f0",borderRadius:10,padding:"5px 12px 5px 6px",cursor:"pointer",transition:"all 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#bbf7d0"} onMouseLeave={e=>e.currentTarget.style.borderColor="#e2e8f0"}>
            <div style={{width:28,height:28,borderRadius:"50%",background:user?.avatar_color||"#16a34a",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:12,fontWeight:700}}>
              {(user?.username||"?")[0].toUpperCase()}
            </div>
            <span style={{fontSize:13,fontWeight:500,color:"#0f172a"}}>{user?.username}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <button onClick={logout} style={{background:"none",border:"1px solid #e2e8f0",color:"#64748b",borderRadius:8,padding:"5px 12px",fontSize:12.5,cursor:"pointer",fontWeight:500}}>Sign out</button>
        </div>
      </div>

      <div style={{maxWidth:800,margin:"0 auto",padding:"32px 24px"}}>
        <div style={{marginBottom:28}}>
          <h1 style={{fontSize:22,fontWeight:700,letterSpacing:"-0.025em",color:"#0f172a",marginBottom:4}}>Your groups</h1>
          <p style={{fontSize:13.5,color:"#94a3b8"}}>Manage expenses across all your groups</p>
        </div>

        {!loading && groups.length > 0 && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:28}} className="stagger">
            {[
              {label:"Total groups",value:groups.length,color:"#0f172a"},
              {label:"Members across groups",value:groups.reduce((s,g)=>s+Number(g.member_count||0),0),color:"#2563eb"},
              {label:"Total spend",value:`₹${totalSpend.toLocaleString("en-IN",{maximumFractionDigits:0})}`,color:"#16a34a"},
            ].map((s,i)=>(
              <div key={i} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:"16px 18px"}}>
                <p style={{fontSize:11.5,color:"#94a3b8",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>{s.label}</p>
                <p style={{fontSize:22,fontWeight:700,color:s.color}}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        <div style={{display:"flex",gap:10,marginBottom:20}}>
          <div style={{flex:1,position:"relative"}}>
            <svg style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#94a3b8",pointerEvents:"none"}} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search groups…"
              style={{width:"100%",height:40,paddingLeft:38,paddingRight:14,border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14,color:"#0f172a",background:"#fff",outline:"none"}}
              onFocus={e=>e.target.style.borderColor="#16a34a"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
          </div>
          <button onClick={()=>setShowCreate(true)}
            style={{height:40,paddingInline:16,background:"#16a34a",color:"#fff",border:"none",borderRadius:10,fontWeight:600,fontSize:13.5,cursor:"pointer",display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap",transition:"background 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.background="#15803d"} onMouseLeave={e=>e.currentTarget.style.background="#16a34a"}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            New group
          </button>
        </div>

        {loading ? (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[1,2,3].map(i=><div key={i} className="skeleton" style={{height:82,borderRadius:14}}/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{textAlign:"center",padding:"60px 0"}}>
            <div style={{fontSize:40,marginBottom:12}}>💸</div>
            <p style={{fontWeight:600,color:"#0f172a",marginBottom:6}}>{search?"No results found":"No groups yet"}</p>
            <p style={{fontSize:13.5,color:"#94a3b8",marginBottom:20}}>{search?"Try a different search term":"Create your first group to get started"}</p>
            {!search&&<button onClick={()=>setShowCreate(true)} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontWeight:600,fontSize:14,cursor:"pointer"}}>Create a group</button>}
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}} className="stagger">
            {filtered.map(group=>(
              <div key={group.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,display:"flex",alignItems:"center",gap:16,padding:"16px 20px",transition:"all 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#bbf7d0";e.currentTarget.style.boxShadow="0 2px 12px rgba(22,163,74,0.08)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="#e2e8f0";e.currentTarget.style.boxShadow="none";}}>
                {/* Clickable main area */}
                <div onClick={()=>navigate(`/groups/${group.id}`)} style={{display:"flex",alignItems:"center",gap:16,flex:1,cursor:"pointer",minWidth:0}}>
                  <div style={{width:44,height:44,background:"#f0fdf4",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
                    {groupIcon(group.name)}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontWeight:600,fontSize:15,color:"#0f172a",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{group.name}</p>
                    <p style={{fontSize:12.5,color:"#94a3b8"}}>{group.member_count} member{group.member_count!==1?"s":""} · created {new Date(group.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</p>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <p style={{fontSize:13,color:"#94a3b8",marginBottom:2}}>total spend</p>
                    <p style={{fontSize:15,fontWeight:700,color:"#0f172a"}}>₹{Number(group.total_spend||0).toLocaleString("en-IN",{maximumFractionDigits:0})}</p>
                  </div>
                  <svg style={{color:"#cbd5e1",flexShrink:0}} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </div>
                {/* Delete button */}
                <button onClick={e=>{e.stopPropagation();setShowDeleteConfirm(group);}}
                  style={{width:32,height:32,border:"1px solid #fee2e2",borderRadius:8,background:"#fff",color:"#ef4444",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="#fef2f2";}} onMouseLeave={e=>{e.currentTarget.style.background="#fff";}}
                  title="Delete group">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create Group Modal ── */}
      {showCreate&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,padding:16}} onClick={e=>{if(e.target===e.currentTarget)setShowCreate(false);}}>
          <div style={{background:"#fff",borderRadius:18,padding:"28px 28px 24px",width:"100%",maxWidth:420,boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}} className="scale-in">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
              <h2 style={{fontSize:18,fontWeight:700,color:"#0f172a"}}>Create group</h2>
              <button onClick={()=>setShowCreate(false)} style={{background:"#f1f5f9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b"}}>✕</button>
            </div>
            <form onSubmit={createGroup}>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <label style={{display:"flex",flexDirection:"column",gap:5}}>
                  <span style={{fontSize:13,fontWeight:500,color:"#475569"}}>Group name <span style={{color:"#ef4444"}}>*</span></span>
                  <input required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Trip to Goa, Apartment Rent…"
                    style={{height:42,padding:"0 14px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14,color:"#0f172a",outline:"none",transition:"border 0.15s"}}
                    onFocus={e=>e.target.style.borderColor="#16a34a"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
                </label>
                <label style={{display:"flex",flexDirection:"column",gap:5}}>
                  <span style={{fontSize:13,fontWeight:500,color:"#475569"}}>Description <span style={{color:"#94a3b8"}}>(optional)</span></span>
                  <input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="What's this group for?"
                    style={{height:42,padding:"0 14px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14,color:"#0f172a",outline:"none",transition:"border 0.15s"}}
                    onFocus={e=>e.target.style.borderColor="#16a34a"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
                </label>
              </div>
              {error&&<p style={{marginTop:10,fontSize:13,color:"#dc2626"}}>{error}</p>}
              <div style={{display:"flex",gap:10,marginTop:22}}>
                <button type="button" onClick={()=>setShowCreate(false)} style={{flex:1,height:42,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,fontSize:14,fontWeight:500,color:"#475569",cursor:"pointer"}}>Cancel</button>
                <button type="submit" disabled={creating} style={{flex:1,height:42,background:creating?"#86efac":"#16a34a",color:"#fff",border:"none",borderRadius:10,fontSize:14,fontWeight:600,cursor:creating?"not-allowed":"pointer",transition:"background 0.15s"}}>
                  {creating?"Creating…":"Create group"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {showDeleteConfirm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,padding:16}} onClick={e=>{if(e.target===e.currentTarget)setShowDeleteConfirm(null);}}>
          <div style={{background:"#fff",borderRadius:18,padding:"28px",width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}} className="scale-in">
            <div style={{width:48,height:48,background:"#fef2f2",borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:22}}>🗑️</div>
            <h2 style={{fontSize:18,fontWeight:700,color:"#0f172a",textAlign:"center",marginBottom:8}}>Delete group?</h2>
            <p style={{fontSize:14,color:"#64748b",textAlign:"center",marginBottom:24}}>
              "<strong>{showDeleteConfirm.name}</strong>" and all its expenses will be permanently deleted. This cannot be undone.
            </p>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setShowDeleteConfirm(null)} style={{flex:1,height:42,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,fontSize:14,fontWeight:500,color:"#475569",cursor:"pointer"}}>Cancel</button>
              <button onClick={()=>deleteGroup(showDeleteConfirm)} disabled={deletingId===showDeleteConfirm.id}
                style={{flex:1,height:42,background:"#dc2626",color:"#fff",border:"none",borderRadius:10,fontSize:14,fontWeight:600,cursor:"pointer"}}>
                {deletingId===showDeleteConfirm.id?"Deleting…":"Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Profile Modal ── */}
      {showProfile&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,padding:16}} onClick={e=>{if(e.target===e.currentTarget)setShowProfile(false);}}>
          <div style={{background:"#fff",borderRadius:18,padding:"28px",width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}} className="scale-in">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
              <h2 style={{fontSize:18,fontWeight:700,color:"#0f172a"}}>Edit profile</h2>
              <button onClick={()=>setShowProfile(false)} style={{background:"#f1f5f9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",color:"#64748b"}}>✕</button>
            </div>
            {/* Avatar preview */}
            <div style={{display:"flex",justifyContent:"center",marginBottom:20}}>
              <div style={{width:64,height:64,borderRadius:"50%",background:profileForm.avatar_color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:26,fontWeight:700}}>
                {(profileForm.username||"?")[0].toUpperCase()}
              </div>
            </div>
            <form onSubmit={saveProfile}>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <label style={{display:"flex",flexDirection:"column",gap:5}}>
                  <span style={{fontSize:13,fontWeight:500,color:"#475569"}}>Display name</span>
                  <input value={profileForm.username} onChange={e=>setProfileForm(f=>({...f,username:e.target.value}))} required
                    style={{height:42,padding:"0 14px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14,color:"#0f172a",outline:"none"}}
                    onFocus={e=>e.target.style.borderColor="#16a34a"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
                </label>
                <div>
                  <span style={{fontSize:13,fontWeight:500,color:"#475569",display:"block",marginBottom:8}}>Avatar color</span>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {AVATAR_COLORS.map(c=>(
                      <button key={c} type="button" onClick={()=>setProfileForm(f=>({...f,avatar_color:c}))}
                        style={{width:32,height:32,borderRadius:"50%",background:c,border:`3px solid ${profileForm.avatar_color===c?"#0f172a":"transparent"}`,cursor:"pointer",transition:"border 0.15s"}}/>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:10,marginTop:22}}>
                <button type="button" onClick={()=>setShowProfile(false)} style={{flex:1,height:42,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,fontSize:14,fontWeight:500,color:"#475569",cursor:"pointer"}}>Cancel</button>
                <button type="submit" style={{flex:1,height:42,background:"#16a34a",color:"#fff",border:"none",borderRadius:10,fontSize:14,fontWeight:600,cursor:"pointer"}}>Save changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Calculator />
    </div>
  );
}
