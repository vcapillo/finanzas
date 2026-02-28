/**
 * FinanzasVH v2.0 — Frontend React
 * Conectado a FastAPI + SQLite vía api.js
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, LineChart, Line, CartesianGrid, Legend
} from "recharts";
import {
  LayoutDashboard, List, Upload, Target, Calendar, BookOpen,
  Settings, Plus, X, Trash2, RefreshCw, ChevronRight, ChevronLeft,
  AlertTriangle, CheckCircle2, Search, Zap, Bell, Download,
  TrendingUp, TrendingDown, DollarSign, BarChart2, Edit2, Save
} from "lucide-react";
import { api } from "./api.js";
// ── v3.0: Nuevos módulos de Patrimonio e Ingesta IA ──────────
import PatrimonioConsolidado from "./components/patrimonio/PatrimonioConsolidado";
import IngestaExtracto       from "./components/ingesta/IngestaExtracto";
import TransferenciasPanel   from "./components/transferencias/TransferenciasPanel";

// ═══════════════════════════════════════════════════════════════
// CONSTANTES FIJAS
// ═══════════════════════════════════════════════════════════════
const TYPE_CONFIG = {
  ingreso:        { label:"💰 Ingreso",        color:"#22c55e", bg:"rgba(34,197,94,0.1)",   border:"rgba(34,197,94,0.25)"  },
  gasto_fijo:     { label:"🏠 Gasto Fijo",     color:"#f59e0b", bg:"rgba(245,158,11,0.1)",  border:"rgba(245,158,11,0.25)" },
  gasto_variable: { label:"🛒 Gasto Variable",  color:"#f87171", bg:"rgba(248,113,113,0.1)", border:"rgba(248,113,113,0.25)"},
  deuda:          { label:"💳 Deuda/Cuota",    color:"#a78bfa", bg:"rgba(167,139,250,0.1)", border:"rgba(167,139,250,0.25)"},
  ahorro:         { label:"🏦 Ahorro",         color:"#38bdf8", bg:"rgba(56,189,248,0.1)",  border:"rgba(56,189,248,0.25)" },
};

// Paleta extendida — colores distintos por categoría individual
const CAT_PALETTE = [
  "#22c55e","#f59e0b","#f87171","#38bdf8","#a78bfa",
  "#fb923c","#34d399","#e879f9","#facc15","#60a5fa",
  "#f472b6","#4ade80","#fbbf24","#a3e635","#c084fc",
  "#2dd4bf","#fb7185","#818cf8","#fdba74","#86efac",
];
const _catColorCache = {};
let   _catColorIdx   = 0;
const getCatColor = (cat, type) => {
  if (_catColorCache[cat]) return _catColorCache[cat];
  // Ingresos siempre verde, ahorros siempre azul claro
  if (type==="ingreso") return (_catColorCache[cat]="#22c55e");
  if (type==="ahorro")  return (_catColorCache[cat]="#38bdf8");
  const color = CAT_PALETTE[_catColorIdx % CAT_PALETTE.length];
  _catColorIdx++;
  _catColorCache[cat] = color;
  return color;
};

const ACCOUNT_TYPES = {
  banco:     { label:"Banco",      icon:"🏦" },
  billetera: { label:"Billetera",  icon:"📱" },
  tarjeta:   { label:"Tarjeta",    icon:"💳" },
  ahorro:    { label:"Ahorro",     icon:"💰" },
  efectivo:  { label:"Efectivo",   icon:"💵" },
  inversion: { label:"Inversión",  icon:"📈" },
};

// Defaults vacíos — el usuario configura sus cuentas desde ⚙️
const DEFAULT_ACCOUNTS = [];

const DEFAULT_CATEGORIES = {
  ingreso:        ["Sueldo","Honorarios","Transferencia recibida","Gratificación","CTS","Otro ingreso"],
  gasto_fijo:     ["Alquiler","Luz","Agua","Gas","Internet/Cable","Seguros","Suscripciones","Educación","Otro fijo"],
  gasto_variable: ["Alimentación","Transporte/Gasolina","Salud/Farmacia","Ropa","Ocio","Compras online","Restaurante","Otro variable"],
  deuda:          ["Préstamo","Cuota diferida","Tarjeta de crédito","Otra deuda"],
  ahorro:         ["Ahorro programado","Inversión","Fondo emergencia","Otro ahorro"],
};

// Reglas del sistema (base, no editables)
const SYSTEM_RULES = [
  {label:"Wong / Vivanda",      pattern:"WONG|VIVANDA",                                     type:"gasto_variable", category:"Alimentación"        },
  {label:"Plaza Vea",           pattern:"PLAZA.?VEA|SPSA|PVEA",                             type:"gasto_variable", category:"Alimentación"        },
  {label:"Metro / Cencosud",    pattern:"METRO\\b|CENCOSUD",                                type:"gasto_variable", category:"Alimentación"        },
  {label:"Tottus / Makro",      pattern:"TOTTUS|MAKRO",                                     type:"gasto_variable", category:"Alimentación"        },
  {label:"La Chalupa",          pattern:"CORPORACION.LA.C|CHALUPA",                         type:"gasto_variable", category:"Alimentación"        },
  {label:"Canasto",             pattern:"CANASTO|OPENPAY.*CANASTO",                         type:"gasto_variable", category:"Alimentación"        },
  {label:"MASS / Tambo",        pattern:"MASS\\b|TAMBO",                                    type:"gasto_variable", category:"Alimentación"        },
  {label:"InkaFarma",           pattern:"IKF|INKAFARMA",                                    type:"gasto_variable", category:"Salud/Farmacia"      },
  {label:"Mifarma / Botica",    pattern:"MIFARMA|FASA|BOTICA",                              type:"gasto_variable", category:"Salud/Farmacia"      },
  {label:"Grifo / Gasolina",    pattern:"PRIMAX|REPSOL|PECSA|PETRO|GRIFO|GO COMBUSTIBLES",  type:"gasto_variable", category:"Transporte/Gasolina" },
  {label:"Uber / Cabify",       pattern:"UBER|CABIFY|INDRIVER",                             type:"gasto_variable", category:"Transporte/Gasolina" },
  {label:"Parking",             pattern:"APPARKA|PARKING|PARQUEO",                          type:"gasto_variable", category:"Transporte/Gasolina" },
  {label:"Netflix",             pattern:"NETFLIX",                                          type:"gasto_fijo",     category:"Suscripciones"       },
  {label:"Apple",               pattern:"APPLE\\b|APPLE\\.COM",                             type:"gasto_fijo",     category:"Suscripciones"       },
  {label:"Spotify",             pattern:"SPOTIFY",                                          type:"gasto_fijo",     category:"Suscripciones"       },
  {label:"Pacífico / Rimac",    pattern:"PACIFICO|RIMAC|MAPFRE",                            type:"gasto_fijo",     category:"Seguros"             },
  {label:"Seguro desgravamen",  pattern:"SEGURO.?DESGRAVAMEN|DESGRAVAMEN",                  type:"gasto_fijo",     category:"Seguros"             },
  {label:"Luz Enel",            pattern:"ENEL|LUZ.DEL.SUR",                                 type:"gasto_fijo",     category:"Luz"                 },
  {label:"Agua Sedapal",        pattern:"SEDAPAL",                                          type:"gasto_fijo",     category:"Agua"                },
  {label:"Internet / Telefonía",pattern:"CLARO|MOVISTAR|ENTEL",                             type:"gasto_fijo",     category:"Internet/Cable"      },
  {label:"Hogar Jennifer",      pattern:"JENNIFER|ESPOSA",                                  type:"gasto_fijo",     category:"Hogar (Jennifer)"    },
  {label:"Pago Tarjeta BBVA",   pattern:"BM\\.?\\s*PAGO.?TARJET|PAGO.*TARJETA.*BBVA",      type:"deuda",          category:"Tarjeta BBVA"        },
  {label:"Pago Tarjeta iO",     pattern:"PAGO.*IO|IO.*PAGO",                                type:"deuda",          category:"Tarjeta iO"          },
  {label:"Sueldo MINEDU",       pattern:"SUELDO|REMUNERACION|HABERES|MINEDU",               type:"ingreso",        category:"Sueldo"              },
  {label:"Gratificación",       pattern:"GRATIFICACION",                                    type:"ingreso",        category:"Gratificación"       },
  {label:"CTS",                 pattern:"CTS\\b",                                           type:"ingreso",        category:"CTS"                 },
  {label:"Agora Ahorro",        pattern:"AGORA",                                            type:"ahorro",         category:"Ahorro programado"   },
  {label:"Restaurantes / Chifa",pattern:"RESTAURAN|KFC|MC.?DONALD|BEMBOS|PIZZA|BUFFET|DON BUFFET|CHIFA|PARRI", type:"gasto_variable", category:"Restaurante"},
  {label:"Ropa / Tiendas",      pattern:"SAGA|FALABELLA|RIPLEY|ZARA|OECHSLE",               type:"gasto_variable", category:"Ropa"                },
  {label:"Compras online",      pattern:"AMAZON|MERCADO.?LIBRE|LINIO",                      type:"gasto_variable", category:"Compras online"      },
  // ── Transferencias internas entre cuentas propias (isInternal: true) ──────
  {label:"Transfer BBVA→BCP",   pattern:"Transferencia a BCP Digital|TRANSF.*BCP",           type:"gasto_variable", category:"Movimiento interno", isInternal:true  },
  {label:"Transfer BCP→BBVA",   pattern:"TRANSF\\.BCO\\.BBVA|BANCO DE CREDITO D|TRAN\\.CTAS\\.TERC\\.BM", type:"gasto_variable", category:"Movimiento interno", isInternal:true  },
  {label:"Transfer BBVA→YAPE",  pattern:"YAPE.*SALIDA|TRANSF.*YAPE",                         type:"gasto_variable", category:"Movimiento interno", isInternal:true  },
  {label:"Transfer entre ctas", pattern:"TRANSF.*CTA|CTA.*TRANSF|TRANSFER.*PROPIA",           type:"gasto_variable", category:"Movimiento interno", isInternal:true  },
  {label:"TRANSF INMEDIATA BCP", pattern:"TRANSF INMEDIATA AL 002|TRANSF.*INMEDIATA.*002",   type:"gasto_variable", category:"Movimiento interno", isInternal:true  },
  // ── Comercios generales ─────────────────────────────────────────────────────
  {label:"Promart / Sodimac",   pattern:"PROMART|SODIMAC",                                  type:"gasto_variable", category:"Otro variable"       },
];

// Compila un patrón de texto a RegExp
function compilePattern(p) {
  try { return new RegExp(p, "i"); } catch { return null; }
}

// autoClassify → SOLO retorna type + category
// El account lo determina el selector de cuenta en el importador (fuente del extracto)
function autoClassify(description, amount, customRules=[]) {
  for (const rule of customRules) {
    const re = compilePattern(rule.pattern);
    if (re && re.test(description)) {
      return { type: amount>0 ? "ingreso" : rule.type, category: rule.category, confidence:"auto", ruleName: rule.label || "", isInternal: rule.isInternal || false };
    }
  }
  for (const rule of SYSTEM_RULES) {
    const re = compilePattern(rule.pattern);
    if (re && re.test(description)) {
      return { type: amount>0 ? "ingreso" : rule.type, category: rule.category, confidence:"auto", ruleName: rule.label || "", isInternal: rule.isInternal || false };
    }
  }
  if (amount > 0)             return { type:"ingreso",        category:"Otro ingreso",  confidence:"manual", ruleName:"", isInternal:false };
  if (Math.abs(amount)>=500)  return { type:"gasto_fijo",     category:"Otro fijo",     confidence:"manual", ruleName:"", isInternal:false };
  return                             { type:"gasto_variable",  category:"Otro variable", confidence:"manual", ruleName:"", isInternal:false };
}

// ═══════════════════════════════════════════════════════════════
// PANEL DE CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════
function SettingsPanel({ settings, profile: initialProfile, onSave, onSaveProfile, onClose }) {
  const [cfg, setCfg] = useState({
    accounts:       settings.accounts       || DEFAULT_ACCOUNTS,
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

  // ── Helpers settings ───────────────────────────────────────
  const updateAccounts  = fn => setCfg(c=>({...c, accounts:fn(c.accounts)}));
  const updateRules     = fn => setCfg(c=>({...c, custom_rules:fn(c.custom_rules)}));
  const updateCycles    = fn => setCfg(c=>({...c, billing_cycles:fn(c.billing_cycles)}));
  const updateCats      = (type, cats) => setCfg(c=>({...c, categories:{...c.categories,[type]:cats}}));
  // ── Helpers perfil ─────────────────────────────────────────
  const updateSvc       = fn => setProf(p=>({...p, recurring_services:fn(p.recurring_services)}));

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        onSave(cfg),
        onSaveProfile(prof),
      ]);
      onClose();
    } catch(e) { alert("Error guardando: "+e.message); }
    finally { setSaving(false); }
  };

  const activeAccounts = cfg.accounts.filter(a=>a.active).map(a=>a.name);

  // ── Estados para formularios nuevos ────────────────────────
  const [newAcc,  setNewAcc]  = useState({name:"",type:"banco",color:"#888888",active:true});
  const [newRule, setNewRule] = useState({label:"",pattern:"",type:"gasto_variable",category:"Alimentación",isInternal:false});
  const [newCycle,setNewCycle]= useState({name:"",cutDay:"",dueDay:"",account:""});
  const [newCat,  setNewCat]  = useState({type:"gasto_variable",name:""});
  const [newSvc,  setNewSvc]  = useState({name:"",amount:"",day:"",account:"",category:"Suscripciones"});
  const [editAcc, setEditAcc] = useState(null);
  const [editRule,setEditRule]= useState(null);

  const SECTIONS = [
    {id:"profile",   label:"👤 Perfil",       count: prof.recurring_services.length > 0 ? prof.recurring_services.length : null},
    {id:"accounts",  label:"🏦 Cuentas",       count: cfg.accounts.filter(a=>a.active).length},
    {id:"rules",     label:"⚡ Reglas",         count: cfg.custom_rules.length || null},
    {id:"cycles",    label:"📅 Ciclos",         count: cfg.billing_cycles.length || null},
    {id:"categories",label:"🗂️ Categorías",    count: null},
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

          {/* ─── PERFIL ────────────────────────────────────────── */}
          {section==="profile"&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>

              {/* Datos básicos */}
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
                    <input type="number" style={s.input} value={prof.income||""}
                      placeholder="0.00"
                      onChange={e=>setProf(p=>({...p,income:parseFloat(e.target.value)||0}))}/>
                  </div>
                  <div>
                    <label style={s.label}>DÍA DE COBRO</label>
                    <input type="number" min="1" max="31" style={s.input} value={prof.pay_day||""}
                      placeholder="1–31"
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

              {/* Servicios recurrentes */}
              <div style={{background:"#111113",border:"1px solid #222226",borderRadius:10,padding:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div>
                    <p style={{color:"#f59e0b",fontWeight:700,fontSize:11,margin:0,letterSpacing:"0.5px"}}>SALIDAS AUTOMÁTICAS / SERVICIOS RECURRENTES</p>
                    <p style={{color:"#555",fontSize:11,margin:"4px 0 0"}}>Pagos fijos que ocurren cada mes (servicios, suscripciones, transferencias programadas).</p>
                  </div>
                  {prof.recurring_services.length>0&&(
                    <span style={{color:"#f59e0b",fontWeight:700,fontSize:13}}>
                      −{fmtN(prof.recurring_services.reduce((s,sv)=>s+Number(sv.amount),0))}
                    </span>
                  )}
                </div>

                {/* Lista de servicios */}
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
                  {prof.recurring_services.length===0&&(
                    <p style={{color:"#333",fontSize:12,textAlign:"center",padding:"16px 0"}}>
                      Sin servicios aún — agrega tus pagos fijos abajo
                    </p>
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

                {/* Formulario nuevo servicio */}
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
                        updateSvc(s=>[...s,{
                          name:newSvc.name.trim(),
                          amount:parseFloat(newSvc.amount),
                          day:parseInt(newSvc.day),
                          account:newSvc.account,
                          category:newSvc.category,
                        }]);
                        setNewSvc({name:"",amount:"",day:"",account:"",category:"Suscripciones"});
                      }} style={{...s.btn,background:"rgba(245,158,11,0.15)",color:"#f59e0b",
                        border:"1px solid rgba(245,158,11,0.3)",padding:"9px 14px",width:"100%"}}>
                        <Plus size={13}/> Agregar
                      </button>
                    </div>
                  </div>
                  <p style={{color:"#333",fontSize:10,margin:"10px 0 0"}}>
                    Ejemplos: Netflix · S/35 · día 14 | Luz Enel · S/120 · día 20 | Internet · S/89 · día 5
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ─── CUENTAS ───────────────────────────────────────── */}
          {section==="accounts"&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <p style={{color:"#555",fontSize:11,margin:"0 0 12px"}}>Activa/desactiva cuentas. Las activas aparecen en formularios y filtros.</p>

              {cfg.accounts.map((acc,i)=>(
                <div key={i} style={{background:"#111113",border:`1px solid ${acc.active?"#222226":"#141416"}`,borderLeft:`3px solid ${acc.active?acc.color:"#2a2a30"}`,borderRadius:8,padding:"10px 14px",
                  opacity:acc.active?1:0.45,transition:"opacity .2s"}}>
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
                      {/* Toggle activo */}
                      <button onClick={()=>updateAccounts(a=>a.map((x,j)=>j===i?{...x,active:!x.active}:x))}
                        style={{...s.btn,padding:"3px 10px",fontSize:11,
                          background:acc.active?"rgba(34,197,94,0.1)":"#0a0a0c",
                          color:acc.active?"#22c55e":"#555",
                          border:`1px solid ${acc.active?"rgba(34,197,94,0.3)":"#2a2a30"}`}}>
                        {acc.active?"Activa":"Inactiva"}
                      </button>
                      <button onClick={()=>setEditAcc(i)} style={{background:"none",border:"none",color:"#444",cursor:"pointer",padding:3}}><Settings size={13}/></button>
                      <button onClick={()=>updateAccounts(a=>a.filter((_,j)=>j!==i))}
                        style={{background:"none",border:"none",color:"#333",cursor:"pointer",padding:3}}><Trash2 size={13}/></button>
                    </div>
                  )}
                </div>
              ))}

              {/* Nueva cuenta */}
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

          {/* ─── REGLAS ────────────────────────────────────────── */}
          {section==="rules"&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {/* Reglas del sistema (solo lectura) */}
              <div style={{...s.card,background:"rgba(56,189,248,0.04)",border:"1px solid rgba(56,189,248,0.15)",marginBottom:4}}>
                <p style={{color:"#38bdf8",fontSize:11,fontWeight:700,margin:"0 0 6px",letterSpacing:"0.5px"}}>📋 REGLAS DEL SISTEMA ({SYSTEM_RULES.length}) — Solo lectura</p>
                <p style={{color:"#555",fontSize:11,margin:0}}>Se aplican automáticamente. Tus reglas personales tienen prioridad sobre éstas.</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:10}}>
                  {SYSTEM_RULES.map((r,i)=>(
                    <span key={i} style={{background:"#0a0a0c",border:"1px solid #1a1a20",borderRadius:4,padding:"2px 7px",fontSize:10,color:"#666"}}>{r.label}</span>
                  ))}
                </div>
              </div>

              <p style={{color:"#555",fontSize:11,margin:"4px 0 8px"}}>Tus reglas — Se evalúan antes que las del sistema. El patrón es texto simple o expresión regular.</p>

              {cfg.custom_rules.length===0&&(
                <div style={{...s.card,textAlign:"center",color:"#444",padding:24}}>
                  No tienes reglas personalizadas aún.<br/>
                  <span style={{fontSize:11,color:"#333"}}>Agrega la primera abajo — ej. "PARRI SUR" para clasificar PARRI SUR EIRL como Restaurante.</span>
                </div>
              )}

              {cfg.custom_rules.map((rule,i)=>(
                <div key={i} style={{background:"#111113",border:"1px solid rgba(34,197,94,0.2)",borderLeft:"3px solid #22c55e",borderRadius:8,padding:"10px 14px"}}>
                  {editRule===i?(
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:8}}>
                        <input style={s.input} value={rule.label} placeholder="Etiqueta (ej. Parri Sur)"
                          onChange={e=>updateRules(r=>r.map((x,j)=>j===i?{...x,label:e.target.value}:x))}/>
                        <input style={s.input} value={rule.pattern} placeholder="Patrón (ej. PARRI SUR|PARRILLA)"
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
                      {/* Toggle transferencia interna */}
                      <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",width:"fit-content"}}>
                        <input type="checkbox" checked={!!rule.isInternal}
                          onChange={e=>updateRules(r=>r.map((x,j)=>j===i?{...x,isInternal:e.target.checked}:x))}
                          style={{accentColor:"#38bdf8",width:14,height:14}}/>
                        <span style={{color:"#38bdf8",fontSize:11,fontWeight:600}}>🔁 Transferencia interna</span>
                        <span style={{color:"#444",fontSize:10}}>(excluye del análisis y genera movimiento espejo en Ingesta IA)</span>
                      </label>
                      {/* Test de patrón */}
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

              {/* Nueva regla */}
              <div style={{background:"rgba(34,197,94,0.05)",border:"1px dashed rgba(34,197,94,0.25)",borderRadius:8,padding:14,marginTop:4}}>
                <p style={{color:"#22c55e",fontSize:11,fontWeight:700,margin:"0 0 10px",letterSpacing:"0.5px"}}>+ NUEVA REGLA — clasifica tipo y categoría</p>
                <p style={{color:"#444",fontSize:11,margin:"0 0 10px"}}>La cuenta se asigna al importar según el extracto que subas, no aquí.</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:8,marginBottom:8}}>
                  <input style={s.input} placeholder="Etiqueta (ej. Parri Sur)" value={newRule.label}
                    onChange={e=>setNewRule(x=>({...x,label:e.target.value}))}/>
                  <input style={s.input} placeholder="Patrón de texto (ej. PARRI SUR|PARRILLA)" value={newRule.pattern}
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

              {/* Reglas pendientes del extracto iO */}
              <div style={{...s.card,background:"rgba(245,158,11,0.05)",border:"1px solid rgba(245,158,11,0.2)",marginTop:4}}>
                <p style={{color:"#f59e0b",fontSize:11,fontWeight:700,margin:"0 0 8px",letterSpacing:"0.5px"}}>💡 COMERCIOS SIN REGLA de tu último extracto</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {["PARRI SUR EIRL→Restaurante","CAFAE→Alimentación","MEDITERRANEO→Restaurante","50334 B2 MALL DEL SUR→Ocio","KSK MALL DEL SUR→Ocio","Boxes carwash→Transporte/Gasolina","DON BUFFET→Restaurante"].map(hint=>{
                    const [comercio,cat]=hint.split("→");
                    return (
                      <button key={hint} onClick={()=>{
                        setNewRule(x=>({...x,label:comercio.trim(),pattern:comercio.trim().split(" ").slice(0,2).join(".*"),category:cat.trim()}));
                        setSection("rules");
                      }} style={{...s.btn,background:"rgba(245,158,11,0.1)",color:"#f59e0b",border:"1px solid rgba(245,158,11,0.25)",padding:"4px 10px",fontSize:11}}>
                        + {comercio.trim()} → {cat.trim()}
                      </button>
                    );
                  })}
                </div>
                <p style={{color:"#555",fontSize:10,margin:"8px 0 0"}}>Haz clic para pre-llenar el formulario de nueva regla.</p>
              </div>
            </div>
          )}

          {/* ─── CICLOS ────────────────────────────────────────── */}
          {section==="cycles"&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <p style={{color:"#555",fontSize:11,margin:"0 0 8px"}}>Define el día de corte y vencimiento de cada tarjeta. El calendario y el importador usan esta información.</p>
              {cfg.billing_cycles.map((c,i)=>(
                <div key={i} style={{background:"#111113",border:"1px solid rgba(167,139,250,0.2)",borderLeft:"3px solid #a78bfa",borderRadius:8,padding:"12px 16px",
                  display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",gap:10,alignItems:"center"}}>
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
                  {/* Info de ciclo */}
                  <div style={{gridColumn:"1/-1",background:"#0a0a0c",borderRadius:6,padding:"6px 12px",marginTop:2}}>
                    <span style={{color:"#555",fontSize:11}}>
                      Ciclo: compras del día <strong style={{color:"#a78bfa"}}>{c.cutDay+1}</strong> al <strong style={{color:"#a78bfa"}}>{c.cutDay}</strong> del mes siguiente · Vence el <strong style={{color:"#ef4444"}}>{c.dueDay}</strong>
                    </span>
                  </div>
                </div>
              ))}

              {/* Nuevo ciclo */}
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
                    setNewCycle({name:"",cutDay:"",dueDay:"",account:"BBVA"});
                  }} style={{...s.btn,background:"rgba(167,139,250,0.15)",color:"#a78bfa",border:"1px solid rgba(167,139,250,0.3)",padding:"8px 12px",marginTop:16}}>
                    <Plus size={13}/>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── CATEGORÍAS ────────────────────────────────────── */}
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
                    {/* Add category */}
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

// Mini componente: prueba un patrón en tiempo real
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

function parseStatementText(rawText, bankHint="auto") {
  const lines = rawText.split(/\n/).map(l=>l.trim()).filter(Boolean);
  const results = [];
  const datePatterns = [
    /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/,
    /^(\d{2})[\/\-](\d{2})[\/\-](\d{2})\b/,
    /^(\d{4})[\/\-](\d{2})[\/\-](\d{2})/,
  ];
  for (const line of lines) {
    let isoDate = null, rest = line;
    for (const pat of datePatterns) {
      const m = line.match(pat);
      if (m) {
        let [,d,mo,y] = m;
        if (pat === datePatterns[2]) { y=d; mo=mo; d=y.slice(-2); }
        if (y.length===2) y="20"+y;
        isoDate = `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
        rest = line.slice(m[0].length).trim();
        break;
      }
    }
    if (!isoDate) continue;
    let amount=null, description=rest;
    const twoAmt = rest.match(/^(.+?)\s+(-?[\d,\.]+)\s+(-?[\d,\.]+)\s*$/);
    if (twoAmt) {
      const [,desc,deb,hab] = twoAmt;
      const d2=parseFloat(deb.replace(/,/g,"")), h=parseFloat(hab.replace(/,/g,""));
      description=desc.trim(); amount=h>0?h:-d2;
    } else {
      const s = rest.match(/^(.+?)\s+S?\/?\s*(-?[\d,\.]+)\s*$/);
      if (s) {
        const [,desc,amtStr]=s;
        description=desc.trim(); amount=parseFloat(amtStr.replace(/,/g,""));
        if (bankHint==="BBVA" && !/(INGRESO|CREDITO|ABONO|SUELDO|REMUNER)/i.test(description)) amount=-Math.abs(amount);
      }
    }
    if (!amount||isNaN(amount)||description.length<3) continue;
    const period=isoDate.substring(0,7);
    results.push({ date:isoDate, period, description, amount, ...autoClassify(description,amount), source:"import_text" });
  }
  return results;
}

function parseCSV(text, bankHint="auto") {
  const lines=text.split(/\n/).filter(l=>l.trim());
  if (lines.length<2) return [];
  const sep=lines[0].includes(";")?";":","
  const headers=lines[0].split(sep).map(h=>h.trim().toLowerCase().replace(/"/g,""));
  const colMap={};
  headers.forEach((h,i)=>{
    if (/fecha|date/i.test(h)) colMap.date=i;
    if (/descripci|operaci|concepto|detail|desc/i.test(h)) colMap.desc=i;
    if (/monto|importe|amount|valor/i.test(h)&&!colMap.amount) colMap.amount=i;
    if (/cargo|debito|debe|debit/i.test(h)) colMap.debit=i;
    if (/abono|credito|haber|credit/i.test(h)) colMap.credit=i;
  });
  const results=[];
  for (let i=1;i<lines.length;i++) {
    const cols=lines[i].split(sep).map(c=>c.trim().replace(/"/g,""));
    const dateRaw=colMap.date!==undefined?cols[colMap.date]:"";
    const desc=colMap.desc!==undefined?cols[colMap.desc]:cols[1]||"";
    let amount=0;
    if (colMap.debit!==undefined||colMap.credit!==undefined) {
      const deb=parseFloat((cols[colMap.debit]||"0").replace(/[,\s]/g,""))||0;
      const cred=parseFloat((cols[colMap.credit]||"0").replace(/[,\s]/g,""))||0;
      amount=cred>0?cred:-deb;
    } else if (colMap.amount!==undefined) {
      amount=parseFloat((cols[colMap.amount]||"0").replace(/[,\s]/g,""))||0;
      if (bankHint==="BBVA"&&!/(INGRESO|CREDITO|ABONO|SUELDO)/i.test(desc)) amount=-Math.abs(amount);
    }
    if (!dateRaw||isNaN(amount)||!desc) continue;
    let isoDate=dateRaw;
    const dm=dateRaw.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})/);
    if (dm){const[,d,m,y]=dm;isoDate=`${y.length===2?"20"+y:y}-${m}-${d}`;}
    results.push({ date:isoDate, period:isoDate.substring(0,7), description:desc, amount, ...autoClassify(desc,amount), source:"import_csv" });
  }
  return results;
}

// ─── Helpers ──────────────────────────────────────────────────
const fmt  = n => `S/ ${Math.abs(n).toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtN = n => `S/ ${n.toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

function calcMetrics(txs, fallbackIncome=0) {
  // BUGFIX v3.1: excluir movimientos internos (transferencias entre cuentas propias)
  // excluir_del_analisis=true → no deben afectar ingresos, gastos ni saldo neto
  const active=txs.filter(t=>!t.excluir_del_analisis);
  const ingresos=active.filter(t=>t.type==="ingreso").reduce((s,t)=>s+t.amount,0)||fallbackIncome;
  const gastosFijos=active.filter(t=>t.type==="gasto_fijo").reduce((s,t)=>s+Math.abs(t.amount),0);
  const gastosVariables=active.filter(t=>t.type==="gasto_variable").reduce((s,t)=>s+Math.abs(t.amount),0);
  const deudas=active.filter(t=>t.type==="deuda").reduce((s,t)=>s+Math.abs(t.amount),0);
  const ahorros=active.filter(t=>t.type==="ahorro").reduce((s,t)=>s+Math.abs(t.amount),0);
  const totalGastos=gastosFijos+gastosVariables+deudas+ahorros;
  const saldoNeto=ingresos-totalGastos;
  return {ingresos,gastosFijos,gastosVariables,deudas,ahorros,totalGastos,saldoNeto,
    tasaAhorro:(ahorros/ingresos)*100, ratioDeuda:(deudas/ingresos)*100};
}

function getHealth(m) {
  const score=(m.tasaAhorro>=10?2:m.tasaAhorro>=5?1:0)+(m.ratioDeuda<=25?2:m.ratioDeuda<=35?1:0)+(m.saldoNeto>=0?2:0);
  return score>=5?"green":score>=3?"yellow":"red";
}
const HEALTH={
  green: {icon:"🟢",label:"Saludable",   color:"#22c55e"},
  yellow:{icon:"🟡",label:"Observación", color:"#f59e0b"},
  red:   {icon:"🔴",label:"Acción urgente",color:"#ef4444"},
};

const s = {
  card:  { background:"#111113", border:"1px solid #222226", borderRadius:12, padding:"18px 20px" },
  input: { width:"100%", background:"#0a0a0c", border:"1px solid #2a2a30", color:"#f0f0f2", borderRadius:8, padding:"8px 12px", fontSize:13, boxSizing:"border-box", outline:"none" },
  select:{ width:"100%", background:"#0a0a0c", border:"1px solid #2a2a30", color:"#f0f0f2", borderRadius:8, padding:"8px 12px", fontSize:13, boxSizing:"border-box", cursor:"pointer" },
  btn:   { border:"none", borderRadius:8, padding:"9px 18px", fontSize:13, fontWeight:600, cursor:"pointer" },
  label: { color:"#666670", fontSize:11, fontWeight:600, display:"block", marginBottom:4, letterSpacing:"0.5px" },
};

const Chip = ({type}) => {
  const c=TYPE_CONFIG[type];
  return <span style={{background:c.bg,color:c.color,border:`1px solid ${c.border}`,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{c.label}</span>;
};
const Metric = ({label,value,sub,color="#f0f0f2",icon}) => (
  <div style={{...s.card,display:"flex",flexDirection:"column",gap:6}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{color:"#555560",fontSize:12}}>{label}</span>
      <span style={{fontSize:18}}>{icon}</span>
    </div>
    <div style={{color,fontSize:20,fontWeight:700}}>{value}</div>
    {sub&&<div style={{color:"#44444e",fontSize:11}}>{sub}</div>}
  </div>
);
const TTip = ({active,payload,label}) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{
      background:"#ffffff", border:"1px solid #e2e8f0",
      borderRadius:10, padding:"10px 16px",
      boxShadow:"0 4px 20px rgba(0,0,0,0.35)", minWidth:140
    }}>
      {label&&<p style={{color:"#475569",fontSize:11,fontWeight:600,margin:"0 0 6px",letterSpacing:"0.3px"}}>{label}</p>}
      {payload.map((p,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:7,marginTop:i>0?4:0}}>
          <span style={{width:10,height:10,borderRadius:3,background:p.color||"#64748b",display:"inline-block",flexShrink:0}}/>
          <span style={{color:"#334155",fontSize:12}}>{p.name}:</span>
          <span style={{color:"#0f172a",fontSize:13,fontWeight:700,marginLeft:"auto",paddingLeft:8}}>
            {typeof p.value==="number"?fmtN(p.value):p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// Tooltip genérico para charts en USD (inversiones)
const TTipUSD = ({active,payload,label}) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{
      background:"#ffffff", border:"1px solid #e2e8f0",
      borderRadius:10, padding:"10px 16px",
      boxShadow:"0 4px 20px rgba(0,0,0,0.35)", minWidth:150
    }}>
      {label&&<p style={{color:"#475569",fontSize:11,fontWeight:600,margin:"0 0 6px"}}>{label}</p>}
      {payload.map((p,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:7,marginTop:i>0?4:0}}>
          <span style={{width:10,height:10,borderRadius:3,background:p.color||"#64748b",display:"inline-block",flexShrink:0}}/>
          <span style={{color:"#334155",fontSize:12}}>{p.name}:</span>
          <span style={{color:"#0f172a",fontSize:13,fontWeight:700,marginLeft:"auto",paddingLeft:8}}>
            {typeof p.value==="number"?`$${p.value.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`:p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// IMPORTADOR — con deduplicación y distribución por período
// ═══════════════════════════════════════════════════════════════
function Importer({ onImport, existingTransactions=[], profile={}, customRules=[], activeAccounts=[], categories=DEFAULT_CATEGORIES }) {
  const [mode,setMode]               = useState("text");
  const [bankHint,setBankHint]       = useState("auto");        // ayuda al parser a interpretar signos (+/-)
  const [sourceAccount,setSourceAccount] = useState("");         // cuenta real de TODAS las tx del lote
  const [rawText,setRawText]         = useState("");
  const [preview,setPreview]         = useState([]);
  const [parsed,setParsed]           = useState(false);
  const [editIdx,setEditIdx]         = useState(null);
  const [importing,setImporting]     = useState(false);
  const [importResult,setImportResult] = useState(null);
  const fileRef = useRef();

  // Cuando cambia la lista de cuentas activas, inicializar con la primera si aún no hay selección
  useState(()=>{ if (!sourceAccount && activeAccounts.length) setSourceAccount(activeAccounts[0]); });

  const descSimilar=(a,b)=>{
    const na=a.toLowerCase().replace(/[^a-z0-9]/g,"");
    const nb=b.toLowerCase().replace(/[^a-z0-9]/g,"");
    if (!na||!nb) return false;
    const longer=na.length>nb.length?na:nb, shorter=na.length>nb.length?nb:na;
    const m=shorter.split("").filter(c=>longer.includes(c)).length;
    return m/longer.length>=0.5;
  };

  const buildPreview=(txs)=>txs.map(tx=>({
    ...tx,
    account: sourceAccount || activeAccounts[0] || "BBVA", // ← cuenta del extracto, NO de la regla
    ...autoClassify(tx.description, tx.amount, customRules), // ← solo type + category
    isDup: existingTransactions.some(ex=>
      Math.round(ex.amount*100)===Math.round(tx.amount*100) &&
      Math.abs(new Date(ex.date)-new Date(tx.date))/86400000<=1 &&
      descSimilar(ex.description,tx.description)
    ),
    excluded: false,
  })).map(tx=>({...tx, excluded:tx.isDup}));

  const handleParse=()=>{
    if (!rawText.trim()) return;
    setPreview(buildPreview(parseStatementText(rawText,bankHint)));
    setParsed(true); setImportResult(null);
  };
  const handleCSV=(e)=>{
    const file=e.target.files[0]; if (!file) return;
    const reader=new FileReader();
    reader.onload=(ev)=>{ setPreview(buildPreview(parseCSV(ev.target.result,bankHint))); setParsed(true); setImportResult(null); };
    reader.readAsText(file,"latin1");
  };
  const toggleExclude=(idx)=>setPreview(p=>p.map((t,i)=>i===idx?{...t,excluded:!t.excluded}:t));
  const updatePreview=(idx,field,val)=>setPreview(p=>p.map((t,i)=>i!==idx?t:{...t,[field]:field==="amount"?parseFloat(val)||t.amount:val}));

  const confirmImport=async()=>{
    const toSend=preview.filter(t=>!t.excluded).map(({isDup,excluded,...tx})=>tx);
    if (!toSend.length) return;
    setImporting(true);
    try {
      const result=await onImport(toSend);
      setImportResult(result);
      setPreview([]); setRawText(""); setParsed(false);
    } catch(e) { alert("Error al importar: "+e.message); }
    finally { setImporting(false); }
  };

  const toImport=preview.filter(t=>!t.excluded);
  const dups=preview.filter(t=>t.isDup);
  const periodDist={};
  toImport.forEach(t=>{ periodDist[t.period]=(periodDist[t.period]||0)+1; });
  const PERIOD_LABELS_LOCAL={
    "2025-09":"Sep 25","2025-10":"Oct 25","2025-11":"Nov 25","2025-12":"Dic 25",
    "2026-01":"Ene 26","2026-02":"Feb 26","2026-03":"Mar 26","2026-04":"Abr 26",
    "2026-05":"May 26","2026-06":"Jun 26","2026-07":"Jul 26","2026-08":"Ago 26",
    "2026-09":"Sep 26","2026-10":"Oct 26","2026-11":"Nov 26","2026-12":"Dic 26",
  };
  const lbl=(p)=>PERIOD_LABELS_LOCAL[p]||p;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Contexto ciclos */}
      {(profile.billing_cycles||[]).length>0 && (
        <div style={{...s.card,background:"rgba(167,139,250,0.04)",border:"1px solid rgba(167,139,250,0.2)"}}>
          <p style={{color:"#a78bfa",fontWeight:700,fontSize:12,margin:"0 0 10px",letterSpacing:"0.5px"}}>📅 CICLOS — Cada transacción va a su mes real</p>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {(profile.billing_cycles||[]).map((c,i)=>(
              <div key={i} style={{background:"#0a0a0c",borderRadius:8,padding:"8px 14px",fontSize:12}}>
                <span style={{color:"#d0d0d8",fontWeight:600}}>💳 {c.name}</span>
                <span style={{color:"#555",marginLeft:8}}>Corte {c.cutDay} · Vence {c.dueDay}</span>
              </div>
            ))}
          </div>
          <p style={{color:"#555",fontSize:11,margin:"8px 0 0"}}>Las compras del extracto se asignan a su mes real, no al mes del extracto.</p>
        </div>
      )}

      {/* Resultado de importación */}
      {importResult && (
        <div style={{...s.card,background:"rgba(34,197,94,0.06)",border:"1px solid rgba(34,197,94,0.25)"}}>
          <CheckCircle2 size={16} color="#22c55e" style={{display:"inline",marginRight:8}}/>
          <span style={{color:"#22c55e",fontWeight:700}}>{importResult.message}</span>
        </div>
      )}

      {/* Panel principal */}
      <div style={s.card}>
        <div style={{display:"flex",gap:3,marginBottom:16}}>
          {[["text","📋 Pegar texto (PDF)"],["csv","📊 Importar CSV"]].map(([m,lbl2])=>(
            <button key={m} onClick={()=>{setMode(m);setParsed(false);setPreview([]);setImportResult(null);}}
              style={{...s.btn,flex:1,background:mode===m?"rgba(34,197,94,0.12)":"#0a0a0c",
                color:mode===m?"#22c55e":"#666",border:`1px solid ${mode===m?"rgba(34,197,94,0.35)":"#2a2a30"}`}}>{lbl2}</button>
          ))}
        </div>
        {/* ── Selector de cuenta origen — obligatorio ─────── */}
        <div style={{background:"rgba(34,197,94,0.06)",border:"1px solid rgba(34,197,94,0.25)",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{display:"flex",flexDirection:"column",gap:4,flex:1,minWidth:200}}>
              <label style={{...s.label,color:"#22c55e",margin:0}}>
                💳 CUENTA / TARJETA DE ORIGEN  <span style={{color:"#ef4444"}}>*</span>
              </label>
              <p style={{color:"#555",fontSize:11,margin:0}}>¿De qué cuenta o tarjeta es este extracto? Todas las transacciones se asignarán a esta cuenta.</p>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {activeAccounts.map(acc=>(
                <button key={acc} onClick={()=>{setSourceAccount(acc); setParsed(false); setPreview([]);}}
                  style={{...s.btn,padding:"6px 14px",fontSize:12,
                    background:sourceAccount===acc?"rgba(34,197,94,0.15)":"#0a0a0c",
                    color:sourceAccount===acc?"#22c55e":"#666",
                    border:`1px solid ${sourceAccount===acc?"rgba(34,197,94,0.4)":"#2a2a30"}`,
                    fontWeight:sourceAccount===acc?700:400}}>
                  {acc}
                </button>
              ))}
            </div>
          </div>
          {sourceAccount&&(
            <div style={{marginTop:10,padding:"6px 12px",background:"#0a0a0c",borderRadius:6,display:"flex",alignItems:"center",gap:8}}>
              <span style={{color:"#22c55e",fontSize:12,fontWeight:700}}>✓ Todas las transacciones → {sourceAccount}</span>
              <span style={{color:"#444",fontSize:11}}>· Las reglas solo clasificarán tipo y categoría</span>
            </div>
          )}
        </div>

        {/* ── Ayuda al parser (signo de montos) ───────────── */}
        <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}>
          <label style={{...s.label,margin:0,minWidth:130,color:"#555"}}>🔢 FORMATO DE MONTOS</label>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {[
              {k:"auto",   l:"🤖 Auto-detectar"},
              {k:"BBVA",   l:"BBVA (cargos sin signo)"},
              {k:"BCP",    l:"BCP (débito/haber)"},
              {k:"iO Card",l:"iO / Tarjeta (positivo=cargo)"},
            ].map(({k,l})=>(
              <button key={k} onClick={()=>setBankHint(k)}
                style={{...s.btn,padding:"4px 11px",fontSize:11,
                  background:bankHint===k?"rgba(56,189,248,0.1)":"#0a0a0c",
                  color:bankHint===k?"#38bdf8":"#555",
                  border:`1px solid ${bankHint===k?"rgba(56,189,248,0.3)":"#2a2a30"}`}}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {mode==="text"?(
          <>
            <label style={s.label}>PEGA EL TEXTO DE TU EXTRACTO</label>
            <textarea value={rawText} onChange={e=>{setRawText(e.target.value);setParsed(false);}}
              placeholder={"BBVA:\n06/03/2026  SUELDO MINEDU  7,163.00\n28/02/2026  NETFLIX  -35.00\n\nBCP:\n2026-03-12  WONG SUPERMERCADO  245.50"}
              style={{...s.input,minHeight:160,resize:"vertical",fontFamily:"monospace",fontSize:12,lineHeight:1.6}}/>
            <div style={{display:"flex",justifyContent:"flex-end",marginTop:10}}>
              <button onClick={handleParse} style={{...s.btn,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff",display:"flex",alignItems:"center",gap:6}}>
                <Zap size={14}/> Analizar
              </button>
            </div>
          </>
        ):(
          <div>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCSV} style={{display:"none"}}/>
            <div style={{border:"2px dashed #2a2a30",borderRadius:10,padding:28,cursor:"pointer",textAlign:"center"}} onClick={()=>fileRef.current?.click()}>
              <Upload size={26} color="#444" style={{margin:"0 auto 10px",display:"block"}}/>
              <p style={{color:"#888",fontSize:13,margin:0}}>Clic para seleccionar CSV (BBVA, BCP, genérico)</p>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {parsed&&preview.length===0&&(
        <div style={{...s.card,textAlign:"center",color:"#ef4444",padding:24}}>⚠️ No se detectaron transacciones. Verifica el formato o selecciona el banco.</div>
      )}

      {/* Preview */}
      {preview.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {/* Stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
            {[{l:"Detectadas",v:preview.length,c:"#f0f0f2",e:"📊"},{l:"Nuevas",v:preview.filter(t=>!t.isDup).length,c:"#22c55e",e:"✅"},
              {l:"Duplicadas",v:dups.length,c:"#f59e0b",e:"⚠️"},{l:"A importar",v:toImport.length,c:"#38bdf8",e:"⬆️"}
            ].map(({l,v,c,e})=>(
              <div key={l} style={{...s.card,padding:"12px 14px",textAlign:"center"}}>
                <div style={{fontSize:18,marginBottom:4}}>{e}</div>
                <div style={{color:c,fontSize:20,fontWeight:700}}>{v}</div>
                <div style={{color:"#444",fontSize:11}}>{l}</div>
              </div>
            ))}
          </div>
          {/* Distribución por período */}
          {Object.keys(periodDist).length>0&&(
            <div style={{...s.card,background:"rgba(34,197,94,0.05)",border:"1px solid rgba(34,197,94,0.15)"}}>
              <p style={{color:"#22c55e",fontSize:12,fontWeight:700,margin:"0 0 10px"}}>📅 DISTRIBUCIÓN POR MES CALENDARIO</p>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {Object.entries(periodDist).sort().map(([p,cnt])=>{
                  const hasData=existingTransactions.some(t=>t.period===p);
                  return (
                    <div key={p} style={{background:hasData?"rgba(245,158,11,0.1)":"rgba(34,197,94,0.1)",border:`1px solid ${hasData?"rgba(245,158,11,0.3)":"rgba(34,197,94,0.3)"}`,borderRadius:8,padding:"8px 14px",textAlign:"center"}}>
                      <div style={{color:hasData?"#f59e0b":"#22c55e",fontWeight:700,fontSize:16}}>{cnt}</div>
                      <div style={{color:"#888",fontSize:11}}>{lbl(p)}</div>
                      <div style={{color:hasData?"#f59e0b":"#22c55e",fontSize:9,marginTop:1}}>{hasData?"● con datos":"● nuevo"}</div>
                    </div>
                  );
                })}
              </div>
              {Object.keys(periodDist).length>1&&<p style={{color:"#555",fontSize:11,margin:"8px 0 0"}}>✦ Este extracto abarca {Object.keys(periodDist).length} meses — típico de ciclos de tarjeta no-calendario.</p>}
            </div>
          )}
          {/* Lista */}
          <div style={s.card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <span style={{color:"#888",fontSize:13}}>{toImport.length} de {preview.length} se importarán</span>
              <button onClick={confirmImport} disabled={toImport.length===0||importing}
                style={{...s.btn,background:toImport.length>0?"linear-gradient(135deg,#22c55e,#16a34a)":"#1a1a20",
                  color:toImport.length>0?"#fff":"#444",display:"flex",alignItems:"center",gap:6}}>
                {importing?"Importando...": <><CheckCircle2 size={14}/> Importar {toImport.length}</>}
              </button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:380,overflowY:"auto"}}>
              {preview.map((tx,i)=>(
                <div key={i} style={{background:"#0f0f12",border:`1px solid ${tx.isDup?"rgba(245,158,11,0.2)":"#1a1a20"}`,
                  borderLeft:`3px solid ${tx.excluded?"#2a2a30":tx.isDup?"#f59e0b":tx.confidence==="auto"?"#22c55e":"#a855f7"}`,
                  borderRadius:8,padding:"9px 12px",opacity:tx.excluded?0.4:1,transition:"opacity .2s"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <button onClick={()=>toggleExclude(i)} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,padding:0}}>{tx.excluded?"○":"●"}</button>
                    <span style={{color:"#38bdf8",fontSize:10,minWidth:56,textAlign:"center",background:"rgba(56,189,248,0.08)",borderRadius:4,padding:"1px 5px"}}>{lbl(tx.period)}</span>
                    <span style={{color:"#444",fontSize:11,minWidth:78}}>{tx.date}</span>
                    <span style={{color:tx.excluded?"#444":"#d0d0d8",fontSize:12,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.description}</span>
                    <Chip type={tx.type}/>
                    <span style={{color:tx.amount>0?"#22c55e":"#f87171",fontWeight:700,fontSize:13,minWidth:78,textAlign:"right"}}>
                      {tx.amount>0?"+":"-"}{fmt(tx.amount)}
                    </span>
                    {tx.isDup&&<span style={{background:"rgba(245,158,11,0.1)",color:"#f59e0b",fontSize:10,padding:"1px 6px",borderRadius:3,border:"1px solid rgba(245,158,11,0.2)"}}>DUP</span>}
                    <button onClick={()=>setEditIdx(editIdx===i?null:i)} style={{background:"none",border:"none",color:"#333",cursor:"pointer",padding:3}}><Settings size={13}/></button>
                  </div>
                  {editIdx===i&&(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:10}}>
                      <select style={s.select} value={tx.type} onChange={e=>{updatePreview(i,"type",e.target.value);updatePreview(i,"category",(categories[e.target.value]||[])[0]||"");}}>
                        {Object.entries(TYPE_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                      </select>
                      <select style={s.select} value={tx.category} onChange={e=>updatePreview(i,"category",e.target.value)}>
                        {(categories[tx.type]||[]).map(c=><option key={c}>{c}</option>)}
                      </select>
                      <select style={s.select} value={tx.account} onChange={e=>updatePreview(i,"account",e.target.value)}>
                        {activeAccounts.map(a=><option key={a}>{a}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP PRINCIPAL
// ═══════════════════════════════════════════════════════════════
const TABS=[
  {id:"dashboard",    icon:<LayoutDashboard size={15}/>, label:"Dashboard"},
  {id:"movimientos",  icon:<List size={15}/>,            label:"Movimientos"},
  {id:"importar",     icon:<Upload size={15}/>,          label:"Importar / IA", badge:"v3.1"},
  {id:"presupuesto",  icon:<Target size={15}/>,          label:"Presupuesto"},
  {id:"calendario",   icon:<Calendar size={15}/>,        label:"Calendario"},
  {id:"inversiones",  icon:<TrendingUp size={15}/>,      label:"Inversiones"},
  {id:"patrimonio",   icon:<DollarSign size={15}/>,      label:"Patrimonio",  badge:"v3"},
];

export default function App({ onLogout }) {
  const [tab,setTab]           = useState("dashboard");
  const [transactions,setTransactions] = useState([]);
  const [budgets,setBudgets]   = useState({});
  const [profile,setProfile]   = useState(null);
  const [settings,setSettings] = useState(null);   // ← configuración personalizable
  const [periods,setPeriods]   = useState([]);
  const [period,setPeriod]     = useState("");
  const [loading,setLoading]   = useState(true);
  const [error,setError]       = useState(null);
  const [toast,setToast]       = useState("");
  const [filterType,setFilterType] = useState("all");
  const [searchQ,setSearchQ]   = useState("");
  const [movTab,setMovTab]     = useState("lista");   // 'lista' | 'transferencias'
  const [showForm,setShowForm] = useState(false);
  const [showSettingsPanel,setShowSettingsPanel] = useState(false);
  const [trendData,setTrendData]       = useState([]);
  const [investments,setInvestments]   = useState([]);
  const [snapshots,setSnapshots]       = useState([]);
  const [newTx,setNewTx]       = useState({
    date: new Date().toISOString().split("T")[0],
    description:"", amount:"", type:"gasto_variable", category:"Alimentación", account:"BCP"
  });

  const showToast=(msg)=>{setToast(msg); setTimeout(()=>setToast(""),2800);};

  // Derivados de settings (con fallback a defaults)
  const activeAccounts  = settings ? settings.accounts.filter(a=>a.active).map(a=>a.name) : DEFAULT_ACCOUNTS.filter(a=>a.active).map(a=>a.name);
  const customRules     = settings?.custom_rules   || [];
  const billingCycles   = settings?.billing_cycles || [];
  const categories      = settings?.categories     || DEFAULT_CATEGORIES;

  // autoClassify con reglas custom del usuario
  const classify = (desc, amt) => autoClassify(desc, amt, customRules);

  // ── Carga inicial ──────────────────────────────────────────
  useEffect(()=>{
    const init=async()=>{
      try {
        const [prof, perList, cfg] = await Promise.all([
          api.getProfile(),
          api.getPeriods(),
          api.getSettings(),
        ]);
        setProfile(prof);
        setSettings(cfg);
        const now=new Date();
        const cur=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
        const availPeriods=perList.map(p=>p.period);
        if (!availPeriods.includes(cur)) availPeriods.unshift(cur);
        availPeriods.sort().reverse();
        setPeriods(availPeriods);
        const sel=availPeriods[0]||cur;
        setPeriod(sel);
        const [txs,bud]=await Promise.all([api.getTransactions(sel), api.getBudgets(sel)]);
        setTransactions(txs);
        setBudgets(bud);

        // Cargar inversiones y snapshots
        try {
          const [invs, snaps] = await Promise.all([api.getInvestments(), api.getSnapshots()]);
          setInvestments(invs);
          setSnapshots(snaps);
        } catch(_) { /* opcional */ }

        // Cargar resumen histórico para gráfico de tendencia (últimos 6 períodos)
        const trendPeriods = availPeriods.slice(0,6).reverse();
        try {
          const trendResults = await Promise.all(
            trendPeriods.map(p => api.getTransactions(p).then(txList => {
              const m = calcMetrics(txList, prof?.income||0);
              const label = `${["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][parseInt(p.split("-")[1])]} ${p.split("-")[0].slice(-2)}`;
              return { period:p, label, ingresos:m.ingresos, gastosFijos:m.gastosFijos, gastosVariables:m.gastosVariables, deudas:m.deudas, ahorros:m.ahorros, saldoNeto:m.saldoNeto };
            }))
          );
          setTrendData(trendResults.filter(d=>d.ingresos>0||d.gastosFijos>0||d.gastosVariables>0));
        } catch(_) { /* trend opcional */ }

      } catch(e){
        setError("No se puede conectar con el backend. ¿Está corriendo Docker? "+e.message);
      } finally { setLoading(false); }
    };
    init();
  },[]);

  // ── Cambio de período ──────────────────────────────────────
  const changePeriod=useCallback(async(p)=>{
    setPeriod(p);
    try {
      const [txs,bud]=await Promise.all([api.getTransactions(p),api.getBudgets(p)]);
      setTransactions(txs); setBudgets(bud);
    } catch(e){showToast("Error cargando período: "+e.message);}
  },[]);

  // ── CRUD transacciones ─────────────────────────────────────
  const addTx=async()=>{
    if (!newTx.description||!newTx.amount) return;
    const amount=newTx.type==="ingreso"?Math.abs(parseFloat(newTx.amount)):-Math.abs(parseFloat(newTx.amount));
    const txPeriod=newTx.date.substring(0,7);
    try {
      const created=await api.createTransaction({...newTx,amount,period:txPeriod});
      if (txPeriod===period) setTransactions(p=>[created,...p]);
      if (!periods.includes(txPeriod)) setPeriods(p=>[txPeriod,...p].sort().reverse());
      setNewTx({date:new Date().toISOString().split("T")[0],description:"",amount:"",type:"gasto_variable",category:"Alimentación",account:"BCP"});
      setShowForm(false);
      showToast("✓ Movimiento guardado");
    } catch(e){showToast("Error: "+e.message);}
  };

  const deleteTx=async(id)=>{
    // FIX: proteger transacciones espejo de transferencias internas
    const tx=transactions.find(t=>t.id===id);
    if (tx?.source==="internal_transfer") {
      showToast("⚠️ Este movimiento pertenece a una transferencia interna. Elimínala desde 'Transferencias internas'.");
      return;
    }
    try {
      await api.deleteTransaction(id);
      setTransactions(p=>p.filter(t=>t.id!==id));
      showToast("Movimiento eliminado");
    } catch(e){showToast("Error: "+e.message);}
  };

  const handleImport=async(txs)=>{
    try {
      const result=await api.importTransactions(txs);
      // Recargar todas las transacciones del período actual
      const fresh=await api.getTransactions(period);
      setTransactions(fresh);
      // Actualizar lista de períodos
      const perList=await api.getPeriods();
      const ps=perList.map(p=>p.period);
      setPeriods(prev=>[...new Set([...prev,...ps])].sort().reverse());
      showToast(result.message);
      return result;
    } catch(e){showToast("Error importando: "+e.message);throw e;}
  };

  const saveBudget=async(cat,val)=>{
    const updated={...budgets,[cat]:parseFloat(val)||0};
    setBudgets(updated);
    try { await api.saveBudgets(period,updated); } catch(e){showToast("Error guardando presupuesto");}
  };

  const saveProfile=async(p)=>{
    try {
      const saved=await api.saveProfile(p);
      setProfile(saved); showToast("✓ Perfil guardado");
    } catch(e){showToast("Error: "+e.message);}
  };

  // ── CRUD Inversiones ───────────────────────────────────────
  const addInvestment=async(inv)=>{
    try {
      const created=await api.createInvestment(inv);
      setInvestments(p=>[created,...p]);
      showToast("✓ Activo agregado");
      return created;
    } catch(e){showToast("Error: "+e.message); throw e;}
  };

  const editInvestment=async(id,inv)=>{
    try {
      const updated=await api.updateInvestment(id,inv);
      setInvestments(p=>p.map(x=>x.id===id?updated:x));
      showToast("✓ Activo actualizado");
    } catch(e){showToast("Error: "+e.message);}
  };

  const removeInvestment=async(id)=>{
    try {
      await api.deleteInvestment(id);
      setInvestments(p=>p.filter(x=>x.id!==id));
      showToast("Activo eliminado");
    } catch(e){showToast("Error: "+e.message);}
  };

  const addSnapshot=async(snap)=>{
    try {
      await api.saveSnapshot(snap);
      const fresh=await api.getSnapshots();
      setSnapshots(fresh);
      showToast("✓ Snapshot guardado");
    } catch(e){showToast("Error guardando snapshot: "+e.message);}
  };

  const removeSnapshot=async(id)=>{
    try {
      await api.deleteSnapshot(id);
      setSnapshots(p=>p.filter(x=>x.id!==id));
      showToast("Snapshot eliminado");
    } catch(e){showToast("Error: "+e.message);}
  };

  const saveSettings=async(cfg)=>{
    try {
      await api.saveSettings(cfg);
      setSettings(cfg);
      showToast("✓ Configuración guardada");
    } catch(e){throw e;}
  };

  const exportBackup=async()=>{
    try {
      const data=await api.exportAll();
      const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a"); a.href=url; a.download=`finanzas-vh-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click(); URL.revokeObjectURL(url);
      showToast("✓ Backup exportado");
    } catch(e){showToast("Error exportando: "+e.message);}
  };

  // ── Métricas ───────────────────────────────────────────────
  const metrics=calcMetrics(transactions, profile?.income||0);
  const health=getHealth(metrics);
  const hc=HEALTH[health];

  // BUGFIX v3.1: excluir movimientos internos del mapa de categorías
  // (gráfico torta, Top Categorías y alertas de presupuesto)
  const catMap={};
  transactions.filter(t=>t.type!=="ingreso"&&!t.excluir_del_analisis).forEach(t=>{
    if (!catMap[t.category]) catMap[t.category]={amount:0,type:t.type};
    catMap[t.category].amount+=Math.abs(t.amount);
  });
  const catData=Object.entries(catMap).map(([cat,v])=>({cat,amount:v.amount,type:v.type,color:getCatColor(cat,v.type)})).sort((a,b)=>b.amount-a.amount);
  const pieData=[
    {name:"Gastos Fijos",value:metrics.gastosFijos,color:TYPE_CONFIG.gasto_fijo.color},
    {name:"Gastos Variables",value:metrics.gastosVariables,color:TYPE_CONFIG.gasto_variable.color},
    {name:"Deudas",value:metrics.deudas,color:TYPE_CONFIG.deuda.color},
    {name:"Ahorros",value:metrics.ahorros,color:TYPE_CONFIG.ahorro.color},
  ].filter(d=>d.value>0);

  const alerts=Object.entries(budgets).filter(([cat,bud])=>{
    const actual=catMap[cat]?.amount||0; return bud>0&&actual/bud>=0.85;
  }).map(([cat,bud])=>({cat,pct:Math.round((catMap[cat]?.amount||0)/bud*100)}));

  const filteredTxs=transactions
    .filter(t=>filterType==="all"||t.type===filterType)
    .filter(t=>!searchQ||t.description.toLowerCase().includes(searchQ.toLowerCase()))
    .sort((a,b)=>b.date.localeCompare(a.date));

  const PERIOD_LABEL=(p)=>p?`${["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][parseInt(p.split("-")[1])]} ${p.split("-")[0].slice(-2)}`:"";

  // ── Loading / Error states ─────────────────────────────────
  if (loading) return (
    <div style={{background:"#080809",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:12}}>💼</div>
        <p style={{color:"#888",fontSize:14}}>Conectando con el backend...</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{background:"#080809",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{...s.card,maxWidth:520,textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
        <h2 style={{color:"#ef4444",marginBottom:10}}>Error de conexión</h2>
        <p style={{color:"#888",fontSize:13,marginBottom:16,lineHeight:1.7}}>{error}</p>
        <div style={{background:"#0a0a0c",borderRadius:8,padding:14,textAlign:"left",marginBottom:16}}>
          <p style={{color:"#38bdf8",fontSize:12,fontWeight:700,margin:"0 0 8px"}}>Para iniciar el sistema:</p>
          <code style={{color:"#22c55e",fontSize:12,lineHeight:2,display:"block"}}>
            cd finanzas-vh<br/>
            docker-compose up -d<br/>
            # Luego abre: http://localhost:3000
          </code>
        </div>
        <button onClick={()=>window.location.reload()}
          style={{...s.btn,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff"}}>
          Reintentar
        </button>
      </div>
    </div>
  );

  return (
    <div style={{background:"#080809",minHeight:"100vh",fontFamily:"'DM Mono','Courier New',monospace",color:"#f0f0f2"}}>
      {/* Toast */}
      {toast&&<div style={{position:"fixed",bottom:20,right:20,background:"#111113",border:"1px solid #22c55e",color:"#22c55e",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:600,zIndex:999,boxShadow:"0 4px 20px rgba(0,0,0,0.5)"}}>{toast}</div>}

      {/* Header */}
      <div style={{background:"#0c0c0f",borderBottom:"1px solid #1a1a20",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:40}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{background:"linear-gradient(135deg,#22c55e,#16a34a)",borderRadius:9,padding:"7px 9px",fontSize:18}}>💼</div>
          <div>
            <div style={{fontSize:15,fontWeight:700,letterSpacing:"-0.3px"}}>FinanzasVH <span style={{color:"#22c55e",fontSize:10}}>v3.0</span></div>
            <div style={{color:"#444",fontSize:10}}>{profile?.name||"Mi sistema financiero"} · {PERIOD_LABEL(period)}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {alerts.length>0&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:6,padding:"4px 10px",display:"flex",alignItems:"center",gap:5}}>
            <Bell size={12} color="#ef4444"/><span style={{color:"#ef4444",fontSize:12,fontWeight:600}}>{alerts.length}</span>
          </div>}
          <select value={period} onChange={e=>changePeriod(e.target.value)}
            style={{...s.select,width:"auto",padding:"5px 10px",fontSize:12}}>
            {periods.map(p=><option key={p} value={p}>{PERIOD_LABEL(p)}</option>)}
          </select>
          <button onClick={exportBackup} title="Exportar backup JSON"
            style={{...s.btn,background:"#1a1a20",color:"#888",border:"1px solid #2a2a30",padding:"6px 10px",display:"flex",alignItems:"center",gap:4}}>
            <Download size={13}/>
          </button>
          {onLogout && (
            <button onClick={()=>{ if(window.confirm('¿Cerrar sesión?')) onLogout(); }}
              title="Cerrar sesión"
              style={{...s.btn,background:"#1a1a20",color:"#555",border:"1px solid #2a2a30",
                padding:"6px 10px",display:"flex",alignItems:"center",gap:4,fontSize:12}}>
              🔒
            </button>
          )}
          <button onClick={()=>setShowSettingsPanel(true)} title="Configuración"
            style={{...s.btn,background:customRules.length>0?"rgba(34,197,94,0.12)":"#1a1a20",
              color:customRules.length>0?"#22c55e":"#888",
              border:`1px solid ${customRules.length>0?"rgba(34,197,94,0.3)":"#2a2a30"}`,
              padding:"6px 10px",display:"flex",alignItems:"center",gap:4}}>
            <Settings size={13}/>
            {customRules.length>0&&<span style={{fontSize:10,fontWeight:700}}>{customRules.length}</span>}
          </button>
        </div>
      </div>

      {/* SettingsPanel — drawer lateral */}
      {showSettingsPanel&&settings&&(
        <SettingsPanel
          settings={settings}
          profile={profile}
          onSave={saveSettings}
          onSaveProfile={saveProfile}
          onClose={()=>setShowSettingsPanel(false)}
        />
      )}

      {/* Tabs */}
      <div style={{background:"#0c0c0f",borderBottom:"1px solid #161618",padding:"0 20px",display:"flex",gap:2,overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{display:"flex",alignItems:"center",gap:5,padding:"11px 14px",fontSize:12,fontWeight:tab===t.id?600:400,
              color:tab===t.id?"#22c55e":"#555",background:"transparent",border:"none",
              borderBottom:tab===t.id?"2px solid #22c55e":"2px solid transparent",cursor:"pointer",whiteSpace:"nowrap"}}>
            {t.icon}{t.label}
            {t.badge&&<span style={{background:"rgba(34,197,94,0.2)",color:"#22c55e",fontSize:9,padding:"1px 5px",borderRadius:3,fontWeight:700}}>{t.badge}</span>}
          </button>
        ))}
      </div>

      <div style={{padding:"20px",maxWidth:1100,margin:"0 auto"}}>

        {/* ── BANNER PRIMERA CONFIGURACIÓN ──────────────────── */}
        {activeAccounts.length===0&&(
          <div style={{background:"linear-gradient(135deg,rgba(34,197,94,0.08),rgba(56,189,248,0.06))",
            border:"1px solid rgba(34,197,94,0.3)",borderRadius:12,padding:"20px 24px",
            marginBottom:20,display:"flex",alignItems:"flex-start",gap:16}}>
            <span style={{fontSize:32,flexShrink:0}}>👋</span>
            <div style={{flex:1}}>
              <p style={{color:"#22c55e",fontWeight:700,fontSize:15,margin:"0 0 6px"}}>Bienvenido — sistema vacío y listo</p>
              <p style={{color:"#888",fontSize:12,margin:"0 0 14px",lineHeight:1.7}}>
                Antes de registrar movimientos, configura tus cuentas y datos básicos.
                Solo toma 2 minutos.
              </p>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {[
                  {n:"1",t:"Abre ⚙️ Configuración",d:"Botón arriba a la derecha"},
                  {n:"2",t:"Agrega tus cuentas",d:"Bancos, tarjetas, billeteras"},
                  {n:"3",t:"Configura tus ciclos",d:"Fechas de corte de tarjetas"},
                  {n:"4",t:"Ingresa tu perfil",d:"Nombre, sueldo, día de cobro"},
                ].map(step=>(
                  <div key={step.n} style={{background:"#0a0a0c",border:"1px solid #1e1e26",borderRadius:8,
                    padding:"10px 14px",display:"flex",gap:10,alignItems:"center",minWidth:180}}>
                    <span style={{background:"rgba(34,197,94,0.15)",color:"#22c55e",fontWeight:700,
                      fontSize:12,width:22,height:22,borderRadius:"50%",display:"flex",
                      alignItems:"center",justifyContent:"center",flexShrink:0}}>{step.n}</span>
                    <div>
                      <p style={{color:"#d0d0d8",fontSize:12,fontWeight:600,margin:0}}>{step.t}</p>
                      <p style={{color:"#555",fontSize:11,margin:0}}>{step.d}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={()=>setShowSettingsPanel(true)}
                style={{...s.btn,marginTop:14,background:"linear-gradient(135deg,#22c55e,#16a34a)",
                  color:"#fff",display:"flex",alignItems:"center",gap:6,fontSize:13}}>
                <Settings size={14}/> Abrir Configuración ahora
              </button>
            </div>
          </div>
        )}

        {/* ── DASHBOARD ─────────────────────────────────────── */}
        {tab==="dashboard"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{background:`linear-gradient(135deg,${hc.color}10,#111113)`,border:`1px solid ${hc.color}30`,borderRadius:12,padding:"14px 20px",display:"flex",alignItems:"center",gap:14}}>
              <span style={{fontSize:28}}>{hc.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:15,color:hc.color}}>{hc.label} · {PERIOD_LABEL(period)}</div>
                <div style={{color:"#555",fontSize:12,marginTop:2}}>Ahorro: {metrics.tasaAhorro.toFixed(1)}% · Ratio deuda: {metrics.ratioDeuda.toFixed(1)}%</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:"#444",fontSize:10}}>SALDO NETO</div>
                <div style={{color:metrics.saldoNeto>=0?"#22c55e":"#ef4444",fontSize:22,fontWeight:700}}>{fmtN(metrics.saldoNeto)}</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:10}}>
              <Metric label="Ingresos" value={fmtN(metrics.ingresos)} color="#22c55e" icon="💰" sub={profile?.name||"—"}/>
              <Metric label="Gastos Fijos" value={fmtN(metrics.gastosFijos)} color="#f59e0b" icon="🏠" sub={`${((metrics.gastosFijos/metrics.ingresos)*100).toFixed(0)}%`}/>
              <Metric label="Gastos Variables" value={fmtN(metrics.gastosVariables)} color="#f87171" icon="🛒" sub={`${((metrics.gastosVariables/metrics.ingresos)*100).toFixed(0)}%`}/>
              <Metric label="Deudas" value={fmtN(metrics.deudas)} color="#a78bfa" icon="💳" sub={`${metrics.ratioDeuda.toFixed(1)}%`}/>
              <Metric label="Ahorros" value={fmtN(metrics.ahorros)} color="#38bdf8" icon="🏦" sub={`Tasa ${metrics.tasaAhorro.toFixed(1)}%`}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div style={s.card}>
                <p style={{color:"#555",fontSize:11,fontWeight:600,margin:"0 0 14px",letterSpacing:"0.5px"}}>DISTRIBUCIÓN GASTOS</p>
                <ResponsiveContainer width="100%" height={185}>
                  <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} dataKey="value" paddingAngle={3}>
                    {pieData.map((e,i)=><Cell key={i} fill={e.color}/>)}</Pie>
                    <Tooltip content={<TTip/>}/>
                    <Legend formatter={v=><span style={{color:"#888",fontSize:10}}>{v}</span>}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={s.card}>
                <p style={{color:"#555",fontSize:11,fontWeight:600,margin:"0 0 14px",letterSpacing:"0.5px"}}>TOP CATEGORÍAS</p>
                <ResponsiveContainer width="100%" height={185}>
                  <BarChart data={catData.slice(0,6)} layout="vertical">
                    <XAxis type="number" tick={{fill:"#444",fontSize:10}} tickFormatter={v=>`S/${v}`}/>
                    <YAxis type="category" dataKey="cat" tick={{fill:"#888",fontSize:10}} width={95}/>
                    <Tooltip content={<TTip/>} cursor={{fill:"rgba(255,255,255,0.02)"}}/>
                    <Bar dataKey="amount" name="Monto" radius={[0,4,4,0]}>{catData.slice(0,6).map((e,i)=><Cell key={i} fill={e.color}/>)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Evolución mensual ─────────────────────────── */}
            {trendData.length>=2&&(
              <div style={s.card}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <p style={{color:"#555",fontSize:11,fontWeight:600,margin:0,letterSpacing:"0.5px"}}>EVOLUCIÓN MENSUAL</p>
                  <span style={{color:"#333",fontSize:10}}>últimos {trendData.length} meses</span>
                </div>
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={trendData} margin={{top:4,right:8,left:0,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1a20"/>
                    <XAxis dataKey="label" tick={{fill:"#555",fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:"#444",fontSize:10}} tickFormatter={v=>`S/${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={48}/>
                    <Tooltip content={<TTip/>}/>
                    <Legend formatter={v=><span style={{color:"#888",fontSize:10}}>{v}</span>}/>
                    <Line type="monotone" dataKey="ingresos"        name="💰 Ingresos"     stroke="#22c55e" strokeWidth={2} dot={{fill:"#22c55e",r:3}} activeDot={{r:5}}/>
                    <Line type="monotone" dataKey="gastosFijos"     name="🏠 Gastos Fijos" stroke="#f59e0b" strokeWidth={2} dot={{fill:"#f59e0b",r:3}} activeDot={{r:5}}/>
                    <Line type="monotone" dataKey="gastosVariables" name="🛒 Gastos Var."  stroke="#f87171" strokeWidth={2} dot={{fill:"#f87171",r:3}} activeDot={{r:5}}/>
                    <Line type="monotone" dataKey="saldoNeto"       name="📊 Saldo Neto"   stroke="#38bdf8" strokeWidth={2} strokeDasharray="5 3" dot={{fill:"#38bdf8",r:3}} activeDot={{r:5}}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Comparativo mes actual vs anterior ────────── */}
            {(()=>{
              const curIdx=trendData.findIndex(d=>d.period===period);
              const prevData=curIdx>0?trendData[curIdx-1]:null;
              const curData=trendData[curIdx];
              if (!prevData||!curData) return null;
              const compData=[
                {cat:"Gastos Fijos",     actual:curData.gastosFijos,    anterior:prevData.gastosFijos,    color:"#f59e0b"},
                {cat:"Gastos Var.",      actual:curData.gastosVariables, anterior:prevData.gastosVariables,color:"#f87171"},
                {cat:"Deudas",           actual:curData.deudas,          anterior:prevData.deudas,          color:"#a78bfa"},
                {cat:"Ahorros",          actual:curData.ahorros,         anterior:prevData.ahorros,         color:"#38bdf8"},
              ].filter(d=>d.actual>0||d.anterior>0);
              const varPct=(a,b)=>b>0?((a-b)/b*100).toFixed(0):null;
              return (
                <div style={s.card}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <p style={{color:"#555",fontSize:11,fontWeight:600,margin:0,letterSpacing:"0.5px"}}>COMPARATIVO</p>
                    <div style={{display:"flex",gap:14}}>
                      <span style={{display:"flex",alignItems:"center",gap:4,color:"#888",fontSize:10}}>
                        <span style={{width:10,height:10,borderRadius:2,background:"#22c55e",display:"inline-block"}}/>{curData.label}
                      </span>
                      <span style={{display:"flex",alignItems:"center",gap:4,color:"#888",fontSize:10}}>
                        <span style={{width:10,height:10,borderRadius:2,background:"#333",display:"inline-block"}}/>{prevData.label}
                      </span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={compData} margin={{top:4,right:8,left:0,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a20" vertical={false}/>
                      <XAxis dataKey="cat" tick={{fill:"#666",fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:"#444",fontSize:10}} tickFormatter={v=>`S/${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={44}/>
                      <Tooltip content={<TTip/>}/>
                      <Bar dataKey="actual"   name={curData.label}  radius={[4,4,0,0]}>{compData.map((e,i)=><Cell key={i} fill={e.color}/>)}</Bar>
                      <Bar dataKey="anterior" name={prevData.label} radius={[4,4,0,0]}>{compData.map((e,i)=><Cell key={i} fill={`${e.color}44`}/>)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
                    {compData.map(d=>{
                      const pct=varPct(d.actual,d.anterior); if(pct===null) return null;
                      const up=parseFloat(pct)>0;
                      const isGood=d.cat==="Ahorros"?up:!up;
                      return (
                        <div key={d.cat} style={{background:"#0a0a0c",border:"1px solid #1a1a20",borderRadius:6,padding:"5px 10px",display:"flex",gap:5,alignItems:"center"}}>
                          <span style={{color:"#555",fontSize:11}}>{d.cat}</span>
                          <span style={{color:parseFloat(pct)===0?"#444":isGood?"#22c55e":"#f87171",fontWeight:700,fontSize:12}}>{up?"+":""}{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            <div style={s.card}>
              <p style={{color:"#555",fontSize:11,fontWeight:600,margin:"0 0 4px",letterSpacing:"0.5px"}}>RECOMENDACIONES</p>
              <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:12}}>
                {metrics.tasaAhorro<10&&<div style={{background:"rgba(56,189,248,0.07)",border:"1px solid rgba(56,189,248,0.18)",borderRadius:8,padding:"12px 14px"}}><p style={{color:"#38bdf8",fontWeight:700,fontSize:13,margin:"0 0 4px"}}>Incrementa tu ahorro</p><p style={{color:"#666",fontSize:12,margin:0}}>Meta 10% = {fmtN(metrics.ingresos*0.10)}/mes. Transfiere a Agora el día {(profile?.pay_day||6)+1}.</p></div>}
                {metrics.ratioDeuda>25&&<div style={{background:"rgba(167,139,250,0.07)",border:"1px solid rgba(167,139,250,0.18)",borderRadius:8,padding:"12px 14px"}}><p style={{color:"#a78bfa",fontWeight:700,fontSize:13,margin:"0 0 4px"}}>Controla el ratio de deuda</p><p style={{color:"#666",fontSize:12,margin:0}}>Deudas = {metrics.ratioDeuda.toFixed(1)}% (límite: 25%). Paga tarjetas en total para evitar 74.99% TEA.</p></div>}
                {metrics.saldoNeto>500&&<div style={{background:"rgba(34,197,94,0.07)",border:"1px solid rgba(34,197,94,0.18)",borderRadius:8,padding:"12px 14px"}}><p style={{color:"#22c55e",fontWeight:700,fontSize:13,margin:"0 0 4px"}}>Aprovecha el excedente</p><p style={{color:"#666",fontSize:12,margin:0}}>Tienes {fmtN(metrics.saldoNeto)} disponible. Considera transferir a Agora o al portafolio crypto.</p></div>}
              </div>
            </div>
          </div>
        )}

        {/* ── MOVIMIENTOS ───────────────────────────────────── */}
        {tab==="movimientos"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* ── Sub-tabs: Lista / Transferencias ── */}
            <div style={{display:"flex",gap:4,borderBottom:"1px solid #1a1a20",paddingBottom:0,marginBottom:2}}>
              {[
                {id:"lista",        label:"📋 Lista de movimientos"},
                {id:"transferencias",label:"🔁 Transferencias internas"},
              ].map(st=>(
                <button key={st.id} onClick={()=>setMovTab(st.id)}
                  style={{background:"transparent",border:"none",cursor:"pointer",padding:"8px 14px",
                    fontSize:12,fontWeight:movTab===st.id?700:400,
                    color:movTab===st.id?"#22c55e":"#555",
                    borderBottom:movTab===st.id?"2px solid #22c55e":"2px solid transparent"}}>
                  {st.label}
                </button>
              ))}
            </div>

            {/* ── Sub-tab: Transferencias internas ── */}
            {movTab==="transferencias"&&<TransferenciasPanel
              currentPeriod={period}
              onTransferCreated={async()=>{
                const fresh=await api.getTransactions(period);
                setTransactions(fresh);
              }}
            />}

            {/* ── Sub-tab: Lista de movimientos ── */}
            {movTab==="lista"&&<>
            {showForm&&(
              <div style={{...s.card,border:"1px solid rgba(34,197,94,0.3)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <span style={{color:"#22c55e",fontWeight:700,fontSize:13}}>+ Nuevo Movimiento</span>
                  <button onClick={()=>setShowForm(false)} style={{background:"none",border:"none",color:"#444",cursor:"pointer"}}><X size={15}/></button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
                  <div><label style={s.label}>FECHA</label><input type="date" style={s.input} value={newTx.date} onChange={e=>setNewTx(x=>({...x,date:e.target.value}))}/></div>
                  <div style={{gridColumn:"span 2"}}><label style={s.label}>DESCRIPCIÓN</label><input style={s.input} placeholder="Ej. Supermercado Wong" value={newTx.description} onChange={e=>setNewTx(x=>({...x,description:e.target.value}))}/></div>
                  <div><label style={s.label}>MONTO (S/)</label><input type="number" style={s.input} value={newTx.amount} onChange={e=>setNewTx(x=>({...x,amount:e.target.value}))}/></div>
                  <div><label style={s.label}>TIPO</label>
                    <select style={s.select} value={newTx.type} onChange={e=>setNewTx(x=>({...x,type:e.target.value,category:(categories[e.target.value]||[])[0]||""}))}>
                      {Object.entries(TYPE_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div><label style={s.label}>CATEGORÍA</label>
                    <select style={s.select} value={newTx.category} onChange={e=>setNewTx(x=>({...x,category:e.target.value}))}>
                      {(categories[newTx.type]||[]).map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label style={s.label}>CUENTA</label>
                    <select style={s.select} value={newTx.account} onChange={e=>setNewTx(x=>({...x,account:e.target.value}))}>
                      {activeAccounts.map(a=><option key={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={addTx} style={{...s.btn,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff",marginTop:12}}>Guardar movimiento</button>
              </div>
            )}
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{position:"relative",flex:1,minWidth:200}}>
                <Search size={13} color="#444" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}/>
                <input placeholder="Buscar..." value={searchQ} onChange={e=>setSearchQ(e.target.value)} style={{...s.input,paddingLeft:30}}/>
              </div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {["all",...Object.keys(TYPE_CONFIG)].map(f=>(
                  <button key={f} onClick={()=>setFilterType(f)}
                    style={{...s.btn,padding:"5px 10px",fontSize:11,
                      background:filterType===f?(f==="all"?"#1e1e26":TYPE_CONFIG[f]?.bg||"#1e1e26"):"#0a0a0c",
                      color:filterType===f?(f==="all"?"#f0f0f2":TYPE_CONFIG[f]?.color||"#f0f0f2"):"#555",
                      border:`1px solid ${filterType===f?(f==="all"?"#444":TYPE_CONFIG[f]?.border||"#444"):"#1a1a20"}`}}>
                    {f==="all"?"Todos":TYPE_CONFIG[f].label}
                  </button>
                ))}
              </div>
              {!showForm&&<button onClick={()=>setShowForm(true)} style={{...s.btn,background:"rgba(34,197,94,0.12)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.3)",display:"flex",alignItems:"center",gap:5}}>
                <Plus size={13}/> Agregar
              </button>}
            </div>
            <div style={{display:"flex",gap:8}}>
              {[{l:"Registros",v:filteredTxs.length,c:"#888"},{l:"Ingresos",v:fmtN(filteredTxs.filter(t=>t.type==="ingreso").reduce((s,t)=>s+t.amount,0)),c:"#22c55e"},
                {l:"Egresos",v:fmtN(filteredTxs.filter(t=>t.type!=="ingreso").reduce((s,t)=>s+Math.abs(t.amount),0)),c:"#f87171"}
              ].map(item=>(
                <div key={item.l} style={{flex:1,...s.card,padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
                  <span style={{color:"#444",fontSize:11}}>{item.l}</span>
                  <span style={{color:item.c,fontWeight:700,fontSize:13}}>{item.v}</span>
                </div>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {/* FIX: cabecera de columnas */}
              {filteredTxs.length>0&&(
                <div style={{display:"grid",gridTemplateColumns:"58px 82px 1fr 110px 80px 85px 50px 36px",gap:6,padding:"4px 14px",alignItems:"center"}}>
                  {["Período","Fecha","Descripción / Comercio","Categoría","Tipo","Monto","",""].map((h,i)=>(
                    <span key={i} style={{color:"#2a2a30",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</span>
                  ))}
                </div>
              )}
              {filteredTxs.length===0&&<div style={{...s.card,textAlign:"center",color:"#444",padding:32}}>No hay movimientos para este período.</div>}
              {filteredTxs.map(tx=>(
                <div key={tx.id} style={{background:"#0f0f12",border:`1px solid ${tx.excluir_del_analisis?"rgba(56,189,248,0.12)":"#1a1a20"}`,borderLeft:`3px solid ${tx.excluir_del_analisis?"#38bdf8":TYPE_CONFIG[tx.type]?.color||"#555"}`,borderRadius:8,padding:"10px 14px",display:"grid",gridTemplateColumns:"58px 82px 1fr 110px 80px 85px 50px 36px",gap:6,alignItems:"center"}}>
                  {/* Período */}
                  <span style={{color:"#333",fontSize:10}}>{tx.period||tx.date?.substring(0,7)||""}</span>
                  {/* Fecha */}
                  <span style={{color:"#444",fontSize:11}}>{tx.date}</span>
                  {/* Descripción */}
                  <span style={{color:tx.excluir_del_analisis?"#555":"#d0d0d8",fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.description}</span>
                  {/* Categoría */}
                  <span style={{color:"#555",fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.category||"—"}</span>
                  {/* Tipo */}
                  <Chip type={tx.type}/>
                  {/* Monto */}
                  <span style={{color:tx.amount>0?"#22c55e":"#f87171",fontWeight:700,fontSize:13,textAlign:"right"}}>
                    {tx.amount>0?"+":"-"}{fmt(tx.amount)}
                  </span>
                  {/* FIX: badge diferenciado por origen */}
                  {tx.excluir_del_analisis
                    ? <span style={{background:"rgba(56,189,248,0.08)",color:"#38bdf8",fontSize:9,padding:"2px 6px",borderRadius:3,textAlign:"center",whiteSpace:"nowrap"}}>INTERNO 🔒</span>
                    : tx.source&&tx.source!=="manual"
                      ? <span style={{background:"rgba(56,189,248,0.06)",color:"#555",fontSize:9,padding:"2px 5px",borderRadius:3}}>{tx.source==="import_csv"?"CSV":"PDF"}</span>
                      : <span/>
                  }
                  {/* Eliminar — bloqueado para internos */}
                  <button
                    onClick={()=>deleteTx(tx.id)}
                    title={tx.excluir_del_analisis?"No se puede eliminar: pertenece a una transferencia interna":"Eliminar movimiento"}
                    style={{background:"none",border:"none",color:tx.excluir_del_analisis?"#1a1a20":"#2a2a30",cursor:tx.excluir_del_analisis?"not-allowed":"pointer",padding:3}}>
                    <Trash2 size={13}/>
                  </button>
                </div>
              ))}
            </div>
            </>}
          </div>
        )}

        {/* ── IMPORTAR / INGESTA IA (v3.1) ─────────────────── */}
        {tab==="importar"&&<IngestaExtracto
          onImport={handleImport}
          classify={classify}
          customRules={customRules}
          activeAccounts={activeAccounts}
          categories={categories}
          existingTransactions={transactions}
          billingCycles={billingCycles}
          onSaveRule={async (rule) => {
            const newCfg = {
              ...settings,
              custom_rules: [...(settings?.custom_rules || []), rule],
            };
            await saveSettings(newCfg);
            showToast(`✓ Regla "${rule.label}" guardada`);
          }}
        />}

        {/* ── PRESUPUESTO ───────────────────────────────────── */}
        {tab==="presupuesto"&&(()=>{
          const budgetTypes = ["gasto_fijo","gasto_variable","deuda","ahorro"];
          const allCats = new Map();
          budgetTypes.forEach(type=>{
            const cats = (categories[type]||DEFAULT_CATEGORIES[type]||[]);
            cats.forEach(cat=>{
              if (!allCats.has(cat)) allCats.set(cat,{cat, amount:0, type, color:getCatColor(cat,type)});
            });
          });
          catData.forEach(({cat,amount,type})=>{ allCats.set(cat,{cat,amount,type,color:getCatColor(cat,type)}); });
          const sorted = [...allCats.values()].sort((a,b)=>{
            const aBud=budgets[a.cat]||0, bBud=budgets[b.cat]||0;
            if (aBud>0&&bBud===0) return -1;
            if (bBud>0&&aBud===0) return 1;
            return b.amount-a.amount;
          });
          return (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <p style={{color:"#555",fontSize:12,margin:0}}>Presupuesto · {PERIOD_LABEL(period)} · Edita los montos directamente</p>
                <span style={{color:"#333",fontSize:11}}>{Object.keys(budgets).filter(k=>budgets[k]>0).length} categorías con meta</span>
              </div>
              {sorted.map(({cat,amount,type,color})=>{
                const bud=budgets[cat]||0;
                const pct2=bud>0?Math.min((amount/bud)*100,120):0;
                const bc=pct2>100?"#ef4444":pct2>85?"#f59e0b":color;
                const sinMov=amount===0;
                return (
                  <div key={cat} style={{...s.card,opacity:sinMov&&bud===0?0.5:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <span style={{fontSize:13,fontWeight:500,color:sinMov?"#555":"#d0d0d8"}}>{cat} <Chip type={type}/></span>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{color:"#888",fontSize:12}}>Real: <b style={{color:sinMov?"#333":color}}>{fmtN(amount)}</b></span>
                        <span style={{color:"#333",fontSize:12}}>/ S/</span>
                        <input type="number" value={bud||""} placeholder="—"
                          onChange={e=>saveBudget(cat,e.target.value)}
                          style={{...s.input,width:80,textAlign:"right",padding:"3px 8px"}}/>
                      </div>
                    </div>
                    <div style={{background:"#0a0a0c",borderRadius:4,height:5,overflow:"hidden"}}>
                      <div style={{background:bud>0?bc:"#1a1a20",width:`${Math.min(pct2,100)}%`,height:"100%",borderRadius:4,transition:"width .3s"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                      <span style={{color:"#2a2a30",fontSize:10}}>{sinMov?"sin movimientos":""}</span>
                      {bud>0&&<span style={{color:pct2>100?"#ef4444":pct2>85?"#f59e0b":"#444",fontSize:11}}>
                        {Math.round(pct2)}%{pct2>100?" ⚠️ EXCEDIDO":""}
                      </span>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── CALENDARIO ────────────────────────────────────── */}
        {tab==="calendario"&&profile&&(
          <CalendarView profile={profile} period={period}/>
        )}

        {/* ── INVERSIONES ───────────────────────────────────── */}
        {tab==="inversiones"&&(
          <InversionesTab
            investments={investments}
            snapshots={snapshots}
            onAdd={addInvestment}
            onEdit={editInvestment}
            onDelete={removeInvestment}
            onSaveSnapshot={addSnapshot}
            onDeleteSnapshot={removeSnapshot}
          />
        )}

        {/* ── PATRIMONIO CONSOLIDADO (v3.0) ─────────────────── */}
        {tab==="patrimonio"&&(
          <PatrimonioConsolidado />
        )}

        {/* OBS-05: ingesta_ia unificado en tab importar — este bloque ya no existe */}
      </div>
    </div>
  );
}

// ─── Inversiones ──────────────────────────────────────────────
const COINGECKO_IDS = {
  BTC:"bitcoin", ETH:"ethereum", BNB:"binancecoin", SOL:"solana",
  ADA:"cardano", XRP:"ripple",   MATIC:"matic-network", DOT:"polkadot",
  AVAX:"avalanche-2", LINK:"chainlink", UNI:"uniswap", DOGE:"dogecoin",
  USDT:"tether", USDC:"usd-coin", LTC:"litecoin", ATOM:"cosmos",
};

function InversionesTab({ investments, snapshots, onAdd, onEdit, onDelete, onSaveSnapshot, onDeleteSnapshot }) {
  const [prices,  setPrices]       = useState({});        // {TICKER: price_usd}
  const [exRate,  setExRate]       = useState(3.72);       // USD → PEN
  const [loading, setLoading]      = useState(false);
  const [showForm,setShowForm]     = useState(false);
  const [editId,  setEditId]       = useState(null);
  const [manualPrices, setManualPrices] = useState({});   // precios confirmados
  const [inputValues,  setInputValues]  = useState({});   // valor mientras el usuario escribe
  const [form, setForm] = useState({
    name:"", ticker:"", type:"crypto", platform:"Binance",
    quantity:"", buy_price:"", buy_date: new Date().toISOString().split("T")[0], notes:""
  });

  // ── Fetch precios ──────────────────────────────────────────
  const fetchPrices = async () => {
    setLoading(true);
    const newPrices = {};

    // 1. Tipo de cambio USD/PEN
    try {
      const r = await fetch("https://open.er-api.com/v6/latest/USD");
      const d = await r.json();
      if (d.rates?.PEN) setExRate(d.rates.PEN);
    } catch(_) {}

    // 2. Crypto via CoinGecko
    const cryptoTickers = investments
      .filter(i=>i.type==="crypto")
      .map(i=>i.ticker.toUpperCase())
      .filter((t,idx,arr)=>arr.indexOf(t)===idx);

    const geckoIds = cryptoTickers
      .map(t=>COINGECKO_IDS[t])
      .filter(Boolean);

    if (geckoIds.length > 0) {
      try {
        const r = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${geckoIds.join(",")}&vs_currencies=usd`
        );
        const d = await r.json();
        cryptoTickers.forEach(t=>{
          const id = COINGECKO_IDS[t];
          if (id && d[id]?.usd) newPrices[t] = d[id].usd;
        });
      } catch(_) {}
    }

    // 3. Acciones via Yahoo Finance (best-effort)
    const stockTickers = investments
      .filter(i=>i.type==="stock")
      .map(i=>i.ticker.toUpperCase())
      .filter((t,idx,arr)=>arr.indexOf(t)===idx);

    for (const ticker of stockTickers) {
      try {
        const r = await fetch(
          `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
          { headers:{"Accept":"application/json"} }
        );
        const d = await r.json();
        const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price) newPrices[ticker] = price;
      } catch(_) {}
    }

    setPrices(p=>({...p, ...newPrices}));
    setLoading(false);
  };

  useEffect(()=>{ if(investments.length>0) fetchPrices(); },[investments.length]);

  // ── Cálculos del portafolio ────────────────────────────────
  // getPrice: solo precios confirmados (auto-fetch o manualPrices)
  // inputValues NO entra aquí — evita que el input desaparezca al escribir
  const getPrice = (ticker) => {
    const t = ticker.toUpperCase();
    return prices[t] ?? manualPrices[t] ?? null;
  };

  const enriched = investments.map(inv=>{
    const ticker   = inv.ticker.toUpperCase();
    const curPrice = getPrice(ticker);
    const costBasis = inv.quantity * inv.buy_price;
    const curValue  = curPrice != null ? inv.quantity * curPrice : null;
    const pnl       = curValue != null ? curValue - costBasis : null;
    const pnlPct    = pnl != null && costBasis > 0 ? (pnl / costBasis) * 100 : null;
    return { ...inv, ticker, curPrice, costBasis, curValue, pnl, pnlPct };
  });

  const totalCostUSD  = enriched.reduce((s,i)=>s+i.costBasis, 0);
  const totalCurUSD   = enriched.reduce((s,i)=>s+(i.curValue??i.costBasis), 0);
  const totalPnL      = totalCurUSD - totalCostUSD;
  const totalPnLPct   = totalCostUSD > 0 ? (totalPnL/totalCostUSD)*100 : 0;
  const totalCurPEN   = totalCurUSD * exRate;

  const cryptoUSD = enriched.filter(i=>i.type==="crypto").reduce((s,i)=>s+(i.curValue??i.costBasis),0);
  const stockUSD  = enriched.filter(i=>i.type==="stock") .reduce((s,i)=>s+(i.curValue??i.costBasis),0);
  const pieData   = [
    {name:"🪙 Crypto", value:parseFloat(cryptoUSD.toFixed(2)), color:"#f59e0b"},
    {name:"📈 Acciones",value:parseFloat(stockUSD.toFixed(2)),  color:"#38bdf8"},
  ].filter(d=>d.value>0);

  // ── Consolidado por ticker (PPP) — OBS-06 ─────────────────
  // Agrupa todas las compras del mismo ticker para el widget Top Activos
  const consolidatedByTicker = Object.values(
    enriched.reduce((acc, inv) => {
      const t = inv.ticker;
      if (!acc[t]) {
        acc[t] = {
          ticker:    t,
          name:      inv.name,
          type:      inv.type,
          totalQty:  0,
          totalCost: 0,
          curPrice:  inv.curPrice,
        };
      }
      acc[t].totalQty  += inv.quantity;
      acc[t].totalCost += inv.costBasis;
      // Tomar el precio actual del último registro con precio disponible
      if (inv.curPrice != null) acc[t].curPrice = inv.curPrice;
      return acc;
    }, {})
  ).map(c => {
    const ppp      = c.totalQty > 0 ? c.totalCost / c.totalQty : 0;  // Precio Promedio Ponderado
    const curValue = c.curPrice != null ? c.totalQty * c.curPrice : null;
    const pnl      = curValue != null ? curValue - c.totalCost : null;
    const pnlPct   = pnl != null && c.totalCost > 0 ? (pnl / c.totalCost) * 100 : null;
    return { ...c, ppp, curValue, pnl, pnlPct };
  });

  // ── Snapshot ───────────────────────────────────────────────
  const handleSnapshot = async () => {
    // Primero confirmar cualquier precio que esté siendo escrito en inputs
    const flushed = {...manualPrices};
    Object.entries(inputValues).forEach(([ticker, val])=>{
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 0) flushed[ticker] = parsed;
    });
    setManualPrices(flushed);

    // Verificar que todos los activos tienen precio
    const sinPrecio = investments.filter(inv=>{
      const t = inv.ticker.toUpperCase();
      return !prices[t] && !flushed[t];
    });

    if (sinPrecio.length > 0) {
      const lista = sinPrecio.map(i=>i.ticker).join(", ");
      const ok = window.confirm(
        `Los siguientes activos no tienen precio actual: ${lista}\n\n` +
        `Se usará el precio de compra como valor actual.\n¿Continuar de todas formas?`
      );
      if (!ok) return;
    }

    // Recalcular con precios confirmados
    const enrichedForSnap = investments.map(inv=>{
      const t = inv.ticker.toUpperCase();
      const curPrice = prices[t] ?? flushed[t] ?? null;
      const curValue = curPrice != null ? inv.quantity * curPrice : inv.quantity * inv.buy_price;
      return { ...inv, ticker:t, curPrice, curValue };
    });

    const totalUSD = enrichedForSnap.reduce((s,i)=>s+i.curValue, 0);

    // Fecha+hora para permitir múltiples snapshots por día
    const now      = new Date();
    const dateStr  = now.toISOString().split("T")[0];
    const timeStr  = now.toTimeString().slice(0,5);       // HH:MM
    const dateTime = `${dateStr} ${timeStr}`;

    await onSaveSnapshot({
      date:          dateTime,
      total_usd:     parseFloat(totalUSD.toFixed(2)),
      total_pen:     parseFloat((totalUSD * exRate).toFixed(2)),
      exchange_rate: exRate,
      detail:        enrichedForSnap.map(i=>({
        ticker:    i.ticker,
        name:      i.name,
        qty:       i.quantity,
        price_usd: parseFloat((i.curPrice ?? i.buy_price).toFixed(4)),
        value_usd: parseFloat(i.curValue.toFixed(2)),
      })),
    });
  };

  // ── Form helpers ───────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.name||!form.ticker||!form.quantity||!form.buy_price||!form.buy_date) return;
    const data = {
      ...form,
      ticker:    form.ticker.toUpperCase(),
      quantity:  parseFloat(form.quantity),
      buy_price: parseFloat(form.buy_price),
    };
    if (editId) {
      await onEdit(editId, data);
      setEditId(null);
    } else {
      await onAdd(data);
    }
    setForm({name:"",ticker:"",type:"crypto",platform:"Binance",quantity:"",buy_price:"",buy_date:new Date().toISOString().split("T")[0],notes:""});
    setShowForm(false);
  };

  const startEdit = (inv) => {
    setForm({ name:inv.name, ticker:inv.ticker, type:inv.type, platform:inv.platform,
      quantity:String(inv.quantity), buy_price:String(inv.buy_price), buy_date:inv.buy_date, notes:inv.notes||"" });
    setEditId(inv.id);
    setShowForm(true);
  };

  const fmtUSD = v => v==null?"—":`$${v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const fmtPEN = v => v==null?"—":`S/${v.toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const fmtPct = v => v==null?"—":`${v>=0?"+":""}${v.toFixed(2)}%`;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <div>
          <p style={{color:"#888",fontSize:12,margin:0}}>
            Portafolio · TC: <b style={{color:"#f59e0b"}}>S/{exRate.toFixed(3)}</b> por USD
          </p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={fetchPrices} disabled={loading}
            style={{...s.btn,background:"#111113",border:"1px solid #2a2a30",color:"#888",display:"flex",alignItems:"center",gap:5,fontSize:12}}>
            <RefreshCw size={12} style={{animation:loading?"spin 1s linear infinite":undefined}}/> {loading?"Actualizando...":"Actualizar precios"}
          </button>
          {investments.length>0&&(
            <button onClick={handleSnapshot}
              style={{...s.btn,background:"rgba(56,189,248,0.12)",color:"#38bdf8",border:"1px solid rgba(56,189,248,0.3)",display:"flex",alignItems:"center",gap:5,fontSize:12}}>
              <Save size={12}/> Guardar snapshot
            </button>
          )}
          <button onClick={()=>{setShowForm(!showForm);setEditId(null);setForm({name:"",ticker:"",type:"crypto",platform:"Binance",quantity:"",buy_price:"",buy_date:new Date().toISOString().split("T")[0],notes:""});}}
            style={{...s.btn,background:"rgba(34,197,94,0.12)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.3)",display:"flex",alignItems:"center",gap:5,fontSize:12}}>
            <Plus size={12}/> Agregar activo
          </button>
        </div>
      </div>

      {/* Formulario */}
      {showForm&&(
        <div style={{...s.card,border:"1px solid rgba(34,197,94,0.25)"}}>
          <p style={{color:"#22c55e",fontWeight:700,fontSize:13,margin:"0 0 14px"}}>
            {editId?"✏️ Editar activo":"+ Nuevo activo"}
          </p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:10}}>
            <div>
              <label style={s.label}>NOMBRE</label>
              <input style={s.input} placeholder="Ej. Bitcoin" value={form.name} onChange={e=>setForm(x=>({...x,name:e.target.value}))}/>
            </div>
            <div>
              <label style={s.label}>TICKER</label>
              <input style={s.input} placeholder="Ej. BTC" value={form.ticker}
                onChange={e=>setForm(x=>({...x,ticker:e.target.value.toUpperCase()}))}/>
            </div>
            <div>
              <label style={s.label}>TIPO</label>
              <select style={s.select} value={form.type} onChange={e=>setForm(x=>({...x,type:e.target.value,platform:e.target.value==="crypto"?"Binance":"InteractiveBrokers"}))}>
                <option value="crypto">🪙 Crypto</option>
                <option value="stock">📈 Acción</option>
              </select>
            </div>
            <div>
              <label style={s.label}>PLATAFORMA</label>
              <select style={s.select} value={form.platform} onChange={e=>setForm(x=>({...x,platform:e.target.value}))}>
                <option>Binance</option>
                <option>InteractiveBrokers</option>
                <option>Otro</option>
              </select>
            </div>
            <div>
              <label style={s.label}>CANTIDAD</label>
              <input type="number" style={s.input} placeholder="0.00" value={form.quantity}
                onChange={e=>setForm(x=>({...x,quantity:e.target.value}))}/>
            </div>
            <div>
              <label style={s.label}>PRECIO COMPRA (USD)</label>
              <input type="number" style={s.input} placeholder="0.00" value={form.buy_price}
                onChange={e=>setForm(x=>({...x,buy_price:e.target.value}))}/>
            </div>
            <div>
              <label style={s.label}>FECHA COMPRA</label>
              <input type="date" style={s.input} value={form.buy_date}
                onChange={e=>setForm(x=>({...x,buy_date:e.target.value}))}/>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={handleSubmit}
              style={{...s.btn,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff"}}>
              {editId?"Guardar cambios":"Agregar al portafolio"}
            </button>
            <button onClick={()=>{setShowForm(false);setEditId(null);}}
              style={{...s.btn,background:"#111113",color:"#666",border:"1px solid #2a2a30"}}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Métricas resumen */}
      {investments.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
          <Metric label="Valor actual (USD)" value={fmtUSD(totalCurUSD)}   color="#22c55e"  icon="💰"/>
          <Metric label="Valor actual (S/)"  value={fmtPEN(totalCurPEN)}   color="#38bdf8"  icon="🏦"/>
          <Metric label="Costo total"         value={fmtUSD(totalCostUSD)}  color="#888"     icon="📊"/>
          <Metric label="P&L total"
            value={fmtUSD(totalPnL)}
            color={totalPnL>=0?"#22c55e":"#f87171"}
            icon={totalPnL>=0?"📈":"📉"}
            sub={fmtPct(totalPnLPct)}/>
        </div>
      )}

      {/* Tabla de activos */}
      {investments.length===0?(
        <div style={{...s.card,textAlign:"center",padding:40,color:"#333"}}>
          <p style={{fontSize:28,margin:"0 0 8px"}}>📊</p>
          <p style={{margin:0,fontSize:13}}>Sin activos registrados. Agrega tu primer activo arriba.</p>
        </div>
      ):(
        <div style={s.card}>
          <p style={{color:"#555",fontSize:11,fontWeight:600,margin:"0 0 14px",letterSpacing:"0.5px"}}>PORTAFOLIO DE ACTIVOS</p>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{borderBottom:"1px solid #1a1a20"}}>
                  {["Activo","Plataforma","Cantidad","Compra","Actual","Valor USD","Valor S/","P&L","P&L %",""].map(h=>(
                    <th key={h} style={{color:"#444",fontWeight:600,padding:"6px 10px",textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enriched.map(inv=>{
                  const isPos = inv.pnl==null||inv.pnl>=0;
                  return (
                    <tr key={inv.id} style={{borderBottom:"1px solid #111115"}}>
                      <td style={{padding:"10px",color:"#e0e0e8",fontWeight:600,whiteSpace:"nowrap"}}>
                        <span style={{background:inv.type==="crypto"?"rgba(245,158,11,0.12)":"rgba(56,189,248,0.12)",
                          color:inv.type==="crypto"?"#f59e0b":"#38bdf8",
                          borderRadius:4,padding:"2px 6px",fontSize:11,marginRight:6}}>
                          {inv.type==="crypto"?"🪙":"📈"}
                        </span>
                        {inv.ticker}
                        <span style={{color:"#555",fontWeight:400,marginLeft:6,fontSize:11}}>{inv.name}</span>
                      </td>
                      <td style={{padding:"10px",color:"#666",fontSize:11}}>{inv.platform}</td>
                      <td style={{padding:"10px",color:"#888"}}>{inv.quantity.toLocaleString("en-US",{maximumFractionDigits:6})}</td>
                      <td style={{padding:"10px",color:"#666"}}>{fmtUSD(inv.buy_price)}</td>
                      <td style={{padding:"10px",color:"#e0e0e8"}}>
                        {prices[inv.ticker] != null
                          ? fmtUSD(prices[inv.ticker])   // precio automático → solo mostrar
                          : (
                          <input type="number" placeholder="ingresar precio"
                            style={{...s.input,width:90,padding:"2px 6px",fontSize:11,
                              border:`1px solid ${manualPrices[inv.ticker]?"rgba(34,197,94,0.4)":"rgba(245,158,11,0.4)"}`,
                              color:manualPrices[inv.ticker]?"#22c55e":"#f59e0b"}}
                            value={inputValues[inv.ticker] !== undefined
                              ? inputValues[inv.ticker]
                              : (manualPrices[inv.ticker]!=null ? String(manualPrices[inv.ticker]) : "")}
                            onChange={e=>setInputValues(p=>({...p,[inv.ticker]:e.target.value}))}
                            onBlur={e=>{
                              const val=parseFloat(e.target.value);
                              if(!isNaN(val)&&val>0){
                                setManualPrices(p=>({...p,[inv.ticker]:val}));
                                setInputValues(p=>({...p,[inv.ticker]:String(val)}));
                              }
                            }}
                            onKeyDown={e=>{
                              if(e.key==="Enter"){
                                const val=parseFloat(e.target.value);
                                if(!isNaN(val)&&val>0){
                                  setManualPrices(p=>({...p,[inv.ticker]:val}));
                                  setInputValues(p=>({...p,[inv.ticker]:String(val)}));
                                  e.target.blur();
                                }
                              }
                            }}/>
                        )}
                      </td>
                      <td style={{padding:"10px",color:"#e0e0e8",fontWeight:600}}>{fmtUSD(inv.curValue)}</td>
                      <td style={{padding:"10px",color:"#a0a0b8"}}>{fmtPEN(inv.curValue!=null?inv.curValue*exRate:null)}</td>
                      <td style={{padding:"10px",color:isPos?"#22c55e":"#f87171",fontWeight:600}}>{fmtUSD(inv.pnl)}</td>
                      <td style={{padding:"10px"}}>
                        {inv.pnlPct!=null&&(
                          <span style={{background:isPos?"rgba(34,197,94,0.1)":"rgba(248,113,113,0.1)",
                            color:isPos?"#22c55e":"#f87171",borderRadius:4,padding:"2px 6px",fontWeight:700}}>
                            {fmtPct(inv.pnlPct)}
                          </span>
                        )}
                      </td>
                      <td style={{padding:"10px"}}>
                        <div style={{display:"flex",gap:4}}>
                          <button onClick={()=>startEdit(inv)}
                            style={{background:"none",border:"none",color:"#444",cursor:"pointer",padding:4}}>
                            <Edit2 size={12}/>
                          </button>
                          <button onClick={()=>onDelete(inv.id)}
                            style={{background:"none",border:"none",color:"#333",cursor:"pointer",padding:4}}>
                            <Trash2 size={12}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Distribución crypto vs acciones */}
      {pieData.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div style={s.card}>
            <p style={{color:"#555",fontSize:11,fontWeight:600,margin:"0 0 14px",letterSpacing:"0.5px"}}>DISTRIBUCIÓN</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={78} dataKey="value" paddingAngle={4}>
                  {pieData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                </Pie>
                <Tooltip content={<TTipUSD/>}/>
                <Legend formatter={v=><span style={{color:"#888",fontSize:11}}>{v}</span>}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={s.card}>
            <p style={{color:"#555",fontSize:11,fontWeight:600,margin:"0 0 14px",letterSpacing:"0.5px"}}>TOP ACTIVOS POR VALOR</p>
            <ResponsiveContainer width="100%" height={200}>
              {(()=>{
                const topData = [...consolidatedByTicker]
                  .sort((a,b)=>(b.curValue??0)-(a.curValue??0))
                  .slice(0,6);
                return (
                  <BarChart data={topData} layout="vertical">
                    <XAxis type="number" tick={{fill:"#444",fontSize:10}} tickFormatter={v=>`${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="ticker" tick={{fill:"#888",fontSize:11}} width={50} axisLine={false} tickLine={false}/>
                    <Tooltip content={<TTipUSD/>}/>
                    <Bar dataKey="curValue" name="Valor USD" radius={[0,4,4,0]}>
                      {topData.map((e,i)=>(
                        <Cell key={i} fill={e.type==="crypto"?"#f59e0b":"#38bdf8"}/>
                      ))}
                    </Bar>
                  </BarChart>
                );
              })()}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Evolución del portafolio */}
      <div style={s.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <p style={{color:"#555",fontSize:11,fontWeight:600,margin:0,letterSpacing:"0.5px"}}>
            HISTORIAL DE SNAPSHOTS
          </p>
          <span style={{color:"#333",fontSize:10}}>{snapshots.length} registros</span>
        </div>

        {snapshots.length===0?(
          <div style={{textAlign:"center",padding:24,color:"#444"}}>
            <p style={{margin:"0 0 6px",fontSize:13}}>📸 Sin historial aún</p>
            <p style={{margin:0,fontSize:12,color:"#333"}}>
              Haz clic en <b style={{color:"#38bdf8"}}>Guardar snapshot</b> para registrar el valor actual del portafolio.
            </p>
          </div>
        ):(
          <>
            {/* Tabla de snapshots guardados */}
            <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom: snapshots.length>=2?16:0}}>
              {[...snapshots].reverse().map((snap,i)=>(
                <div key={snap.id||i} style={{display:"flex",alignItems:"center",gap:12,
                  background:"#0a0a0c",border:"1px solid #1a1a20",borderRadius:7,padding:"9px 14px"}}>
                  <div style={{minWidth:130}}>
                    <div style={{color:"#888",fontSize:12}}>{snap.date.split(" ")[0]}</div>
                    {snap.date.includes(" ")&&(
                      <div style={{color:"#444",fontSize:10}}>{snap.date.split(" ")[1]}</div>
                    )}
                  </div>
                  <span style={{color:"#22c55e",fontWeight:700,fontSize:13,minWidth:110}}>
                    ${snap.total_usd.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
                  </span>
                  <span style={{color:"#38bdf8",fontSize:12,minWidth:110}}>
                    S/{snap.total_pen.toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2})}
                  </span>
                  <span style={{color:"#444",fontSize:11,flex:1}}>
                    TC: S/{snap.exchange_rate.toFixed(3)}
                  </span>
                  <button
                    onClick={()=>{
                      if(window.confirm(`¿Eliminar snapshot del ${snap.date}?`))
                        onDeleteSnapshot(snap.id);
                    }}
                    title="Eliminar snapshot"
                    style={{background:"none",border:"none",color:"#2a2a30",cursor:"pointer",
                      padding:4,borderRadius:4,lineHeight:0,
                      transition:"color .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.color="#f87171"}
                    onMouseLeave={e=>e.currentTarget.style.color="#2a2a30"}>
                    <Trash2 size={13}/>
                  </button>
                </div>
              ))}
            </div>

            {/* Gráfico solo si hay 2+ snapshots */}
            {snapshots.length>=2&&(
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={snapshots} margin={{top:4,right:8,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a20"/>
                  <XAxis dataKey="date" tick={{fill:"#555",fontSize:10}} axisLine={false} tickLine={false}
                    tickFormatter={d=>d.slice(5,10)}/>
                  <YAxis yAxisId="usd" orientation="left"  tick={{fill:"#444",fontSize:10}}
                    tickFormatter={v=>`$${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={44}/>
                  <YAxis yAxisId="pen" orientation="right" tick={{fill:"#444",fontSize:10}}
                    tickFormatter={v=>`S/${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={52}/>
                  <Tooltip content={<TTip/>}/>
                  <Legend formatter={v=><span style={{color:"#888",fontSize:10}}>{v}</span>}/>
                  <Line yAxisId="usd" type="monotone" dataKey="total_usd" name="Total USD"
                    stroke="#22c55e" strokeWidth={2} dot={{fill:"#22c55e",r:3}} activeDot={{r:5}}/>
                  <Line yAxisId="pen" type="monotone" dataKey="total_pen" name="Total S/"
                    stroke="#38bdf8" strokeWidth={2} dot={{fill:"#38bdf8",r:3}} activeDot={{r:5}} strokeDasharray="5 3"/>
                </LineChart>
              </ResponsiveContainer>
            )}

            {snapshots.length===1&&(
              <p style={{color:"#333",fontSize:11,textAlign:"center",margin:"8px 0 0"}}>
                Guarda un segundo snapshot para ver el gráfico de evolución.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Calendario ───────────────────────────────────────────────
function CalendarView({profile, period}) {
  const [y,m]=period.split("-").map(Number);
  const days=new Date(y,m,0).getDate();
  const firstDay=(new Date(y,m-1,1).getDay()+6)%7;
  const PERIOD_LABEL=(p)=>p?`${["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][parseInt(p.split("-")[1])]} ${p.split("-")[0].slice(-2)}`:"";
  const events={};
  const add=(day,ev)=>{ if (!events[day]) events[day]=[]; events[day].push(ev); };
  add(profile.pay_day,{label:"💰 Sueldo MINEDU",color:"#22c55e",amount:profile.income});
  (profile.recurring_services||[]).forEach(svc=>{ if (svc.day>=1&&svc.day<=days) add(svc.day,{label:`🔄 ${svc.name}`,color:"#f59e0b",amount:-svc.amount,account:svc.account}); });
  (profile.billing_cycles||[]).forEach(c=>{ if (c.cutDay<=days) add(c.cutDay,{label:`✂️ Corte ${c.name}`,color:"#a78bfa"}); if (c.dueDay<=days) add(c.dueDay,{label:`⚡ Vence ${c.name}`,color:"#ef4444"}); });
  const todayD=new Date().getDate();
  const isNow=period===`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
  const totalSvc=(profile.recurring_services||[]).reduce((s,sv)=>s+sv.amount,0);
  const wdays=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        <Metric label="Ingresos programados" value={fmtN(profile.income)} color="#22c55e" icon="💰"/>
        <Metric label="Salidas automáticas" value={fmtN(totalSvc)} color="#f59e0b" icon="🔄" sub={`${(profile.recurring_services||[]).length} servicios`}/>
        <Metric label="Saldo proyectado" value={fmtN(profile.income-totalSvc)} color={profile.income-totalSvc>0?"#22c55e":"#ef4444"} icon="📊"/>
      </div>
      <div style={s.card}>
        <p style={{color:"#888",fontSize:13,marginBottom:14,fontWeight:600}}>{PERIOD_LABEL(period)} — Eventos del mes</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
          {wdays.map(d=><div key={d} style={{textAlign:"center",color:"#444",fontSize:10,fontWeight:700,padding:"4px 0"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {Array(firstDay).fill(null).map((_,i)=><div key={`e${i}`} style={{minHeight:68}}/>)}
          {Array(days).fill(null).map((_,i)=>{
            const d=i+1, evs=events[d]||[], today=isNow&&d===todayD;
            return (
              <div key={d} style={{minHeight:68,background:today?"rgba(34,197,94,0.07)":"#0a0a0c",
                border:`1px solid ${today?"rgba(34,197,94,0.25)":"#1a1a20"}`,borderRadius:6,padding:"5px 4px"}}>
                <span style={{fontSize:10,color:today?"#22c55e":"#555",display:"block",textAlign:"right",marginBottom:2}}>{d}</span>
                {evs.slice(0,3).map((ev,ei)=>(
                  <div key={ei} style={{background:`${ev.color}18`,borderLeft:`2px solid ${ev.color}`,borderRadius:"0 3px 3px 0",padding:"1px 4px",marginBottom:2}} title={ev.label+(ev.amount?` (${fmtN(Math.abs(ev.amount))})`:"")}> 
                    <span style={{color:ev.color,fontSize:8,whiteSpace:"nowrap",overflow:"hidden",display:"block",textOverflow:"ellipsis"}}>{ev.label}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div style={s.card}>
        <p style={{color:"#888",fontSize:12,fontWeight:600,margin:"0 0 14px"}}>📋 Agenda del mes</p>
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {Object.entries(events).sort(([a],[b])=>Number(a)-Number(b)).flatMap(([day,evs])=>evs.map((ev,i)=>(
            <div key={`${day}-${i}`} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 12px",background:"#0a0a0c",border:`1px solid #1a1a20`,borderLeft:`3px solid ${ev.color}`,borderRadius:7}}>
              <div style={{minWidth:36,textAlign:"center"}}>
                <div style={{color:ev.color,fontWeight:700,fontSize:15}}>{day}</div>
              </div>
              <div style={{flex:1}}>
                <p style={{color:"#e0e0e8",fontSize:13,margin:0,fontWeight:500}}>{ev.label}</p>
                {ev.account&&<p style={{color:"#444",fontSize:11,margin:0}}>{ev.account}</p>}
              </div>
              {ev.amount&&<span style={{color:ev.amount>0?"#22c55e":"#f87171",fontWeight:700,fontSize:13}}>{ev.amount>0?"+":"-"}{fmtN(Math.abs(ev.amount))}</span>}
            </div>
          )))}
        </div>
      </div>
    </div>
  );
}
