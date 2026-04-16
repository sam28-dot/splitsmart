import { useState } from "react";
import { api } from "../../utils/api";

const COLORS=["#16a34a","#2563eb","#7c3aed","#dc2626","#d97706","#0891b2","#db2777","#65a30d"];
const getColor=(n="")=>COLORS[(n||"?").charCodeAt(0)%COLORS.length];
function Avatar({name,size=36}){
  return<div style={{width:size,height:size,borderRadius:"50%",background:getColor(name||"?"),display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:size*0.38,flexShrink:0}}>{(name||"?")[0].toUpperCase()}</div>;
}

export default function SettleUpModal({groupId,transactions,currentUserId,onClose,onSettled}){
  const myDebts=transactions.filter(t=>t.from_user_id===currentUserId);
  const[amounts,setAmounts]=useState(Object.fromEntries(myDebts.map(t=>[t.to_user_id,t.amount.toFixed(2)])));
  const[settling,setSettling]=useState(null);const[error,setError]=useState("");

  const settle=async t=>{
    const amount=parseFloat(amounts[t.to_user_id]);
    if(!amount||amount<=0){setError("Enter a valid amount");return;}
    setSettling(t.to_user_id);setError("");
    try{await api.recordSettlement(groupId,{to_user_id:t.to_user_id,amount});onSettled();}
    catch(err){setError(err.message);setSettling(null);}
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:50}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:560,padding:"24px 24px 32px",boxShadow:"0 -20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <h2 style={{fontSize:17,fontWeight:700,color:"#0f172a"}}>Settle up</h2>
          <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",color:"#64748b",fontSize:15}}>✕</button>
        </div>

        {myDebts.length===0?(
          <div style={{textAlign:"center",padding:"24px 0"}}>
            <div style={{fontSize:36,marginBottom:10}}>✅</div>
            <p style={{fontWeight:700,color:"#0f172a",marginBottom:4}}>You're all clear!</p>
            <p style={{fontSize:13.5,color:"#94a3b8"}}>No outstanding debts for you</p>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <p style={{fontSize:13.5,color:"#94a3b8",marginBottom:4}}>Record a payment to mark it as settled:</p>
            {myDebts.map(t=>(
              <div key={t.to_user_id} style={{border:"1.5px solid #e2e8f0",borderRadius:14,padding:"14px 16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                  <Avatar name={t.to_name} size={36}/>
                  <div>
                    <p style={{fontSize:14,fontWeight:600,color:"#0f172a"}}>Pay {t.to_name}</p>
                    <p style={{fontSize:12,color:"#94a3b8"}}>Suggested: ₹{t.amount.toFixed(2)}</p>
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <div style={{position:"relative",flex:1}}>
                    <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#94a3b8",fontSize:14,fontWeight:600}}>₹</span>
                    <input type="number" step="0.01" min="0.01" value={amounts[t.to_user_id]||""}
                      onChange={e=>setAmounts(a=>({...a,[t.to_user_id]:e.target.value}))}
                      style={{width:"100%",height:42,paddingLeft:28,paddingRight:14,border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14,color:"#0f172a",outline:"none",fontFamily:"Inter,sans-serif"}}
                      onFocus={e=>e.target.style.borderColor="#16a34a"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
                  </div>
                  <button onClick={()=>settle(t)} disabled={settling===t.to_user_id}
                    style={{height:42,padding:"0 18px",background:settling===t.to_user_id?"#86efac":"#16a34a",color:"#fff",border:"none",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer",flexShrink:0,transition:"background 0.15s"}}>
                    {settling===t.to_user_id?"…":"Mark paid"}
                  </button>
                </div>
              </div>
            ))}
            {error&&<p style={{fontSize:13,color:"#dc2626"}}>{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
