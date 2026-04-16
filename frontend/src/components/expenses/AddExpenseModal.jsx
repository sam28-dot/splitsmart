import { useState, useRef, useCallback } from "react";
import { api } from "../../utils/api";

const CATS=[{v:"food",l:"🍽️ Food"},{v:"travel",l:"✈️ Travel"},{v:"rent",l:"🏠 Rent"},{v:"entertainment",l:"🎬 Entertainment"},{v:"utilities",l:"💡 Utilities"},{v:"general",l:"💳 General"}];
const COLORS=["#16a34a","#2563eb","#7c3aed","#dc2626","#d97706","#0891b2","#db2777","#65a30d"];
const getColor=(n="")=>COLORS[(n||"?").charCodeAt(0)%COLORS.length];

function Avatar({name,size=28}){
  return<div style={{width:size,height:size,borderRadius:"50%",background:getColor(name||"?"),display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:size*0.4,flexShrink:0}}>{(name||"?")[0].toUpperCase()}</div>;
}

const inputSx={height:42,padding:"0 14px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14,color:"#0f172a",background:"#fff",outline:"none",width:"100%",transition:"border 0.15s",fontFamily:"Inter,sans-serif"};

export default function AddExpenseModal({groupId,members,expense,currentUserId,onClose,onSaved}){
  const isEdit=!!expense;
  const[form,setForm]=useState({description:expense?.description||"",amount:expense?.amount?String(expense.amount):"",split_type:expense?.split_type||"equal",category:expense?.category||"food",date:expense?.date||new Date().toISOString().slice(0,10),paid_by_user_id:expense?.paid_by_user_id||currentUserId});
  const[parts,setParts]=useState(()=>members.map(m=>({user_id:m.user_id,value:expense?.splits?.find(s=>s.user_id===m.user_id)?.amount||"",selected:true})));
  const[saving,setSaving]=useState(false);const[error,setError]=useState("");
  const[scanning,setScanning]=useState(false);const[ocrNote,setOcrNote]=useState("");
  const fileRef=useRef();
  const set=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  const selParts=parts.filter(p=>p.selected);
  const eqShare=form.amount&&selParts.length>0?(parseFloat(form.amount)/selParts.length).toFixed(2):null;

  const scanReceipt=useCallback(async e=>{
    const file=e.target.files?.[0];if(!file)return;
    setScanning(true);setOcrNote("");
    try{
      const Tesseract=window.Tesseract||(await import("tesseract.js")).default;
      const{data:{text}}=await Tesseract.recognize(file,"eng");
      const lines=text.split("\n").map(l=>l.trim()).filter(Boolean);
      const patterns=[/total[:\s]*(?:rs\.?|₹|inr)?\s*(\d+(?:[.,]\d{2})?)/i,/amount[:\s]*(?:rs\.?|₹|inr)?\s*(\d+(?:[.,]\d{2})?)/i,/(?:grand\s+)?total[:\s]*(\d+(?:[.,]\d{2})?)/i];
      let found="";
      for(const line of[...lines].reverse()){for(const p of patterns){const m=line.match(p);if(m){found=m[1].replace(",",".");break;}}if(found)break;}
      if(found){setForm(f=>({...f,amount:found}));setOcrNote(`✓ Detected ₹${found} — please verify`);}
      else setOcrNote("Could not detect total — please enter manually");
    }catch(err){setOcrNote("Scan failed — please enter amount manually");}
    finally{setScanning(false);}
  },[]);

  const submit=async e=>{
    e.preventDefault();setError("");
    if(!selParts.length){setError("Select at least one participant");return;}
    const payload={description:form.description.trim(),amount:parseFloat(form.amount),split_type:form.split_type,category:form.category,date:form.date,paid_by_user_id:parseInt(form.paid_by_user_id),
      participants:selParts.map(p=>({user_id:p.user_id,value:form.split_type==="equal"?0:parseFloat(p.value||0)}))};
    setSaving(true);
    try{isEdit?await api.updateExpense(groupId,expense.id,payload):await api.createExpense(groupId,payload);onSaved();}
    catch(err){setError(err.message);setSaving(false);}
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:50,padding:0}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:560,maxHeight:"92vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 -20px 60px rgba(0,0,0,0.2)"}}>
        {/* Header */}
        <div style={{padding:"20px 22px 16px",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <h2 style={{fontSize:17,fontWeight:700,color:"#0f172a"}}>{isEdit?"Edit expense":"Add expense"}</h2>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b",fontSize:15}}>✕</button>
        </div>

        <form onSubmit={submit} style={{overflowY:"auto",flex:1,padding:"18px 22px 24px",display:"flex",flexDirection:"column",gap:16}}>
          {/* Description */}
          <div>
            <label style={{fontSize:12.5,fontWeight:600,color:"#64748b",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.04em"}}>Description</label>
            <input required value={form.description} onChange={set("description")} placeholder="Dinner at Swiggy, Petrol, Hotel…" style={inputSx}
              onFocus={e=>e.target.style.borderColor="#16a34a"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
          </div>

          {/* Amount + Scanner */}
          <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
            <div style={{flex:1}}>
              <label style={{fontSize:12.5,fontWeight:600,color:"#64748b",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.04em"}}>Amount (₹)</label>
              <input required type="number" step="0.01" min="0.01" value={form.amount} onChange={set("amount")} placeholder="0.00" style={inputSx}
                onFocus={e=>e.target.style.borderColor="#16a34a"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
            </div>
            <input type="file" ref={fileRef} accept="image/*" onChange={scanReceipt} style={{display:"none"}}/>
            <button type="button" onClick={()=>fileRef.current?.click()} disabled={scanning}
              style={{height:42,padding:"0 14px",border:"1.5px dashed #cbd5e1",borderRadius:10,background:"#f8fafc",color:"#64748b",fontSize:13,fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap",flexShrink:0}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
              {scanning?"Scanning…":"Scan receipt"}
            </button>
          </div>
          {ocrNote&&<p style={{fontSize:12.5,marginTop:-8,padding:"8px 12px",background:ocrNote.startsWith("✓")?"#f0fdf4":"#fef3c7",borderRadius:8,color:ocrNote.startsWith("✓")?"#16a34a":"#d97706"}}>{ocrNote}</p>}

          {/* Category + Paid by */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label style={{fontSize:12.5,fontWeight:600,color:"#64748b",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.04em"}}>Category</label>
              <select value={form.category} onChange={set("category")} style={{...inputSx,cursor:"pointer"}}>
                {CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
            </div>
            <div>
              <label style={{fontSize:12.5,fontWeight:600,color:"#64748b",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.04em"}}>Paid by</label>
              <select value={form.paid_by_user_id} onChange={set("paid_by_user_id")} style={{...inputSx,cursor:"pointer"}}>
                {members.map(m=><option key={m.user_id} value={m.user_id}>{m.user_id===currentUserId?`You (${m.name})`:m.name}</option>)}
              </select>
            </div>
          </div>

          {/* Split type */}
          <div>
            <label style={{fontSize:12.5,fontWeight:600,color:"#64748b",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>Split type</label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {[["equal","Equal split"],["exact","Exact ₹"],["percentage","By %"]].map(([t,label])=>(
                <button key={t} type="button" onClick={()=>setForm(f=>({...f,split_type:t}))}
                  style={{height:36,border:`1.5px solid ${form.split_type===t?"#16a34a":"#e2e8f0"}`,borderRadius:9,fontSize:13,fontWeight:500,cursor:"pointer",
                    background:form.split_type===t?"#f0fdf4":"#fff",color:form.split_type===t?"#16a34a":"#64748b",transition:"all 0.15s"}}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Participants */}
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <label style={{fontSize:12.5,fontWeight:600,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.04em"}}>Split among</label>
              {form.split_type==="equal"&&eqShare&&<span style={{fontSize:12.5,color:"#16a34a",fontWeight:600}}>₹{eqShare} each</span>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {members.map(m=>{
                const p=parts.find(pp=>pp.user_id===m.user_id);
                return(
                  <div key={m.user_id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,border:`1.5px solid ${p?.selected?"#bbf7d0":"#e2e8f0"}`,background:p?.selected?"#f0fdf4":"#f8fafc",cursor:"pointer",transition:"all 0.15s"}}
                    onClick={()=>setParts(ps=>ps.map(pp=>pp.user_id===m.user_id?{...pp,selected:!pp.selected}:pp))}>
                    <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${p?.selected?"#16a34a":"#cbd5e1"}`,background:p?.selected?"#16a34a":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.15s"}}>
                      {p?.selected&&<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <Avatar name={m.name} size={26}/>
                    <span style={{flex:1,fontSize:13.5,fontWeight:500,color:"#0f172a"}}>{m.user_id===currentUserId?"You":m.name}</span>
                    {form.split_type!=="equal"&&p?.selected&&(
                      <input type="number" step="0.01" min="0" value={p.value} onChange={e=>{e.stopPropagation();setParts(ps=>ps.map(pp=>pp.user_id===m.user_id?{...pp,value:e.target.value}:pp));}}
                        onClick={e=>e.stopPropagation()} placeholder={form.split_type==="percentage"?"%":"₹"}
                        style={{width:72,height:32,padding:"0 8px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,textAlign:"right",outline:"none",background:"#fff"}}/>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Date */}
          <div>
            <label style={{fontSize:12.5,fontWeight:600,color:"#64748b",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.04em"}}>Date</label>
            <input type="date" value={form.date} onChange={set("date")} style={inputSx}
              onFocus={e=>e.target.style.borderColor="#16a34a"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
          </div>

          {error&&<div style={{padding:"10px 14px",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,fontSize:13,color:"#dc2626"}}>{error}</div>}

          <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:10,marginTop:4}}>
            <button type="button" onClick={onClose} style={{height:46,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:12,fontSize:14,fontWeight:500,color:"#475569",cursor:"pointer"}}>Cancel</button>
            <button type="submit" disabled={saving} style={{height:46,background:saving?"#86efac":"#16a34a",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:saving?"not-allowed":"pointer",transition:"background 0.15s"}}>
              {saving?"Saving…":isEdit?"Update expense":"Add expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
