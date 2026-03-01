/**
 * FinanzasVH — components/settings/SettingsPanel.jsx
 * Panel lateral de configuración: Perfil, Cuentas, Reglas, Ciclos, Categorías.
 */
import { useState, useEffect } from "react";
import { X, Plus, Trash2, Settings } from "lucide-react";
import { TYPE_CONFIG, ACCOUNT_TYPES, DEFAULT_CATEGORIES } from "../../constants/types.js";
import { SYSTEM_RULES } from "../../constants/rules.js";
import { compilePattern } from "../../utils/classify.js";
import { fmtN } from "../../utils/format.js";
import { s } from "../ui/shared.jsx";

const API = import.meta.env.VITE_API_URL || "/api";

export function SettingsPanel({ settings, profile: initialProfile, onSave, onSaveProfile, onClose }) {
  const [cfg, setCfg] = useState({
    accounts:       settings.accounts       || [],
    custom_rules:   settings.custom_rules   || [],
    billing_cycles: settings.billing_cycles || [],
    categories:     settings.categories     || DEFAULT_CATEGORIES,
  });
  const [prof, setProf] = useState({
    name:               initialProfile?.name               || "",
    income:             initialProfile?.income             || 0,
    pay_day:            initialProfile?.pay_day            || 1,
    recurring_services: initialProfile?.recurring_services || [],
  });
  const [section, setSection] = useState("profile");
  const [saving, setSaving]   = useState(false);

  const updateAccounts  = fn => setCfg(c=>({...c, accounts:fn(c.accounts)}));
  const updateRules     = fn => setCfg(c=>({...c, custom_rules:fn(c.custom_rules)}));
  const updateCycles    = fn => setCfg(c=>({...c, billing_cycles:fn(c.billing_cycles)}));
  const updateCats      = (type, cats) => setCfg(c=>({...c, categories:{...c.categories,[type]:cats}}));
  const updateSvc       = fn => setProf(p=>({...p, recurring_services:fn(p.recurring_services)}));

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([ onSave(cfg), onSaveProfile(prof) ]);
      onClose();
    } catch(e) { alert("Error guardando: "+e.message); }
    finally { setSaving(false); }
  };

  const activeAccounts = cfg.accounts.filter(a=>a.active).map(a=>a.name);

  const [newAcc,  setNewAcc]  = useState({name:"",type:"banco",color:"#888888",active:true});
  const [newRule, setNewRule] = useState({label:"",pattern:"",type:"gasto_variable",category:"Alimentación",isInternal:false});
  const [newCycle,setNewCycle]= useState({name:"",cutDay:"",dueDay:"",account:""});
  const [newCat,  setNewCat]  = useState({type:"gasto_variable",name:""});
  const [newSvc,  setNewSvc]  = useState({name:"",amount:"",day:"",account:"",category:"Suscripciones"});
  const [editAcc, setEditAcc] = useState(null);
  const [editRule,setEditRule]= useState(null);

  // ── F-01 Telegram ───────────────────────────────────────────
  const [tgCfg,   setTgCfg]   = useState({ enabled:false, anticipation_days:3, notify_hour:8 });
  const [tgStatus,setTgStatus]= useState(null);   // {ready, token_configured, chat_id_configured, scheduler}
  const [tgSaving,setTgSaving]= useState(false);
  const [tgMsg,   setTgMsg]   = useState(null);   // {type:'ok'|'err', text}
  const [tgPreview,setTgPreview]=useState(null);

  useEffect(() => {
    if (section !== "telegram") return;
    fetch(`${API}/telegram/status`)
      .then(r=>r.json())
      .then(d=>{ setTgStatus(d); setTgCfg(c=>({...c, enabled:d.enabled, anticipation_days:d.anticipation_days, notify_hour:d.notify_hour})); })
      .catch(()=>setTgStatus(null));
  }, [section]);

  const saveTgConfig = async () => {
    setTgSaving(true); setTgMsg(null);
    try {
      const r = await fetch(`${API}/telegram/config`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(tgCfg) });
      if (!r.ok) throw new Error(await r.text());
      const refreshed = await fetch(`${API}/telegram/status`).then(r=>r.json());
      setTgStatus(refreshed);
      setTgMsg({type:"ok", text:"✅ Configuración guardada"});
    } catch(e) { setTgMsg({type:"err", text:"❌ Error: "+e.message}); }
    finally { setTgSaving(false); }
  };

  const sendTestMsg = async () => {
    setTgMsg(null);
    try {
      const r = await fetch(`${API}/telegram/test`, { method:"POST", headers:{"Content-Type":"application/json"}, body:"{}" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail||r.statusText);
      setTgMsg({type:"ok", text:"✅ Mensaje de prueba enviado — revisa tu Telegram"});
    } catch(e) { setTgMsg({type:"err", text:"❌ "+e.message}); }
  };

  const sendNotifyNow = async () => {
    setTgMsg(null);
    try {
      const r = await fetch(`${API}/telegram/notify/now`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({anticipation_days:tgCfg.anticipation_days}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail||r.statusText);
      setTgMsg({type:"ok", text: d.sent ? "✅ Notificación enviada" : "ℹ️ Sin eventos próximos — no se envió nada"});
    } catch(e) { setTgMsg({type:"err", text:"❌ "+e.message}); }
  };

  const loadPreview = async () => {
    setTgPreview(null);
    try {
      const r = await fetch(`${API}/telegram/preview?anticipation_days=${tgCfg.anticipation_days}`);
      const d = await r.json();
      setTgPreview(d);
    } catch(e) { setTgPreview({has_events:false, preview:"Error al cargar vista previa"}); }
  };

  const SECTIONS = [
    {id:"profile",   label:"👤 Perfil",       count: prof.recurring_services.length > 0 ? prof.recurring_services.length : null},
    {id:"accounts",  label:"🏦 Cuentas",       count: cfg.accounts.filter(a=>a.active).length},
    {id:"rules",     label:"⚡ Reglas",         count: cfg.custom_rules.length || null},
    {id:"cycles",    label:"📅 Ciclos",         count: cfg.billing_cycles.length || null},
    {id:"categories",label:"🗂️ Categorías",    count: null},
    {id:"telegram",  label:"🔔 Telegram",       count: null},
  ];

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"flex-start",justifyContent:"flex-end",padding:0}}>
      <div style={{background:"#0d0d10",borderLeft:"1px solid #222226",width:"100%",maxWidth:680,height:"100vh",display:"flex",flexDirection:"column",overflowY:"hidden"}}>

        {/* Header */}
        <div style={{borderBottom:"1px solid #1a1a20",padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{color:"#f0f0f2",fontWeight:700,fontSize:15}}>⚙️ Configuración</div>
            <div style={{color:"#444",fontSize:11,marginTop:2}}>Personaliza cuentas, reglas, ciclos y categorías</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={save} disabled={saving}
              style={{...s.btn,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff",padding:"7px 16px",fontSize:12}}>
              {saving?"Guardando...":"💾 Guardar todo"}
            </button>
            <button onClick={onClose} style={{...s.btn,background:"#1a1a20",color:"#888",border:"1px solid #2a2a30",padding:"7px 10px"}}>
              <X size={14}/>
            </button>
          </div>
        </div>

        {/* Section tabs */}
        <div style={{display:"flex",borderBottom:"1px solid #161618",flexShrink:0}}>
          {SECTIONS.map(sec=>(
            <button key={sec.id} onClick={()=>setSection(sec.id)}
              style={{flex:1,padding:"10px 8px",fontSize:11,fontWeight:section===sec.id?700:400,
                color:section===sec.id?"#22c55e":"#555",background:"transparent",border:"none",
                borderBottom:section===sec.id?"2px solid #22c55e":"2px solid transparent",cursor:"pointer"}}>
              {sec.label}
              {sec.count!=null&&<span style={{marginLeft:5,background:"#1a1a20",borderRadius:4,padding:"1px 5px",color:"#666",fontSize:10}}>{sec.count}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>

          {/* ─── PERFIL ── */}
          {section==="profile"&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div style={{background:"#111113",border:"1px solid #222226",borderRadius:10,padding:16}}>
                <p style={{color:"#a78bfa",fontWeight:700,fontSize:11,margin:"0 0 14px",letterSpacing:"0.5px"}}>DATOS BÁSICOS</p>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10}}>
                  <div>
                    <label style={s.label}>NOMBRE</label>
                    <input style={s.input} value={prof.name} placeholder="Tu nombre"
                      onChange={e=>setProf(p=>({...p,name:e.target.value}))}/>
                  </div>
                  <div>
                    <label style={s.label}>INGRESO MENSUAL (S/)</label>
                    <input type="number" style={s.input} value={prof.income||""} placeholder="0.00"
                      onChange={e=>setProf(p=>({...p,income:parseFloat(e.target.value)||0}))}/>
                  </div>
                  <div>
                    <label style={s.label}>DÍA DE COBRO</label>
                    <input type="number" min="1" max="31" style={s.input} value={prof.pay_day||""} placeholder="1–31"
                      onChange={e=>setProf(p=>({...p,pay_day:parseInt(e.target.value)||1}))}/>
                  </div>
                </div>
                {prof.income>0&&(
                  <p style={{color:"#555",fontSize:11,margin:"10px 0 0"}}>
                    💰 El día <strong style={{color:"#22c55e"}}>{prof.pay_day}</strong> de cada mes entra{" "}
                    <strong style={{color:"#22c55e"}}>{fmtN(prof.income)}</strong> — aparecerá en el Calendario.
                  </p>
                )}
              </div>

              <div style={{background:"#111113",border:"1px solid #222226",borderRadius:10,padding:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div>
                    <p style={{color:"#f59e0b",fontWeight:700,fontSize:11,margin:0,letterSpacing:"0.5px"}}>SALIDAS AUTOMÁTICAS / SERVICIOS RECURRENTES</p>
                    <p style={{color:"#555",fontSize:11,margin:"4px 0 0"}}>Pagos fijos que ocurren cada mes.</p>
                  </div>
                  {prof.recurring_services.length>0&&(
                    <span style={{color:"#f59e0b",fontWeight:700,fontSize:13}}>
                      −{fmtN(prof.recurring_services.reduce((s,sv)=>s+Number(sv.amount),0))}
                    </span>
                  )}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
                  {prof.recurring_services.length===0&&(
                    <p style={{color:"#333",fontSize:12,textAlign:"center",padding:"16px 0"}}>Sin servicios aún — agrega tus pagos fijos abajo</p>
                  )}
                  {prof.recurring_services.map((svc,i)=>(
                    <div key={i} style={{background:"#0a0a0c",border:"1px solid #1e1e26",borderLeft:"3px solid #f59e0b",borderRadius:7,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{color:"#e0e0e8",fontWeight:600,fontSize:13}}>{svc.name}</span>
                          <span style={{color:"#555",fontSize:11}}>· día {svc.day}</span>
                          {svc.account&&<span style={{color:"#444",fontSize:11}}>· {svc.account}</span>}
                        </div>
                        {svc.category&&<span style={{color:"#666",fontSize:11}}>{svc.category}</span>}
                      </div>
                      <span style={{color:"#fbbf24",fontWeight:700,fontSize:13}}>−{fmtN(Number(svc.amount))}</span>
                      <button onClick={()=>updateSvc(s=>s.filter((_,j)=>j!==i))}
                        style={{background:"none",border:"none",color:"#333",cursor:"pointer",padding:4}}>
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{background:"rgba(245,158,11,0.05)",border:"1px dashed rgba(245,158,11,0.2)",borderRadius:8,padding:14}}>
                  <p style={{color:"#f59e0b",fontSize:11,fontWeight:700,margin:"0 0 10px",letterSpacing:"0.5px"}}>+ NUEVA SALIDA AUTOMÁTICA</p>
                  <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8,marginBottom:8}}>
                    <div>
                      <label style={s.label}>NOMBRE</label>
                      <input style={s.input} placeholder="Ej. Netflix, Luz, Agua" value={newSvc.name}
                        onChange={e=>setNewSvc(x=>({...x,name:e.target.value}))}/>
                    </div>
                    <div>
                      <label style={s.label}>MONTO (S/)</label>
                      <input type="number" style={s.input} placeholder="0.00" value={newSvc.amount}
                        onChange={e=>setNewSvc(x=>({...x,amount:e.target.value}))}/>
                    </div>
                    <div>
                      <label style={s.label}>DÍA DEL MES</label>
                      <input type="number" min="1" max="31" style={s.input} placeholder="1–31" value={newSvc.day}
                        onChange={e=>setNewSvc(x=>({...x,day:e.target.value}))}/>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:8}}>
                    <div>
                      <label style={s.label}>CUENTA</label>
                      <select style={s.select} value={newSvc.account}
                        onChange={e=>setNewSvc(x=>({...x,account:e.target.value}))}>
                        <option value="">Sin cuenta</option>
                        {activeAccounts.map(a=><option key={a}>{a}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={s.label}>CATEGORÍA</label>
                      <select style={s.select} value={newSvc.category}
                        onChange={e=>setNewSvc(x=>({...x,category:e.target.value}))}>
                        {[...(cfg.categories.gasto_fijo||[]),...(cfg.categories.gasto_variable||[])].map(c=><option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div style={{display:"flex",alignItems:"flex-end"}}>
                      <button onClick={()=>{
                        if (!newSvc.name.trim()||!newSvc.amount||!newSvc.day) return;
                        updateSvc(s=>[...s,{name:newSvc.name.trim(),amount:parseFloat(newSvc.amount),day:parseInt(newSvc.day),account:newSvc.account,category:newSvc.category}]);
                        setNewSvc({name:"",amount:"",day:"",account:"",category:"Suscripciones"});
                      }} style={{...s.btn,background:"rgba(245,158,11,0.15)",color:"#f59e0b",border:"1px solid rgba(245,158,11,0.3)",padding:"9px 14px",width:"100%"}}>
                        <Plus size={13}/> Agregar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── CUENTAS ── */}
          {section==="accounts"&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <p style={{color:"#555",fontSize:11,margin:"0 0 12px"}}>Activa/desactiva cuentas. Las activas aparecen en formularios y filtros.</p>
              {cfg.accounts.map((acc,i)=>(
                <div key={i} style={{background:"#111113",border:`1px solid ${acc.active?"#222226":"#141416"}`,borderLeft:`3px solid ${acc.active?acc.color:"#2a2a30"}`,borderRadius:8,padding:"10px 14px",opacity:acc.active?1:0.45,transition:"opacity .2s"}}>
                  {editAcc===i?(
                    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8,alignItems:"center"}}>
                      <input style={s.input} value={acc.name}
                        onChange={e=>updateAccounts(a=>a.map((x,j)=>j===i?{...x,name:e.target.value}:x))} placeholder="Nombre"/>
                      <select style={s.select} value={acc.type}
                        onChange={e=>updateAccounts(a=>a.map((x,j)=>j===i?{...x,type:e.target.value}:x))}>
                        {Object.entries(ACCOUNT_TYPES).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
                      </select>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{color:"#555",fontSize:11}}>Color:</span>
                        <input type="color" value={acc.color}
                          onChange={e=>updateAccounts(a=>a.map((x,j)=>j===i?{...x,color:e.target.value}:x))}
                          style={{width:36,height:28,borderRadius:4,border:"1px solid #2a2a30",background:"#0a0a0c",cursor:"pointer",padding:2}}/>
                      </div>
                      <button onClick={()=>setEditAcc(null)} style={{...s.btn,background:"#22c55e",color:"#fff",padding:"5px 10px",fontSize:11}}>✓</button>
                    </div>
                  ):(
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:16}}>{ACCOUNT_TYPES[acc.type]?.icon||"🏦"}</span>
                      <span style={{color:"#f0f0f2",fontWeight:600,fontSize:13,flex:1}}>{acc.name}</span>
                      <span style={{color:"#555",fontSize:11}}>{ACCOUNT_TYPES[acc.type]?.label}</span>
                      <div style={{width:10,height:10,borderRadius:"50%",background:acc.color,flexShrink:0}}/>
                      <button onClick={()=>updateAccounts(a=>a.map((x,j)=>j===i?{...x,active:!x.active}:x))}
                        style={{...s.btn,padding:"3px 10px",fontSize:11,background:acc.active?"rgba(34,197,94,0.1)":"#0a0a0c",color:acc.active?"#22c55e":"#555",border:`1px solid ${acc.active?"rgba(34,197,94,0.3)":"#2a2a30"}`}}>
                        {acc.active?"Activa":"Inactiva"}
                      </button>
                      <button onClick={()=>setEditAcc(i)} style={{background:"none",border:"none",color:"#444",cursor:"pointer",padding:3}}><Settings size={13}/></button>
                      <button onClick={()=>updateAccounts(a=>a.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"#333",cursor:"pointer",padding:3}}><Trash2 size={13}/></button>
                    </div>
                  )}
                </div>
              ))}
              <div style={{background:"rgba(34,197,94,0.05)",border:"1px dashed rgba(34,197,94,0.25)",borderRadius:8,padding:14,marginTop:4}}>
                <p style={{color:"#22c55e",fontSize:11,fontWeight:700,margin:"0 0 10px",letterSpacing:"0.5px"}}>+ NUEVA CUENTA</p>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8,alignItems:"center"}}>
                  <input style={s.input} placeholder="Nombre (ej. Interbank)" value={newAcc.name}
                    onChange={e=>setNewAcc(x=>({...x,name:e.target.value}))}/>
                  <select style={s.select} value={newAcc.type}
                    onChange={e=>setNewAcc(x=>({...x,type:e.target.value}))}>
                    {Object.entries(ACCOUNT_TYPES).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{color:"#555",fontSize:11}}>Color:</span>
                    <input type="color" value={newAcc.color}
                      onChange={e=>setNewAcc(x=>({...x,color:e.target.value}))}
                      style={{width:36,height:28,borderRadius:4,border:"1px solid #2a2a30",background:"#0a0a0c",cursor:"pointer",padding:2}}/>
                  </div>
                  <button onClick={()=>{
                    if (!newAcc.name.trim()) return;
                    updateAccounts(a=>[...a,{...newAcc,name:newAcc.name.trim()}]);
                    setNewAcc({name:"",type:"banco",color:"#888888",active:true});
                  }} style={{...s.btn,background:"rgba(34,197,94,0.15)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.3)",padding:"8px 12px"}}>
                    <Plus size={13}/>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── REGLAS ── */}
          {section==="rules"&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{...s.card,background:"rgba(56,189,248,0.04)",border:"1px solid rgba(56,189,248,0.15)",marginBottom:4}}>
                <p style={{color:"#38bdf8",fontSize:11,fontWeight:700,margin:"0 0 6px",letterSpacing:"0.5px"}}>📋 REGLAS DEL SISTEMA ({SYSTEM_RULES.length}) — Solo lectura</p>
                <p style={{color:"#555",fontSize:11,margin:0}}>Se aplican automáticamente. Tus reglas personales tienen prioridad.</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:10}}>
                  {SYSTEM_RULES.map((r,i)=>(
                    <span key={i} style={{background:"#0a0a0c",border:"1px solid #1a1a20",borderRadius:4,padding:"2px 7px",fontSize:10,color:"#666"}}>{r.label}</span>
                  ))}
                </div>
              </div>
              <p style={{color:"#555",fontSize:11,margin:"4px 0 8px"}}>Tus reglas — Se evalúan antes que las del sistema.</p>
              {cfg.custom_rules.length===0&&(
                <div style={{...s.card,textAlign:"center",color:"#444",padding:24}}>
                  No tienes reglas personalizadas aún.<br/>
                  <span style={{fontSize:11,color:"#333"}}>Agrega la primera abajo.</span>
                </div>
              )}
              {cfg.custom_rules.map((rule,i)=>(
                <div key={i} style={{background:"#111113",border:"1px solid rgba(34,197,94,0.2)",borderLeft:"3px solid #22c55e",borderRadius:8,padding:"10px 14px"}}>
                  {editRule===i?(
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:8}}>
                        <input style={s.input} value={rule.label} placeholder="Etiqueta"
                          onChange={e=>updateRules(r=>r.map((x,j)=>j===i?{...x,label:e.target.value}:x))}/>
                        <input style={s.input} value={rule.pattern} placeholder="Patrón"
                          onChange={e=>updateRules(r=>r.map((x,j)=>j===i?{...x,pattern:e.target.value}:x))}/>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:8}}>
                        <select style={s.select} value={rule.type}
                          onChange={e=>updateRules(r=>r.map((x,j)=>j===i?{...x,type:e.target.value}:x))}>
                          {Object.entries(TYPE_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <select style={s.select} value={rule.category}
                          onChange={e=>updateRules(r=>r.map((x,j)=>j===i?{...x,category:e.target.value}:x))}>
                          {(cfg.categories[rule.type]||[]).map(c=><option key={c}>{c}</option>)}
                        </select>
                        <button onClick={()=>setEditRule(null)} style={{...s.btn,background:"#22c55e",color:"#fff",padding:"6px 10px"}}>✓</button>
                      </div>
                      <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",width:"fit-content"}}>
                        <input type="checkbox" checked={!!rule.isInternal}
                          onChange={e=>updateRules(r=>r.map((x,j)=>j===i?{...x,isInternal:e.target.checked}:x))}
                          style={{accentColor:"#38bdf8",width:14,height:14}}/>
                        <span style={{color:"#38bdf8",fontSize:11,fontWeight:600}}>🔁 Transferencia interna</span>
                      </label>
                      <div style={{background:"#0a0a0c",borderRadius:6,padding:"8px 12px"}}>
                        <p style={{color:"#444",fontSize:10,margin:"0 0 4px",fontWeight:700}}>PRUEBA TU PATRÓN</p>
                        <RuleTest pattern={rule.pattern}/>
                      </div>
                    </div>
                  ):(
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{color:"#f0f0f2",fontWeight:600,fontSize:13,minWidth:100}}>{rule.label||"Sin etiqueta"}</span>
                      <code style={{color:"#38bdf8",fontSize:11,background:"#0a0a0c",padding:"2px 6px",borderRadius:4,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{rule.pattern}</code>
                      <span style={{fontSize:10,color:TYPE_CONFIG[rule.type]?.color,background:TYPE_CONFIG[rule.type]?.bg,padding:"2px 7px",borderRadius:4,border:`1px solid ${TYPE_CONFIG[rule.type]?.border}`,whiteSpace:"nowrap"}}>{rule.category}</span>
                      {rule.isInternal&&<span style={{background:"rgba(56,189,248,0.12)",color:"#38bdf8",fontSize:9,padding:"2px 6px",borderRadius:3,border:"1px solid rgba(56,189,248,0.25)",fontWeight:700,whiteSpace:"nowrap"}}>🔁 interna</span>}
                      <button onClick={()=>setEditRule(i)} style={{background:"none",border:"none",color:"#444",cursor:"pointer",padding:3}}><Settings size={13}/></button>
                      <button onClick={()=>updateRules(r=>r.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"#333",cursor:"pointer",padding:3}}><Trash2 size={13}/></button>
                    </div>
                  )}
                </div>
              ))}
              <div style={{background:"rgba(34,197,94,0.05)",border:"1px dashed rgba(34,197,94,0.25)",borderRadius:8,padding:14,marginTop:4}}>
                <p style={{color:"#22c55e",fontSize:11,fontWeight:700,margin:"0 0 10px",letterSpacing:"0.5px"}}>+ NUEVA REGLA</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:8,marginBottom:8}}>
                  <input style={s.input} placeholder="Etiqueta (ej. Parri Sur)" value={newRule.label}
                    onChange={e=>setNewRule(x=>({...x,label:e.target.value}))}/>
                  <input style={s.input} placeholder="Patrón (ej. PARRI SUR|PARRILLA)" value={newRule.pattern}
                    onChange={e=>setNewRule(x=>({...x,pattern:e.target.value}))}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:8}}>
                  <select style={s.select} value={newRule.type}
                    onChange={e=>setNewRule(x=>({...x,type:e.target.value,category:(cfg.categories[e.target.value]||[])[0]||""}))}>
                    {Object.entries(TYPE_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <select style={s.select} value={newRule.category}
                    onChange={e=>setNewRule(x=>({...x,category:e.target.value}))}>
                    {(cfg.categories[newRule.type]||[]).map(c=><option key={c}>{c}</option>)}
                  </select>
                  <button onClick={()=>{
                    if (!newRule.pattern.trim()) return;
                    updateRules(r=>[...r,{...newRule,label:newRule.label||newRule.pattern}]);
                    setNewRule({label:"",pattern:"",type:"gasto_variable",category:"Alimentación"});
                  }} style={{...s.btn,background:"rgba(34,197,94,0.15)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.3)",padding:"8px 12px"}}>
                    <Plus size={13}/>
                  </button>
                </div>
                {newRule.pattern&&<div style={{marginTop:10,background:"#0a0a0c",borderRadius:6,padding:"8px 12px"}}>
                  <p style={{color:"#444",fontSize:10,margin:"0 0 4px",fontWeight:700}}>PRUEBA EL PATRÓN</p>
                  <RuleTest pattern={newRule.pattern}/>
                </div>}
              </div>
            </div>
          )}

          {/* ─── CICLOS ── */}
          {section==="cycles"&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <p style={{color:"#555",fontSize:11,margin:"0 0 8px"}}>Define el día de corte y vencimiento de cada tarjeta.</p>
              {cfg.billing_cycles.map((c,i)=>(
                <div key={i} style={{background:"#111113",border:"1px solid rgba(167,139,250,0.2)",borderLeft:"3px solid #a78bfa",borderRadius:8,padding:"12px 16px",display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",gap:10,alignItems:"center"}}>
                  <input style={s.input} value={c.name} placeholder="Nombre tarjeta"
                    onChange={e=>updateCycles(cy=>cy.map((x,j)=>j===i?{...x,name:e.target.value}:x))}/>
                  <div>
                    <label style={s.label}>CORTE</label>
                    <input type="number" min="1" max="31" style={s.input} value={c.cutDay}
                      onChange={e=>updateCycles(cy=>cy.map((x,j)=>j===i?{...x,cutDay:parseInt(e.target.value)||15}:x))}/>
                  </div>
                  <div>
                    <label style={s.label}>VENCE</label>
                    <input type="number" min="1" max="31" style={s.input} value={c.dueDay}
                      onChange={e=>updateCycles(cy=>cy.map((x,j)=>j===i?{...x,dueDay:parseInt(e.target.value)||22}:x))}/>
                  </div>
                  <select style={s.select} value={c.account}
                    onChange={e=>updateCycles(cy=>cy.map((x,j)=>j===i?{...x,account:e.target.value}:x))}>
                    {activeAccounts.map(a=><option key={a}>{a}</option>)}
                  </select>
                  <button onClick={()=>updateCycles(cy=>cy.filter((_,j)=>j!==i))}
                    style={{background:"none",border:"none",color:"#333",cursor:"pointer",padding:4,marginTop:12}}><Trash2 size={14}/></button>
                  <div style={{gridColumn:"1/-1",background:"#0a0a0c",borderRadius:6,padding:"6px 12px",marginTop:2}}>
                    <span style={{color:"#555",fontSize:11}}>
                      Ciclo: del día <strong style={{color:"#a78bfa"}}>{c.cutDay+1}</strong> al <strong style={{color:"#a78bfa"}}>{c.cutDay}</strong> del mes siguiente · Vence el <strong style={{color:"#ef4444"}}>{c.dueDay}</strong>
                    </span>
                  </div>
                </div>
              ))}
              <div style={{background:"rgba(167,139,250,0.05)",border:"1px dashed rgba(167,139,250,0.25)",borderRadius:8,padding:14}}>
                <p style={{color:"#a78bfa",fontSize:11,fontWeight:700,margin:"0 0 10px",letterSpacing:"0.5px"}}>+ NUEVA TARJETA</p>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",gap:8,alignItems:"center"}}>
                  <input style={s.input} placeholder="Nombre (ej. Interbank VISA)" value={newCycle.name}
                    onChange={e=>setNewCycle(x=>({...x,name:e.target.value}))}/>
                  <div><label style={s.label}>CORTE</label>
                    <input type="number" style={s.input} placeholder="ej. 15" value={newCycle.cutDay}
                      onChange={e=>setNewCycle(x=>({...x,cutDay:e.target.value}))}/></div>
                  <div><label style={s.label}>VENCE</label>
                    <input type="number" style={s.input} placeholder="ej. 22" value={newCycle.dueDay}
                      onChange={e=>setNewCycle(x=>({...x,dueDay:e.target.value}))}/></div>
                  <select style={s.select} value={newCycle.account}
                    onChange={e=>setNewCycle(x=>({...x,account:e.target.value}))}>
                    {activeAccounts.map(a=><option key={a}>{a}</option>)}
                  </select>
                  <button onClick={()=>{
                    if (!newCycle.name.trim()) return;
                    updateCycles(cy=>[...cy,{name:newCycle.name,cutDay:parseInt(newCycle.cutDay)||15,dueDay:parseInt(newCycle.dueDay)||22,account:newCycle.account}]);
                    setNewCycle({name:"",cutDay:"",dueDay:"",account:""});
                  }} style={{...s.btn,background:"rgba(167,139,250,0.15)",color:"#a78bfa",border:"1px solid rgba(167,139,250,0.3)",padding:"8px 12px",marginTop:16}}>
                    <Plus size={13}/>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── TELEGRAM ── */}
          {section==="telegram"&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>

              {/* Estado actual */}
              <div style={{background:"#111113",border:"1px solid #222226",borderRadius:10,padding:16}}>
                <p style={{color:"#22d3ee",fontWeight:700,fontSize:11,margin:"0 0 14px",letterSpacing:"0.5px"}}>📡 ESTADO DEL BOT</p>
                {tgStatus ? (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                    {[
                      {label:"Token",   ok:tgStatus.token_configured,   si:"Configurado",   no:"Falta TOKEN"},
                      {label:"Chat ID", ok:tgStatus.chat_id_configured, si:"Configurado",   no:"Falta CHAT_ID"},
                      {label:"Bot",     ok:tgStatus.ready,              si:"Listo",          no:"No activo"},
                    ].map(item=>(
                      <div key={item.label} style={{background:"#0a0a0c",borderRadius:7,padding:"10px 12px",textAlign:"center"}}>
                        <div style={{fontSize:18,marginBottom:4}}>{item.ok?"✅":"⚠️"}</div>
                        <div style={{color:"#888",fontSize:10,marginBottom:2}}>{item.label}</div>
                        <div style={{color:item.ok?"#22c55e":"#f59e0b",fontWeight:700,fontSize:11}}>{item.ok?item.si:item.no}</div>
                      </div>
                    ))}
                    {tgStatus.scheduler?.next_run&&(
                      <div style={{gridColumn:"1/-1",background:"rgba(34,211,238,0.05)",border:"1px solid rgba(34,211,238,0.15)",borderRadius:6,padding:"8px 12px"}}>
                        <span style={{color:"#555",fontSize:11}}>⏱ Próximo envío automático: </span>
                        <span style={{color:"#22d3ee",fontSize:11,fontWeight:600}}>
                          {new Date(tgStatus.scheduler.next_run).toLocaleString("es-PE",{timeZone:"America/Lima",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{color:"#444",fontSize:12,textAlign:"center",padding:"8px 0"}}>Cargando estado...</p>
                )}
              </div>

              {/* Configuración */}
              <div style={{background:"#111113",border:"1px solid #222226",borderRadius:10,padding:16}}>
                <p style={{color:"#22d3ee",fontWeight:700,fontSize:11,margin:"0 0 14px",letterSpacing:"0.5px"}}>⚙️ CONFIGURACIÓN</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                  <div>
                    <label style={s.label}>DÍAS DE ANTICIPACIÓN</label>
                    <select style={s.select} value={tgCfg.anticipation_days}
                      onChange={e=>setTgCfg(c=>({...c,anticipation_days:parseInt(e.target.value)}))}
                    >
                      {[1,2,3,5,7].map(d=><option key={d} value={d}>{d} día{d>1?"s":""} antes</option>)}
                    </select>
                    <p style={{color:"#444",fontSize:10,margin:"4px 0 0"}}>Notificará cuando un evento esté a este tiempo de ocurrir</p>
                  </div>
                  <div>
                    <label style={s.label}>HORA DE ENVÍO</label>
                    <select style={s.select} value={tgCfg.notify_hour}
                      onChange={e=>setTgCfg(c=>({...c,notify_hour:parseInt(e.target.value)}))}
                    >
                      {[6,7,8,9,10].map(h=><option key={h} value={h}>{h}:00 AM (Lima)</option>)}
                    </select>
                    <p style={{color:"#444",fontSize:10,margin:"4px 0 0"}}>Hora peruana (UTC−5)</p>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                  <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                    <div onClick={()=>setTgCfg(c=>({...c,enabled:!c.enabled}))}
                      style={{width:40,height:22,borderRadius:11,background:tgCfg.enabled?"#22c55e":"#333",position:"relative",transition:"background .2s",cursor:"pointer",flexShrink:0}}>
                      <div style={{width:16,height:16,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:tgCfg.enabled?21:3,transition:"left .2s"}}/>
                    </div>
                    <span style={{color:tgCfg.enabled?"#22c55e":"#555",fontWeight:700,fontSize:13}}>
                      {tgCfg.enabled?"Bot activado":"Bot desactivado"}
                    </span>
                  </label>
                  <span style={{color:"#333",fontSize:11}}>{tgCfg.enabled?"Recibirás notificaciones diarias a las "+tgCfg.notify_hour+":00":"El bot no enviará mensajes"}</span>
                </div>
                <p style={{color:"#444",fontSize:11,margin:"0 0 14px",background:"#0a0a0c",borderRadius:6,padding:"8px 12px",borderLeft:"3px solid #22d3ee"}}>
                  💡 El <strong style={{color:"#22d3ee"}}>TELEGRAM_BOT_TOKEN</strong> y <strong style={{color:"#22d3ee"}}>TELEGRAM_CHAT_ID</strong>
                  {" "}se configuran como variables de entorno en el <code style={{background:"#111",padding:"1px 4px",borderRadius:3}}>.env</code>. No se almacenan en la interfaz por seguridad.
                </p>
                <button onClick={saveTgConfig} disabled={tgSaving}
                  style={{...s.btn,background:"linear-gradient(135deg,#22d3ee,#0ea5e9)",color:"#000",fontWeight:700,padding:"8px 20px",fontSize:12,width:"100%"}}>
                  {tgSaving?"Guardando...":"💾 Guardar configuración"}
                </button>
                {tgMsg&&<p style={{margin:"8px 0 0",fontSize:12,color:tgMsg.type==="ok"?"#22c55e":"#ef4444",textAlign:"center"}}>{tgMsg.text}</p>}
              </div>

              {/* Acciones */}
              <div style={{background:"#111113",border:"1px solid #222226",borderRadius:10,padding:16}}>
                <p style={{color:"#22d3ee",fontWeight:700,fontSize:11,margin:"0 0 14px",letterSpacing:"0.5px"}}>🧪 PRUEBAS Y ACCIONES</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
                  <button onClick={sendTestMsg}
                    style={{...s.btn,background:"rgba(34,211,238,0.1)",color:"#22d3ee",border:"1px solid rgba(34,211,238,0.3)",padding:"10px",fontSize:12,flexDirection:"column",gap:4,height:60}}>
                    📨<br/><span style={{fontSize:10}}>Mensaje prueba</span>
                  </button>
                  <button onClick={sendNotifyNow}
                    style={{...s.btn,background:"rgba(34,197,94,0.1)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.3)",padding:"10px",fontSize:12,flexDirection:"column",gap:4,height:60}}>
                    🔔<br/><span style={{fontSize:10}}>Notificar ahora</span>
                  </button>
                  <button onClick={loadPreview}
                    style={{...s.btn,background:"rgba(167,139,250,0.1)",color:"#a78bfa",border:"1px solid rgba(167,139,250,0.3)",padding:"10px",fontSize:12,flexDirection:"column",gap:4,height:60}}>
                    👁<br/><span style={{fontSize:10}}>Vista previa</span>
                  </button>
                </div>
                {tgPreview&&(
                  <div style={{background:"#0a0a0c",border:"1px solid #1a1a20",borderRadius:8,padding:14}}>
                    <p style={{color:"#555",fontSize:10,fontWeight:700,margin:"0 0 8px",letterSpacing:"0.5px"}}>PREVIEW DEL MENSAJE DE HOY</p>
                    {tgPreview.has_events ? (
                      <pre style={{color:"#d0d0d8",fontSize:11,margin:0,whiteSpace:"pre-wrap",fontFamily:"monospace",lineHeight:1.6}}>{tgPreview.preview.replace(/<[^>]+>/g,"")}</pre>
                    ) : (
                      <p style={{color:"#555",fontSize:12,margin:0,textAlign:"center"}}>ℹ️ Sin eventos próximos — no se enviaría nada hoy</p>
                    )}
                  </div>
                )}
              </div>

              {/* Qué notifica */}
              <div style={{background:"#111113",border:"1px solid #222226",borderRadius:10,padding:16}}>
                <p style={{color:"#555",fontWeight:700,fontSize:11,margin:"0 0 12px",letterSpacing:"0.5px"}}>📋 QUÉ NOTIFICA EL BOT</p>
                {[
                  {icon:"💳", text:"Vencimientos de tarjeta (VISA BBVA, VISA iO) con la anticipación configurada"},
                  {icon:"✂️", text:"Días de corte de tarjeta para revisión de cargos"},
                  {icon:"🔁", text:"Servicios recurrentes programados (Luz, Internet, Colegio, etc.)"},
                  {icon:"💰", text:"Día de pago de sueldo con el monto esperado"},
                  {icon:"⏰", text:"Envío automático cada día a las 8:00 AM hora Lima"},
                ].map((item,i)=>(
                  <div key={i} style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}>
                    <span style={{fontSize:16,flexShrink:0}}>{item.icon}</span>
                    <span style={{color:"#666",fontSize:12,lineHeight:1.5}}>{item.text}</span>
                  </div>
                ))}
              </div>

            </div>
          )}

          {/* ─── CATEGORÍAS ── */}
          {section==="categories"&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <p style={{color:"#555",fontSize:11,margin:"0 0 4px"}}>Administra las categorías disponibles para cada tipo de movimiento.</p>
              {Object.entries(TYPE_CONFIG).map(([type,tc])=>{
                const cats=cfg.categories[type]||[];
                return (
                  <div key={type} style={{...s.card,border:`1px solid ${tc.border}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <span style={{color:tc.color,fontWeight:700,fontSize:13}}>{tc.label}</span>
                      <span style={{color:"#444",fontSize:11}}>{cats.length} categorías</span>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                      {cats.map((cat,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:3,background:tc.bg,border:`1px solid ${tc.border}`,borderRadius:6,padding:"3px 6px 3px 10px"}}>
                          <span style={{color:tc.color,fontSize:12}}>{cat}</span>
                          <button onClick={()=>updateCats(type,cats.filter((_,j)=>j!==i))}
                            style={{background:"none",border:"none",color:tc.color,cursor:"pointer",padding:0,opacity:0.5,marginLeft:2}}>
                            <X size={10}/>
                          </button>
                        </div>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <input style={{...s.input,flex:1}} placeholder="Nueva categoría..."
                        value={newCat.type===type?newCat.name:""}
                        onFocus={()=>setNewCat({type,name:""})}
                        onChange={e=>setNewCat({type,name:e.target.value})}
                        onKeyDown={e=>{
                          if (e.key==="Enter"&&newCat.name.trim()&&newCat.type===type){
                            if (!cats.includes(newCat.name.trim())) updateCats(type,[...cats,newCat.name.trim()]);
                            setNewCat({type,name:""});
                          }
                        }}/>
                      <button onClick={()=>{
                        if (newCat.name.trim()&&newCat.type===type&&!cats.includes(newCat.name.trim())){
                          updateCats(type,[...cats,newCat.name.trim()]);
                          setNewCat({type,name:""});
                        }
                      }} style={{...s.btn,background:tc.bg,color:tc.color,border:`1px solid ${tc.border}`,padding:"7px 12px"}}>
                        <Plus size={13}/>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Mini componente: prueba un patrón en tiempo real ──────────
function RuleTest({pattern}) {
  const [test, setTest] = useState("");
  const re = compilePattern(pattern);
  const match = re && test.length>0 && re.test(test);
  return (
    <div style={{display:"flex",gap:8,alignItems:"center"}}>
      <input style={{...s.input,flex:1,fontSize:11}} placeholder='Escribe un comercio de prueba (ej. "PARRI SUR EIRL")' value={test}
        onChange={e=>setTest(e.target.value)}/>
      {test.length>0&&(
        <span style={{fontSize:12,fontWeight:700,minWidth:24,textAlign:"center",color:match?"#22c55e":"#ef4444"}}>
          {match?"✓":"✗"}
        </span>
      )}
    </div>
  );
}
