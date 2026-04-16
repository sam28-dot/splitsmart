import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useAuth } from "../store/AuthContext";
import AddExpenseModal from "../components/expenses/AddExpenseModal";
import SettleUpModal from "../components/settlements/SettleUpModal";

// ── Constants ────────────────────────────────────────────────────────────────
const COLORS=["#16a34a","#2563eb","#7c3aed","#dc2626","#d97706","#0891b2","#db2777","#65a30d"];
const gc=(n="")=>COLORS[(n||"?").charCodeAt(0)%COLORS.length];
const CAT={food:{i:"🍽️",bg:"#fef3c7",tx:"#d97706"},travel:{i:"✈️",bg:"#dbeafe",tx:"#2563eb"},rent:{i:"🏠",bg:"#f0fdf4",tx:"#16a34a"},entertainment:{i:"🎬",bg:"#fce7f3",tx:"#db2777"},utilities:{i:"💡",bg:"#fef9c3",tx:"#ca8a04"},general:{i:"💳",bg:"#f1f5f9",tx:"#64748b"}};
const FREQ_LABEL={weekly:"Every week",monthly:"Every month"};

function Av({name,size=32}){return<div style={{width:size,height:size,borderRadius:"50%",background:gc(name||"?"),display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:size*0.38,flexShrink:0}}>{(name||"?")[0].toUpperCase()}</div>;}
function fmtDate(d){const dt=new Date(d+"T00:00:00"),n=new Date(),y=new Date();y.setDate(y.getDate()-1);if(dt.toDateString()===n.toDateString())return"Today";if(dt.toDateString()===y.toDateString())return"Yesterday";return dt.toLocaleDateString("en-IN",{day:"numeric",month:"short"});}
function fmtTime(ts){return new Date(ts).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:true});}
function inputSx(focus){return{height:42,padding:"0 14px",border:`1.5px solid ${focus?"#16a34a":"#e2e8f0"}`,borderRadius:10,fontSize:14,color:"#0f172a",background:"#fff",outline:"none",width:"100%",fontFamily:"Inter,sans-serif"};}

const TABS=[{k:"expenses",l:"💸 Expenses"},{k:"balances",l:"⚖️ Balances"},{k:"analytics",l:"📊 Analytics"},{k:"recurring",l:"🔄 Recurring"},{k:"members",l:"👥 Members"},{k:"activity",l:"📋 Activity"}];

// ── Mini Calculator ───────────────────────────────────────────────────────────
function Calculator(){
  const[open,setOpen]=useState(false);const[display,setDisplay]=useState("0");const[prev,setPrev]=useState(null);const[op,setOp]=useState(null);const[fresh,setFresh]=useState(true);
  const press=(val)=>{
    if(val==="C"){setDisplay("0");setPrev(null);setOp(null);setFresh(true);return;}
    if(val==="⌫"){setDisplay(d=>d.length>1?d.slice(0,-1):"0");return;}
    if(["+","-","×","÷"].includes(val)){setPrev(parseFloat(display));setOp(val);setFresh(true);return;}
    if(val==="="){if(prev===null||!op)return;const cur=parseFloat(display);const res=op==="+"?prev+cur:op==="-"?prev-cur:op==="×"?prev*cur:cur!==0?prev/cur:0;setDisplay(String(parseFloat(res.toFixed(8))));setPrev(null);setOp(null);setFresh(true);return;}
    if(val==="."&&display.includes("."))return;
    setDisplay(d=>fresh||d==="0"?(val==="."?"0.":val):d+val);setFresh(false);
  };
  const btns=["C","⌫","÷","×","7","8","9","-","4","5","6","+","1","2","3","=","0","."];
  return(
    <div style={{position:"fixed",bottom:88,right:24,zIndex:40}}>
      {open&&(
        <div style={{position:"absolute",bottom:56,right:0,background:"#fff",borderRadius:18,boxShadow:"0 8px 40px rgba(0,0,0,0.18)",border:"1px solid #e2e8f0",width:220,overflow:"hidden"}}>
          <div style={{background:"linear-gradient(135deg,#052e16,#16a34a)",padding:"14px 16px 10px"}}>
            <p style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginBottom:2}}>{op?`${prev} ${op}`:""}</p>
            <p style={{fontSize:26,fontWeight:700,color:"#fff",textAlign:"right",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{display}</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:1,background:"#e2e8f0",padding:1}}>
            {btns.map(b=>{const isOp=["+","-","×","÷"].includes(b);const isEq=b==="=";const isC=b==="C";return(
              <button key={b} onClick={()=>press(b)} style={{height:46,border:"none",background:isEq?"#16a34a":isC?"#fef2f2":isOp?"#f0fdf4":"#fff",color:isEq?"#fff":isC?"#dc2626":isOp?"#16a34a":"#0f172a",fontSize:15,fontWeight:isEq||isOp?700:400,cursor:"pointer",gridColumn:b==="0"?"span 2":undefined}}
                onMouseEnter={e=>e.target.style.filter="brightness(0.95)"} onMouseLeave={e=>e.target.style.filter="none"}>{b}</button>
            );})}
          </div>
        </div>
      )}
      <button onClick={()=>setOpen(o=>!o)} style={{width:46,height:46,borderRadius:"50%",background:open?"#0f172a":"#16a34a",color:"#fff",border:"none",fontSize:18,cursor:"pointer",boxShadow:"0 4px 14px rgba(22,163,74,0.4)",transition:"all 0.2s",display:"flex",alignItems:"center",justifyContent:"center"}}>
        {open?"✕":"🧮"}
      </button>
    </div>
  );
}

// ── Offline Queue ─────────────────────────────────────────────────────────────
const QUEUE_KEY="splitsmart_offline_queue";
function getQueue(){try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||"[]");}catch{return[];}}
function addToQueue(item){const q=getQueue();q.push({...item,id:Date.now()});localStorage.setItem(QUEUE_KEY,JSON.stringify(q));}
function clearQueue(){localStorage.removeItem(QUEUE_KEY);}

// ── Share / Reminder ──────────────────────────────────────────────────────────
function SharePanel({group,balances,currentUserId,members}){
  const[copied,setCopied]=useState(false);
  const myBal=balances?.current_user_summary;
  const txns=balances?.transactions||[];

  const summaryText=()=>{
    const lines=[`💰 *SplitSmart — ${group.name}*\n`];
    txns.forEach(t=>{lines.push(`• ${t.from_name} → ${t.to_name}: ₹${t.amount.toFixed(2)}`);});
    if(!txns.length)lines.push("✅ All settled up!");
    lines.push(`\n_Managed via SplitSmart_`);
    return lines.join("\n");
  };

  const shareWhatsApp=()=>{const text=encodeURIComponent(summaryText());window.open(`https://wa.me/?text=${text}`,"_blank");};

  const sendReminder=(member)=>{
    const debt=txns.find(t=>t.from_user_id===member.user_id);
    if(!debt){alert("This member has no outstanding debt.");return;}
    const text=encodeURIComponent(`Hey ${member.name}! 👋\nJust a friendly reminder — you owe *₹${debt.amount.toFixed(2)}* in the "${group.name}" group on SplitSmart.\nPlease settle up when you can! 🙏`);
    window.open(`https://wa.me/?text=${text}`,"_blank");
  };

  const copyUPI=(member)=>{
    const debt=txns.find(t=>t.to_user_id===member.user_id);
    if(!debt){alert("No payment needed to this member.");return;}
    // Generic UPI deep link — user fills in their UPI ID
    const upiLink=`upi://pay?pa=YOURUPI@upi&pn=${encodeURIComponent(member.name)}&am=${debt.amount.toFixed(2)}&tn=${encodeURIComponent(group.name+" split")}`;
    navigator.clipboard.writeText(upiLink);
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  };

  const debtors=txns.filter(t=>t.from_user_id!==currentUserId);
  const myDebt=txns.find(t=>t.from_user_id===currentUserId);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* WhatsApp share */}
      <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:14,padding:"14px 16px"}}>
        <p style={{fontSize:13,fontWeight:700,color:"#15803d",marginBottom:8}}>📤 Share settlement summary</p>
        <p style={{fontSize:12.5,color:"#16a34a",marginBottom:10}}>Share who owes what via WhatsApp</p>
        <button onClick={shareWhatsApp} style={{height:36,padding:"0 16px",background:"#25D366",color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:16}}>📱</span> Share via WhatsApp
        </button>
      </div>

      {/* UPI Pay button */}
      {myDebt&&(
        <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:14,padding:"14px 16px"}}>
          <p style={{fontSize:13,fontWeight:700,color:"#1d4ed8",marginBottom:8}}>💳 Pay via UPI</p>
          <p style={{fontSize:12.5,color:"#2563eb",marginBottom:10}}>You owe ₹{myDebt.amount.toFixed(2)} to {myDebt.to_name}</p>
          <button onClick={()=>{const upi=`upi://pay?pn=${encodeURIComponent(myDebt.to_name)}&am=${myDebt.amount.toFixed(2)}&tn=${encodeURIComponent(group.name)}`;window.open(upi);}}
            style={{height:36,padding:"0 16px",background:"#2563eb",color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer"}}>
            Open UPI App →
          </button>
        </div>
      )}

      {/* Send reminders */}
      {debtors.length>0&&(
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:"14px 16px"}}>
          <p style={{fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:10}}>🔔 Send payment reminders</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {members.filter(m=>txns.some(t=>t.from_user_id===m.user_id&&t.to_user_id===currentUserId)).map(m=>(
              <div key={m.user_id} style={{display:"flex",alignItems:"center",gap:10}}>
                <Av name={m.name} size={30}/>
                <div style={{flex:1}}>
                  <p style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{m.name}</p>
                  <p style={{fontSize:11.5,color:"#ef4444"}}>Owes ₹{txns.find(t=>t.from_user_id===m.user_id)?.amount.toFixed(2)}</p>
                </div>
                <button onClick={()=>sendReminder(m)} style={{height:30,padding:"0 12px",background:"#fef3c7",border:"none",borderRadius:8,fontSize:12,fontWeight:600,color:"#d97706",cursor:"pointer"}}>
                  Remind 📱
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Debt Pressure Indicator ───────────────────────────────────────────────────
function DebtPressure({balances}){
  if(!balances)return null;
  const vals=Object.values(balances.user_balances);
  const totalDebt=vals.filter(v=>v.net_balance<0).reduce((s,v)=>s+Math.abs(v.net_balance),0);
  if(totalDebt<0.01)return null;
  const debtors=vals.filter(v=>v.net_balance<-0.01).sort((a,b)=>a.net_balance-b.net_balance);
  const maxDebt=Math.abs(debtors[0]?.net_balance||1);
  return(
    <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:"14px 16px",marginBottom:14}}>
      <p style={{fontSize:11.5,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Debt pressure</p>
      {debtors.map(d=>{
        const pct=(Math.abs(d.net_balance)/maxDebt)*100;
        const color=pct>75?"#ef4444":pct>40?"#f59e0b":"#16a34a";
        return(
          <div key={d.name} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={{fontSize:13,fontWeight:500,color:"#0f172a"}}>{d.name}</span>
              <span style={{fontSize:13,fontWeight:700,color}}>{pct>75?"🔴":"pct>40"?"🟡":"🟢"} ₹{Math.abs(d.net_balance).toFixed(2)}</span>
            </div>
            <div style={{height:6,background:"#f1f5f9",borderRadius:99}}>
              <div style={{height:6,background:color,borderRadius:99,width:`${pct}%`,transition:"width 0.5s ease"}}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Expense Row ───────────────────────────────────────────────────────────────
function ExpRow({exp,uid,groupId,onEdit,onDelete,suggestion}){
  const[open,setOpen]=useState(false);const[comments,setComments]=useState(null);const[newComment,setNewComment]=useState("");const[posting,setPosting]=useState(false);
  const meta=CAT[exp.category]||CAT.general;const iPaid=exp.paid_by_user_id===uid;
  const myShare=exp.splits?.find(s=>s.user_id===uid);const net=iPaid?exp.amount-(myShare?.amount||0):-(myShare?.amount||0);
  const loadComments=async()=>{if(comments!==null)return;const d=await api.getComments(groupId,exp.id).catch(()=>[]);setComments(d||[]);};
  const postComment=async()=>{if(!newComment.trim())return;setPosting(true);try{const c=await api.addComment(groupId,exp.id,newComment);setComments(cs=>[...(cs||[]),{...c,username:"You"}]);setNewComment("");}finally{setPosting(false);}};
  return(
    <div style={{background:"#fff",border:`1px solid ${open?"#bbf7d0":"#e2e8f0"}`,borderRadius:14,overflow:"hidden",transition:"border 0.15s"}}>
      <div style={{padding:"13px 15px",display:"flex",alignItems:"center",gap:13,cursor:"pointer"}} onClick={()=>{setOpen(o=>!o);if(!open)loadComments();}}>
        <div style={{width:38,height:38,background:meta.bg,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{meta.i}</div>
        <div style={{flex:1,minWidth:0}}>
          <p style={{fontWeight:600,fontSize:13.5,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:2}}>{exp.description}</p>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <Av name={exp.paid_by_name} size={16}/>
            <p style={{fontSize:11.5,color:"#94a3b8"}}>{iPaid?"You paid":"Paid by "+exp.paid_by_name}
              {exp.comment_count>0&&<span style={{marginLeft:6,fontSize:11,background:"#f1f5f9",padding:"1px 6px",borderRadius:99,color:"#64748b"}}>💬 {exp.comment_count}</span>}
            </p>
          </div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <p style={{fontWeight:700,fontSize:14.5,color:"#0f172a",marginBottom:1}}>₹{exp.amount.toFixed(2)}</p>
          {myShare&&<p style={{fontSize:11.5,fontWeight:600,color:net>0?"#16a34a":net<0?"#ef4444":"#94a3b8"}}>{net>0?`+₹${net.toFixed(2)}`:net<0?`-₹${Math.abs(net).toFixed(2)}`:"settled"}</p>}
        </div>
        <svg style={{color:"#cbd5e1",flexShrink:0,transform:open?"rotate(180deg)":"none",transition:"transform 0.2s"}} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      {open&&(
        <div style={{borderTop:"1px solid #f1f5f9"}}>
          <div style={{padding:"10px 15px",display:"flex",gap:8}}>
            <button onClick={()=>{setOpen(false);onEdit();}} style={{flex:1,height:30,background:"#eff6ff",border:"none",borderRadius:8,fontSize:12,fontWeight:600,color:"#2563eb",cursor:"pointer"}}>Edit</button>
            <button onClick={()=>{setOpen(false);onDelete();}} style={{flex:1,height:30,background:"#fef2f2",border:"none",borderRadius:8,fontSize:12,fontWeight:600,color:"#dc2626",cursor:"pointer"}}>Delete</button>
          </div>
          <div style={{padding:"0 15px 14px"}}>
            <p style={{fontSize:11.5,fontWeight:600,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Comments</p>
            {(comments||[]).map((c,i)=>(
              <div key={i} style={{display:"flex",gap:8,marginBottom:8}}>
                <Av name={c.username} size={22}/>
                <div style={{background:"#f8fafc",borderRadius:10,padding:"6px 10px",flex:1}}>
                  <p style={{fontSize:11.5,fontWeight:600,color:"#0f172a",marginBottom:2}}>{c.username}</p>
                  <p style={{fontSize:13,color:"#475569"}}>{c.body}</p>
                </div>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <input value={newComment} onChange={e=>setNewComment(e.target.value)} placeholder="Add a comment…" onKeyDown={e=>{if(e.key==="Enter")postComment();}}
                style={{flex:1,height:34,padding:"0 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:13,outline:"none",fontFamily:"Inter,sans-serif"}}/>
              <button onClick={postComment} disabled={posting||!newComment.trim()} style={{height:34,padding:"0 12px",background:"#16a34a",color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:600,cursor:"pointer",opacity:posting||!newComment.trim()?0.5:1}}>Post</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Expenses Tab ──────────────────────────────────────────────────────────────
function ExpensesTab({expenses,uid,groupId,onEdit,onDelete,suggestions,onAddExpense}){
  const[offlineQueue]=useState(getQueue);
  const sugMap=Object.fromEntries((suggestions||[]).map(s=>[s.category,s]));

  if(!expenses.length&&!offlineQueue.length)return(
    <div style={{textAlign:"center",padding:"48px 0"}}>
      <div style={{fontSize:36,marginBottom:10}}>💸</div>
      <p style={{fontWeight:600,color:"#0f172a",marginBottom:4}}>No expenses yet</p>
      <p style={{fontSize:13,color:"#94a3b8"}}>Tap "Add expense" below to get started</p>
    </div>
  );

  const grouped={};expenses.forEach(e=>{(grouped[e.date]=grouped[e.date]||[]).push(e);});
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {offlineQueue.length>0&&(
        <div style={{background:"#fef3c7",border:"1px solid #fcd34d",borderRadius:12,padding:"12px 14px"}}>
          <p style={{fontSize:13,fontWeight:600,color:"#d97706"}}>⚡ {offlineQueue.length} expense(s) queued offline — will sync when online</p>
        </div>
      )}
      {Object.entries(grouped).sort(([a],[b])=>b.localeCompare(a)).map(([date,exps])=>(
        <div key={date}>
          <p style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:7}}>{fmtDate(date)}</p>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {exps.map(e=><ExpRow key={e.id} exp={e} uid={uid} groupId={groupId} onEdit={()=>onEdit(e)} onDelete={()=>onDelete(e.id)} suggestion={sugMap[e.category]}/>)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Balances Tab ──────────────────────────────────────────────────────────────
function BalancesTab({balances,uid,members,onSettle,group}){
  if(!balances)return null;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <DebtPressure balances={balances}/>
      <div>
        <p style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Member balances</p>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {Object.entries(balances.user_balances).map(([id,info])=>{
            const net=info.net_balance,isMe=parseInt(id)===uid;
            return(
              <div key={id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:13,padding:"13px 15px",display:"flex",alignItems:"center",gap:13}}>
                <Av name={info.name} size={36}/>
                <div style={{flex:1}}><p style={{fontSize:13.5,fontWeight:600,color:"#0f172a"}}>{isMe?"You":info.name}</p><p style={{fontSize:11.5,color:"#94a3b8"}}>paid ₹{info.paid.toFixed(2)}</p></div>
                <div style={{textAlign:"right"}}>
                  {Math.abs(net)<0.01?<span style={{fontSize:11.5,background:"#f1f5f9",color:"#64748b",padding:"3px 10px",borderRadius:99,fontWeight:600}}>Settled ✓</span>
                    :net>0?<div><p style={{fontSize:14.5,fontWeight:700,color:"#16a34a"}}>+₹{net.toFixed(2)}</p><p style={{fontSize:11,color:"#86efac"}}>gets back</p></div>
                    :<div><p style={{fontSize:14.5,fontWeight:700,color:"#ef4444"}}>-₹{Math.abs(net).toFixed(2)}</p><p style={{fontSize:11,color:"#fca5a5"}}>owes</p></div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {balances.transactions.length>0&&(
        <div>
          <p style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Optimal settlements ({balances.transactions.length} tx)</p>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {balances.transactions.map((t,i)=>{const isMyPay=t.from_user_id===uid,isMyRec=t.to_user_id===uid;return(
              <div key={i} style={{background:isMyPay?"#fef2f2":isMyRec?"#f0fdf4":"#fff",border:`1px solid ${isMyPay?"#fecaca":isMyRec?"#bbf7d0":"#e2e8f0"}`,borderRadius:13,padding:"13px 15px",display:"flex",alignItems:"center",gap:12}}>
                <Av name={t.from_name} size={32}/>
                <div style={{flex:1}}><p style={{fontSize:13,color:"#0f172a"}}><span style={{fontWeight:700}}>{isMyPay?"You":t.from_name}</span><span style={{color:"#94a3b8",margin:"0 6px"}}>→</span><span style={{fontWeight:700}}>{isMyRec?"You":t.to_name}</span></p></div>
                <p style={{fontSize:14.5,fontWeight:700,color:isMyPay?"#dc2626":isMyRec?"#16a34a":"#0f172a"}}>₹{t.amount.toFixed(2)}</p>
              </div>
            );})}
          </div>
          {balances.current_user_summary.you_owe>0.01&&<button onClick={onSettle} style={{width:"100%",marginTop:12,height:44,background:"#16a34a",color:"#fff",border:"none",borderRadius:12,fontWeight:700,fontSize:14,cursor:"pointer"}}>Record settlement ✓</button>}
        </div>
      )}
      {/* Share panel */}
      <SharePanel group={group} balances={balances} currentUserId={uid} members={members}/>
      {balances.transactions.length===0&&<div style={{textAlign:"center",padding:"20px 0"}}><div style={{fontSize:32,marginBottom:8}}>🎉</div><p style={{fontWeight:700,color:"#0f172a"}}>All settled up!</p></div>}
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────
function AnalyticsTab({groupId}){
  const[data,setData]=useState(null);const[loading,setLoading]=useState(true);
  useEffect(()=>{api.getAnalytics(groupId).then(setData).catch(()=>{}).finally(()=>setLoading(false));},[groupId]);
  if(loading)return<div style={{display:"flex",flexDirection:"column",gap:8}}>{[1,2,3].map(i=><div key={i} style={{height:80,background:"#f1f5f9",borderRadius:14}}/>)}</div>;
  if(!data)return null;
  const maxCat=Math.max(...(data.by_category||[]).map(c=>c.total),1);
  const maxMonth=Math.max(...(data.monthly||[]).map(m=>m.total),1);
  const totalSpend=(data.by_category||[]).reduce((s,c)=>s+c.total,0);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      {data.biggest&&(
        <div style={{background:"linear-gradient(135deg,#052e16,#16a34a)",borderRadius:16,padding:"18px 20px",color:"#fff"}}>
          <p style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.7,marginBottom:6}}>Biggest expense 🏆</p>
          <p style={{fontSize:18,fontWeight:700,marginBottom:4}}>{data.biggest.description}</p>
          <p style={{fontSize:24,fontWeight:800,letterSpacing:"-0.02em"}}>₹{data.biggest.amount.toFixed(2)}</p>
          <p style={{fontSize:12,opacity:0.6,marginTop:4}}>Paid by {data.biggest.paid_by} · {data.biggest.date}</p>
        </div>
      )}
      {/* Spending insights */}
      {(data.by_member||[]).length>0&&(
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:"14px 16px"}}>
          <p style={{fontSize:11.5,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>💡 Spending insights</p>
          {data.by_member.map((m,i)=>{
            const pct=totalSpend>0?(m.paid/totalSpend*100):0;
            return(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <Av name={m.username} size={28}/>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:13,fontWeight:500,color:"#0f172a"}}>{m.username}</span>
                    <span style={{fontSize:12,color:"#64748b"}}>{pct.toFixed(0)}% · {m.expense_count} expenses</span>
                  </div>
                  <div style={{height:5,background:"#f1f5f9",borderRadius:99}}>
                    <div style={{height:5,background:"#16a34a",borderRadius:99,width:`${pct}%`,transition:"width 0.5s"}}/>
                  </div>
                </div>
                <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>₹{m.paid.toFixed(0)}</span>
              </div>
            );
          })}
        </div>
      )}
      <div>
        <p style={{fontSize:11.5,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Spend by category</p>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {(data.by_category||[]).map((c,i)=>{const meta=CAT[c.category]||CAT.general;const pct=(c.total/maxCat)*100;return(
            <div key={i} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"12px 14px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:16}}>{meta.i}</span>
                  <span style={{fontSize:13.5,fontWeight:600,color:"#0f172a",textTransform:"capitalize"}}>{c.category}</span>
                  <span style={{fontSize:11,background:meta.bg,color:meta.tx,padding:"2px 8px",borderRadius:99,fontWeight:600}}>{c.count} exp</span>
                </div>
                <span style={{fontSize:14,fontWeight:700,color:"#0f172a"}}>₹{c.total.toFixed(0)}</span>
              </div>
              <div style={{height:6,background:"#f1f5f9",borderRadius:99}}><div style={{height:6,background:meta.tx,borderRadius:99,width:`${pct}%`,transition:"width 0.6s ease"}}/></div>
            </div>
          );})}
        </div>
      </div>
      {(data.monthly||[]).length>0&&(
        <div>
          <p style={{fontSize:11.5,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Monthly trend</p>
          <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:"16px"}}>
            <div style={{display:"flex",alignItems:"flex-end",gap:8,height:100}}>
              {data.monthly.map((m,i)=>{const h=Math.max((m.total/maxMonth)*88,4);return(
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <span style={{fontSize:11,color:"#94a3b8"}}>₹{(m.total/1000).toFixed(0)}k</span>
                  <div style={{width:"100%",height:h,background:"#16a34a",borderRadius:"6px 6px 0 0",opacity:0.85,transition:"height 0.4s ease"}}/>
                  <span style={{fontSize:10,color:"#94a3b8"}}>{m.month.slice(5)}</span>
                </div>
              );})}
            </div>
          </div>
        </div>
      )}
      {(data.leaderboard||[]).length>0&&(
        <div>
          <p style={{fontSize:11.5,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Settlement leaderboard 🏅</p>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {data.leaderboard.map((m,i)=>(
              <div key={i} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:16,width:24,textAlign:"center"}}>{["🥇","🥈","🥉"][i]||"👤"}</span>
                <Av name={m.username} size={32}/>
                <div style={{flex:1}}><p style={{fontSize:13.5,fontWeight:600,color:"#0f172a"}}>{m.username}</p><p style={{fontSize:12,color:"#94a3b8"}}>{m.settlements} settlement{m.settlements!==1?"s":""}</p></div>
                <p style={{fontSize:14,fontWeight:700,color:"#16a34a"}}>₹{m.total_settled.toFixed(0)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Recurring Tab ─────────────────────────────────────────────────────────────
function RecurringTab({groupId,members,currentUserId}){
  const[list,setList]=useState([]);const[loading,setLoading]=useState(true);const[showAdd,setShowAdd]=useState(false);
  const[form,setForm]=useState({description:"",amount:"",frequency:"monthly",category:"general",paid_by_user_id:currentUserId,participants:[]});
  const[applying,setApplying]=useState(null);
  const load=()=>api.getRecurring(groupId).then(setList).catch(()=>{}).finally(()=>setLoading(false));
  useEffect(()=>{load();},[groupId]);

  const applyNow=async(r)=>{setApplying(r.id);try{await api.applyRecurring(groupId,r.id);load();alert(`✓ "${r.description}" added as expense!`);}catch(e){alert(e.message);}finally{setApplying(null);}};
  const del=async(r)=>{if(!window.confirm(`Delete recurring "${r.description}"?`))return;await api.deleteRecurring(groupId,r.id);load();};
  const save=async(e)=>{e.preventDefault();try{await api.createRecurring(groupId,{...form,amount:parseFloat(form.amount),participants:members.map(m=>({user_id:m.user_id}))});setShowAdd(false);load();}catch(err){alert(err.message);}};

  const isDue=(next_due)=>new Date(next_due+"T00:00:00")<=new Date();

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <p style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em"}}>Recurring expenses</p>
        <button onClick={()=>setShowAdd(s=>!s)} style={{height:32,padding:"0 14px",background:"#16a34a",color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:600,cursor:"pointer"}}>+ Add recurring</button>
      </div>

      {showAdd&&(
        <form onSubmit={save} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:14,padding:"16px"}}>
          <p style={{fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:12}}>New recurring expense</p>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <input required value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Description (e.g. Monthly rent)"
              style={{height:40,padding:"0 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:14,outline:"none",fontFamily:"Inter,sans-serif"}} onFocus={e=>e.target.style.borderColor="#16a34a"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <input required type="number" step="0.01" min="1" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="Amount (₹)"
                style={{height:40,padding:"0 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:14,outline:"none",fontFamily:"Inter,sans-serif"}} onFocus={e=>e.target.style.borderColor="#16a34a"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
              <select value={form.frequency} onChange={e=>setForm(f=>({...f,frequency:e.target.value}))} style={{height:40,padding:"0 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:14,outline:"none",background:"#fff"}}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={{height:40,padding:"0 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:14,outline:"none",background:"#fff"}}>
              {Object.entries(CAT).map(([k,v])=><option key={k} value={k}>{v.i} {k}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button type="button" onClick={()=>setShowAdd(false)} style={{flex:1,height:38,background:"#f1f5f9",border:"none",borderRadius:9,fontSize:13,fontWeight:500,color:"#475569",cursor:"pointer"}}>Cancel</button>
            <button type="submit" style={{flex:2,height:38,background:"#16a34a",color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer"}}>Save recurring expense</button>
          </div>
        </form>
      )}

      {loading?<div style={{height:60,background:"#f1f5f9",borderRadius:12}}/>:list.length===0?(
        <div style={{textAlign:"center",padding:"32px 0"}}>
          <div style={{fontSize:32,marginBottom:8}}>🔄</div>
          <p style={{fontWeight:600,color:"#0f172a",marginBottom:4}}>No recurring expenses</p>
          <p style={{fontSize:13,color:"#94a3b8"}}>Add rent, subscriptions, or mess bills</p>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {list.map(r=>{const due=isDue(r.next_due);const meta=CAT[r.category]||CAT.general;return(
            <div key={r.id} style={{background:"#fff",border:`1px solid ${due?"#fcd34d":"#e2e8f0"}`,borderRadius:13,padding:"13px 15px"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:36,height:36,background:meta.bg,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{meta.i}</div>
                <div style={{flex:1}}>
                  <p style={{fontSize:13.5,fontWeight:600,color:"#0f172a",marginBottom:2}}>{r.description}</p>
                  <p style={{fontSize:12,color:"#94a3b8"}}>{FREQ_LABEL[r.frequency]} · Next: {r.next_due}</p>
                </div>
                <div style={{textAlign:"right"}}>
                  <p style={{fontSize:14,fontWeight:700,color:"#0f172a"}}>₹{r.amount.toFixed(2)}</p>
                  {due&&<span style={{fontSize:10.5,background:"#fef3c7",color:"#d97706",padding:"2px 6px",borderRadius:99,fontWeight:700}}>DUE NOW</span>}
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <button onClick={()=>applyNow(r)} disabled={applying===r.id} style={{flex:2,height:32,background:due?"#16a34a":"#f0fdf4",color:due?"#fff":"#16a34a",border:"none",borderRadius:8,fontSize:12.5,fontWeight:700,cursor:"pointer"}}>
                  {applying===r.id?"Adding…":"➕ Add as expense now"}
                </button>
                <button onClick={()=>del(r)} style={{flex:1,height:32,background:"#fef2f2",border:"none",borderRadius:8,fontSize:12.5,fontWeight:600,color:"#dc2626",cursor:"pointer"}}>Delete</button>
              </div>
            </div>
          );})}
        </div>
      )}
    </div>
  );
}

// ── Members Tab ───────────────────────────────────────────────────────────────
function MembersTab({group,uid,onUpdated,groupId}){
  const[email,setEmail]=useState("");const[adding,setAdding]=useState(false);const[msg,setMsg]=useState({t:"",m:""});
  const[inviteUrl,setInviteUrl]=useState("");const[copied,setCopied]=useState(false);
  const[suggestions,setSuggestions]=useState([]);
  const isAdmin=group.members?.find(m=>m.user_id===uid)?.role==="admin";
  useEffect(()=>{api.getSuggestions(groupId).then(setSuggestions).catch(()=>{});},[groupId]);
  const add=async e=>{e.preventDefault();setAdding(true);setMsg({t:"",m:""});try{await api.addMember(group.id,email);setMsg({t:"ok",m:"Member added!"});setEmail("");onUpdated();}catch(err){setMsg({t:"err",m:err.message});}finally{setAdding(false);}};
  const genInvite=async()=>{try{const d=await api.createInvite(group.id);setInviteUrl(d.invite_url);}catch(e){alert(e.message);}};
  const copy=()=>{navigator.clipboard.writeText(inviteUrl);setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const shareWA=()=>{window.open(`https://wa.me/?text=${encodeURIComponent(`Join our SplitSmart group "${group.name}"! 👉 ${inviteUrl}`)}`,"_blank");};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {suggestions.length>0&&(
        <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:12,padding:"12px 14px"}}>
          <p style={{fontSize:12.5,fontWeight:700,color:"#15803d",marginBottom:6}}>💡 Split suggestions based on history</p>
          {suggestions.slice(0,3).map((s,i)=>(
            <p key={i} style={{fontSize:12,color:"#16a34a",marginBottom:2}}>{s.payer_name} usually pays for <strong>{s.category}</strong> ({s.times}× in this group)</p>
          ))}
        </div>
      )}
      <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:14,padding:"14px 16px"}}>
        <p style={{fontSize:13,fontWeight:700,color:"#15803d",marginBottom:8}}>🔗 Invite via link</p>
        {!inviteUrl?<button onClick={genInvite} style={{height:34,padding:"0 14px",background:"#16a34a",color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:600,cursor:"pointer"}}>Generate invite link</button>:(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",gap:8}}>
              <input readOnly value={inviteUrl} style={{flex:1,height:34,padding:"0 10px",border:"1px solid #bbf7d0",borderRadius:9,fontSize:12,background:"#fff",color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis"}}/>
              <button onClick={copy} style={{height:34,padding:"0 14px",background:copied?"#052e16":"#16a34a",color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:600,cursor:"pointer"}}>{copied?"Copied!":"Copy"}</button>
            </div>
            <button onClick={shareWA} style={{height:34,padding:"0 14px",background:"#25D366",color:"#fff",border:"none",borderRadius:9,fontSize:13,fontWeight:600,cursor:"pointer"}}>📱 Share on WhatsApp</button>
          </div>
        )}
      </div>
      <p style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em"}}>{group.members?.length} Members</p>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {group.members?.map(m=>(
          <div key={m.user_id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:13,padding:"12px 15px",display:"flex",alignItems:"center",gap:12}}>
            <Av name={m.name} size={36}/>
            <div style={{flex:1}}><p style={{fontSize:13.5,fontWeight:600,color:"#0f172a"}}>{m.user_id===uid?`${m.name} (You)`:m.name}</p><p style={{fontSize:12,color:"#94a3b8"}}>{m.email}</p></div>
            {m.role==="admin"&&<span style={{fontSize:11,background:"#f0fdf4",color:"#16a34a",padding:"3px 9px",borderRadius:99,fontWeight:700,border:"1px solid #bbf7d0"}}>admin</span>}
          </div>
        ))}
      </div>
      {isAdmin&&(
        <div>
          <p style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Add by email</p>
          <form onSubmit={add} style={{display:"flex",gap:8}}>
            <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="friend@example.com"
              style={{flex:1,height:40,padding:"0 13px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:13.5,outline:"none",fontFamily:"Inter,sans-serif"}}
              onFocus={e=>e.target.style.borderColor="#16a34a"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
            <button type="submit" disabled={adding} style={{height:40,padding:"0 16px",background:"#16a34a",color:"#fff",border:"none",borderRadius:10,fontWeight:600,fontSize:13.5,cursor:"pointer"}}>{adding?"…":"Add"}</button>
          </form>
          {msg.m&&<p style={{marginTop:6,fontSize:12.5,color:msg.t==="ok"?"#16a34a":"#dc2626"}}>{msg.m}</p>}
        </div>
      )}
    </div>
  );
}

// ── Activity Tab ──────────────────────────────────────────────────────────────
function ActivityTab({groupId}){
  const[feed,setFeed]=useState([]);const[loading,setLoading]=useState(true);
  useEffect(()=>{api.getActivity(groupId).then(setFeed).catch(()=>{}).finally(()=>setLoading(false));},[groupId]);
  const icons={expense_added:"💸",expense_deleted:"🗑️",expense_edited:"✏️",settled:"✅",member_added:"👤",group_created:"🎉"};
  const desc=(item)=>{const m=item.meta||{};switch(item.action){case"expense_added":return`added "${m.description}" (₹${m.amount})`;case"expense_deleted":return`deleted "${m.description}"`;case"expense_edited":return`edited "${m.description}"`;case"settled":return`paid ₹${m.amount} to ${m.to}`;case"member_added":return`added ${m.username||"a new member"}`;default:return item.action.replace(/_/g," ");}};
  if(loading)return<div style={{display:"flex",flexDirection:"column",gap:6}}>{[1,2,3].map(i=><div key={i} style={{height:56,background:"#f1f5f9",borderRadius:12}}/>)}</div>;
  if(!feed.length)return<div style={{textAlign:"center",padding:"48px 0"}}><div style={{fontSize:32,marginBottom:10}}>📋</div><p style={{fontWeight:600,color:"#0f172a"}}>No activity yet</p></div>;
  return(
    <div style={{position:"relative"}}>
      <div style={{position:"absolute",left:19,top:0,bottom:0,width:2,background:"#f1f5f9"}}/>
      <div style={{display:"flex",flexDirection:"column"}}>
        {feed.map((item)=>(
          <div key={item.id} style={{display:"flex",gap:16,paddingBottom:16,position:"relative"}}>
            <div style={{width:40,height:40,background:"#fff",border:"2px solid #f1f5f9",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,zIndex:1}}>{icons[item.action]||"📌"}</div>
            <div style={{flex:1,paddingTop:8}}>
              <p style={{fontSize:13.5,color:"#0f172a"}}><span style={{fontWeight:600}}>{item.username||"Someone"}</span> <span style={{color:"#64748b"}}>{desc(item)}</span></p>
              <p style={{fontSize:11.5,color:"#94a3b8",marginTop:2}}>{fmtDate(item.created_at.slice(0,10))} at {fmtTime(item.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function GroupDetail(){
  const{groupId}=useParams();const{user}=useAuth();const navigate=useNavigate();
  const[group,setGroup]=useState(null);const[expenses,setExpenses]=useState([]);const[balances,setBalances]=useState(null);
  const[loading,setLoading]=useState(true);const[tab,setTab]=useState("expenses");
  const[showAdd,setShowAdd]=useState(false);const[showSettle,setShowSettle]=useState(false);const[editing,setEditing]=useState(null);
  const[suggestions,setSuggestions]=useState([]);const[isOnline,setIsOnline]=useState(navigator.onLine);

  useEffect(()=>{
    const on=()=>setIsOnline(true);const off=()=>setIsOnline(false);
    window.addEventListener("online",on);window.addEventListener("offline",off);
    return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);};
  },[]);

  const load=useCallback(async()=>{
    try{
      const[g,e,b]=await Promise.all([api.getGroup(+groupId),api.getExpenses(+groupId),api.getBalances(+groupId)]);
      setGroup(g);setExpenses(e.map(ex=>({...ex,group_id:+groupId})));setBalances(b);
      api.getSuggestions(+groupId).then(setSuggestions).catch(()=>{});
    }catch(err){if(err.status===403||err.status===404)navigate("/");}
    finally{setLoading(false);}
  },[groupId,navigate]);

  useEffect(()=>{load();},[load]);
  const handleDelete=async id=>{if(window.confirm("Delete this expense?"))await api.deleteExpense(+groupId,id).then(load);};

  const handleAddExpense=()=>{
    if(!isOnline){
      // Offline: queue it
      const item={groupId:+groupId,timestamp:new Date().toISOString()};
      addToQueue(item);
      alert("You're offline! Expense saved locally and will sync when you reconnect.");
      return;
    }
    setEditing(null);setShowAdd(true);
  };

  if(loading)return(
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"Inter,sans-serif"}}>
      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",height:60}}/>
      <div style={{maxWidth:680,margin:"0 auto",padding:"24px 20px",display:"flex",flexDirection:"column",gap:10}}>
        {[100,60,80,60,80].map((h,i)=><div key={i} style={{height:h,background:"linear-gradient(90deg,#f1f5f9 25%,#e9eff6 50%,#f1f5f9 75%)",backgroundSize:"200% 100%",borderRadius:14,animation:"shimmer 1.5s infinite"}}/>)}
      </div>
    </div>
  );
  if(!group)return null;

  const myBal=balances?.current_user_summary;
  const iOwe=myBal?.you_owe>0.01,iAmOwed=myBal?.you_are_owed>0.01;

  return(
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"Inter,sans-serif"}}>
      {/* TOPBAR */}
      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"0 20px",height:60,display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:30}}>
        <button onClick={()=>navigate("/")} style={{background:"#f1f5f9",border:"none",borderRadius:9,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#64748b"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div style={{flex:1,minWidth:0}}>
          <h1 style={{fontSize:16,fontWeight:700,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{group.emoji||"💰"} {group.name}</h1>
          <p style={{fontSize:11.5,color:"#94a3b8"}}>{group.members?.length} members · {expenses.length} expenses</p>
        </div>
        {!isOnline&&<span style={{fontSize:11,background:"#fef3c7",color:"#d97706",padding:"3px 8px",borderRadius:99,fontWeight:700}}>Offline</span>}
        <button onClick={()=>api.downloadReport(+groupId)} title="Download PDF" style={{background:"#f1f5f9",border:"none",borderRadius:9,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#64748b"}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>

      <div style={{maxWidth:680,margin:"0 auto",padding:"18px 18px 100px"}}>
        {/* Balance banner */}
        {(iOwe||iAmOwed)&&(
          <div style={{background:iOwe?"#fef2f2":"#f0fdf4",border:`1px solid ${iOwe?"#fecaca":"#bbf7d0"}`,borderRadius:16,padding:"15px 18px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <p style={{fontSize:11.5,fontWeight:700,color:iOwe?"#dc2626":"#16a34a",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>{iOwe?"You owe":"You are owed"}</p>
              <p style={{fontSize:26,fontWeight:800,color:iOwe?"#dc2626":"#16a34a",letterSpacing:"-0.03em"}}>₹{iOwe?myBal.you_owe.toFixed(2):myBal.you_are_owed.toFixed(2)}</p>
            </div>
            {iOwe&&<button onClick={()=>setShowSettle(true)} style={{background:"#dc2626",color:"#fff",border:"none",borderRadius:10,padding:"10px 18px",fontWeight:700,fontSize:13.5,cursor:"pointer"}}>Settle up ✓</button>}
          </div>
        )}

        {/* Stats */}
        {balances&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
            {[{l:"Total spend",v:`₹${(balances.total_group_spend||0).toLocaleString("en-IN",{maximumFractionDigits:0})}`,c:"#0f172a"},{l:"Expenses",v:expenses.length,c:"#2563eb"},{l:"Members",v:group.members?.length||0,c:"#7c3aed"}].map((s,i)=>(
              <div key={i} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"11px 13px"}}>
                <p style={{fontSize:10.5,color:"#94a3b8",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>{s.l}</p>
                <p style={{fontSize:18,fontWeight:700,color:s.c}}>{s.v}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{display:"flex",background:"#f1f5f9",borderRadius:12,padding:3,marginBottom:16,gap:2,overflowX:"auto"}}>
          {TABS.map(t=>(
            <button key={t.k} onClick={()=>setTab(t.k)}
              style={{flex:1,minWidth:64,height:32,border:"none",borderRadius:9,fontSize:12,fontWeight:500,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap",padding:"0 8px",
                background:tab===t.k?"#fff":"transparent",color:tab===t.k?"#0f172a":"#64748b",
                boxShadow:tab===t.k?"0 1px 3px rgba(0,0,0,0.08)":"none"}}>{t.l}</button>
          ))}
        </div>

        {tab==="expenses"&&<ExpensesTab expenses={expenses} uid={user?.id} groupId={+groupId} onEdit={e=>{setEditing(e);setShowAdd(true);}} onDelete={handleDelete} suggestions={suggestions} onAddExpense={handleAddExpense}/>}
        {tab==="balances"&&<BalancesTab balances={balances} uid={user?.id} members={group.members} onSettle={()=>setShowSettle(true)} group={group}/>}
        {tab==="analytics"&&<AnalyticsTab groupId={+groupId}/>}
        {tab==="recurring"&&<RecurringTab groupId={+groupId} members={group.members||[]} currentUserId={user?.id}/>}
        {tab==="members"&&<MembersTab group={group} uid={user?.id} onUpdated={load} groupId={+groupId}/>}
        {tab==="activity"&&<ActivityTab groupId={+groupId}/>}
      </div>

      {/* FAB */}
      <div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",zIndex:20,width:"min(640px,calc(100vw - 36px))"}}>
        <button onClick={handleAddExpense}
          style={{width:"100%",height:52,background:"#16a34a",color:"#fff",border:"none",borderRadius:14,fontWeight:700,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 6px 20px rgba(22,163,74,0.35)",transition:"transform 0.15s"}}
          onMouseEnter={e=>e.currentTarget.style.transform="translateY(-1px)"} onMouseLeave={e=>e.currentTarget.style.transform="none"}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Add expense {!isOnline&&"(offline)"}
        </button>
      </div>

      <Calculator/>

      {showAdd&&<AddExpenseModal groupId={+groupId} members={group.members} expense={editing} currentUserId={user?.id} onClose={()=>{setShowAdd(false);setEditing(null);}} onSaved={()=>{setShowAdd(false);setEditing(null);load();}}/>}
      {showSettle&&balances&&<SettleUpModal groupId={+groupId} transactions={balances.transactions} currentUserId={user?.id} onClose={()=>setShowSettle(false)} onSettled={()=>{setShowSettle(false);load();}}/>}
    </div>
  );
}
