/**
 * FinanzasVH v3.1 — App.jsx (refactorizado)
 * Punto de entrada principal. ~350 líneas.
 * Módulos extraídos: constants/, utils/, components/
 */
import { useState, useEffect, useCallback } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import {
  LayoutDashboard, List, Upload, Target, Calendar, Settings,
  Plus, X, Trash2, Bell, Download, TrendingUp, DollarSign,
  Search, Info, HelpCircle, Flag, Edit2,
} from "lucide-react";

// ── Módulos internos ──────────────────────────────────────────
import { api }                from "./api.js";
import { TYPE_CONFIG, getCatColor, DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from "./constants/types.js";
import { autoClassify }       from "./utils/classify.js";
import { calcMetrics, getHealth, HEALTH } from "./utils/metrics.js";
import { fmt, fmtN }          from "./utils/format.js";
import { s, Chip, Metric, TTip } from "./components/ui/shared.jsx";
import { SettingsPanel }      from "./components/settings/SettingsPanel.jsx";
import InversionesTab         from "./components/inversiones/InversionesTab.jsx";
import CalendarView           from "./components/calendar/CalendarView.jsx";

// ── Módulos v3.0 (pre-existentes) ────────────────────────────
import PatrimonioConsolidado  from "./components/patrimonio/PatrimonioConsolidado";
import IngestaExtracto        from "./components/ingesta/IngestaExtracto";
import TransferenciasPanel    from "./components/transferencias/TransferenciasPanel";
import HelpPanel              from "./components/help/HelpPanel";

// ── F-07: Alertas inteligentes de anomalías ─────────────
import AlertasPanel           from "./components/alertas/AlertasPanel";

// ── F-03: Resumen Mensual con IA ─────────────────
import ResumenMensualPanel    from "./components/resumen/ResumenMensualPanel";

// ── F-04: Metas Financieras ───────────────────────
import MetasFinancieras       from "./components/metas/MetasFinancieras";

// ── F-05: Flujo de Caja Proyectado ──────────────────
import FlujoCajaProyectado    from "./components/flujo/FlujoCajaProyectado";

// ── G-01: Treemap de gastos ───────────────────────
import GastoTreemap           from "./components/dashboard/GastoTreemap";

// ── G-05: Heatmap semanal ──────────────────────────
import HeatmapSemanal         from "./components/dashboard/HeatmapSemanal";

// ─────────────────────────────────────────────────────────────
const TABS = [
  { id:"dashboard",   icon:<LayoutDashboard size={15}/>, label:"Dashboard"       },
  { id:"movimientos", icon:<List size={15}/>,            label:"Movimientos"      },
  { id:"importar",    icon:<Upload size={15}/>,          label:"Importar / IA",   badge:"v3.1" },
  { id:"presupuesto", icon:<Target size={15}/>,          label:"Presupuesto"      },
  { id:"calendario",  icon:<Calendar size={15}/>,        label:"Calendario"       },
  { id:"inversiones", icon:<TrendingUp size={15}/>,      label:"Inversiones"      },
  { id:"patrimonio",  icon:<DollarSign size={15}/>,      label:"Patrimonio",      badge:"v3"  },
  { id:"metas",       icon:<Flag size={15}/>,             label:"Metas",           badge:"F-04" },
  { id:"flujo",       icon:<Download size={15}/>,         label:"Flujo de Caja",   badge:"F-05" },
];

const PERIOD_LABEL = (p) => p
  ? `${["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][parseInt(p.split("-")[1])]} ${p.split("-")[0].slice(-2)}`
  : "";

// ─────────────────────────────────────────────────────────────
export default function App({ onLogout }) {
  const [tab,               setTab]               = useState("dashboard");
  const [transactions,      setTransactions]       = useState([]);
  const [budgets,           setBudgets]            = useState({});
  const [profile,           setProfile]            = useState(null);
  const [settings,          setSettings]           = useState(null);
  const [periods,           setPeriods]            = useState([]);
  const [period,            setPeriod]             = useState("");
  const [loading,           setLoading]            = useState(true);
  const [error,             setError]              = useState(null);
  const [toast,             setToast]              = useState("");
  const [filterType,        setFilterType]         = useState("all");
  const [searchQ,           setSearchQ]            = useState("");
  const [movTab,            setMovTab]             = useState("lista");
  const [showForm,          setShowForm]           = useState(false);
  const [showSettingsPanel, setShowSettingsPanel]  = useState(false);
  const [showHelpPanel,     setShowHelpPanel]      = useState(false);
  const [trendData,         setTrendData]          = useState([]);
  const [investments,       setInvestments]        = useState([]);
  const [snapshots,         setSnapshots]          = useState([]);
  const [newTx,             setNewTx]              = useState({
    date: new Date().toISOString().split("T")[0],
    description:"", amount:"", type:"gasto_variable", category:"Alimentación", account:"BCP",
  });
  // OBS-08: edición de movimiento
  const [editingTxId,       setEditingTxId]        = useState(null);
  const [editTxData,        setEditTxData]          = useState(null);
  // OBS-07: filtro por cuenta
  const [filterAccount,     setFilterAccount]       = useState("all");

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(""), 2800); };

  // ── Derivados de settings ──────────────────────────────────
  const activeAccounts = settings
    ? settings.accounts.filter(a=>a.active).map(a=>a.name)
    : DEFAULT_ACCOUNTS.filter(a=>a.active).map(a=>a.name);
  const customRules  = settings?.custom_rules   || [];
  const billingCycles= settings?.billing_cycles || [];
  const categories   = settings?.categories     || DEFAULT_CATEGORIES;
  const classify     = (desc, amt) => autoClassify(desc, amt, customRules);
  // OBS-07: color de cuenta desde configuración
  const getAccountColor = (accountName) => {
    const acc = settings?.accounts?.find(a=>a.name===accountName);
    return acc?.color || "#555";
  };

  // ── Carga inicial ──────────────────────────────────────────
  useEffect(()=>{
    const init = async () => {
      try {
        const [prof, perList, cfg] = await Promise.all([
          api.getProfile(), api.getPeriods(), api.getSettings(),
        ]);
        setProfile(prof);
        setSettings(cfg);
        const now  = new Date();
        const cur  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
        const availPeriods = perList.map(p=>p.period);
        if (!availPeriods.includes(cur)) availPeriods.unshift(cur);
        availPeriods.sort().reverse();
        setPeriods(availPeriods);
        const sel = availPeriods[0] || cur;
        setPeriod(sel);
        const [txs, bud] = await Promise.all([api.getTransactions(sel), api.getBudgets(sel)]);
        setTransactions(txs);
        setBudgets(bud);

        try {
          const [invs, snaps] = await Promise.all([api.getInvestments(), api.getSnapshots()]);
          setInvestments(invs);
          setSnapshots(snaps);
        } catch(_) {}

        const trendPeriods = availPeriods.slice(0,6).reverse();
        try {
          const results = await Promise.all(
            trendPeriods.map(p => api.getTransactions(p).then(txList => {
              const m = calcMetrics(txList, prof?.income||0);
              return { period:p, label:PERIOD_LABEL(p),
                ingresos:m.ingresos, gastosFijos:m.gastosFijos,
                gastosVariables:m.gastosVariables, deudas:m.deudas,
                ahorros:m.ahorros, saldoNeto:m.saldoNeto };
            }))
          );
          setTrendData(results.filter(d=>d.ingresos>0||d.gastosFijos>0||d.gastosVariables>0));
        } catch(_) {}

      } catch(e) {
        setError("No se puede conectar con el backend. ¿Está corriendo Docker? "+e.message);
      } finally { setLoading(false); }
    };
    init();
  }, []);

  // ── Cambio de período ──────────────────────────────────────
  const changePeriod = useCallback(async (p) => {
    setPeriod(p);
    try {
      const [txs, bud] = await Promise.all([api.getTransactions(p), api.getBudgets(p)]);
      setTransactions(txs); setBudgets(bud);
    } catch(e) { showToast("Error cargando período: "+e.message); }
  }, []);

  // ── CRUD Transacciones ─────────────────────────────────────
  const addTx = async () => {
    if (!newTx.description || !newTx.amount) return;
    const amount    = newTx.type==="ingreso" ? Math.abs(parseFloat(newTx.amount)) : -Math.abs(parseFloat(newTx.amount));
    const txPeriod  = newTx.date.substring(0,7);
    try {
      const created = await api.createTransaction({...newTx, amount, period:txPeriod});
      if (txPeriod===period) setTransactions(p=>[created,...p]);
      if (!periods.includes(txPeriod)) setPeriods(p=>[txPeriod,...p].sort().reverse());
      setNewTx({date:new Date().toISOString().split("T")[0],description:"",amount:"",type:"gasto_variable",category:"Alimentación",account:"BCP"});
      setShowForm(false);
      showToast("✓ Movimiento guardado");
    } catch(e) { showToast("Error: "+e.message); }
  };

  const deleteTx = async (id) => {
    const tx = transactions.find(t=>t.id===id);
    if (tx?.source==="internal_transfer") {
      showToast("⚠️ Este movimiento pertenece a una transferencia interna. Elimínala desde 'Transferencias internas'.");
      return;
    }
    try {
      await api.deleteTransaction(id);
      setTransactions(p=>p.filter(t=>t.id!==id));
      showToast("Movimiento eliminado");
    } catch(e) { showToast("Error: "+e.message); }
  };

  // OBS-08: actualizar movimiento existente
  const updateTx = async () => {
    if (!editTxData?.description || !editTxData?.amount) return;
    const amount = editTxData.type==="ingreso" ? Math.abs(parseFloat(editTxData.amount)) : -Math.abs(parseFloat(editTxData.amount));
    const txPeriod = editTxData.date.substring(0,7);
    try {
      const updated = await api.updateTransaction(editingTxId, {...editTxData, amount, period:txPeriod});
      setTransactions(prev => prev.map(t => t.id===editingTxId ? updated : t));
      setEditingTxId(null); setEditTxData(null);
      showToast("✓ Movimiento actualizado");
    } catch(e) { showToast("Error al actualizar: "+e.message); }
  };

  const handleImport = async (txs) => {
    try {
      const result = await api.importTransactions(txs);
      const fresh  = await api.getTransactions(period);
      setTransactions(fresh);
      const perList = await api.getPeriods();
      const ps = perList.map(p=>p.period);
      setPeriods(prev=>[...new Set([...prev,...ps])].sort().reverse());
      showToast(result.message);
      return result;
    } catch(e) { showToast("Error importando: "+e.message); throw e; }
  };

  const saveBudget = async (cat, val) => {
    const updated = {...budgets, [cat]:parseFloat(val)||0};
    setBudgets(updated);
    try { await api.saveBudgets(period, updated); } catch(_) { showToast("Error guardando presupuesto"); }
  };

  const saveProfile = async (p) => {
    try { const saved=await api.saveProfile(p); setProfile(saved); showToast("✓ Perfil guardado"); }
    catch(e) { showToast("Error: "+e.message); }
  };

  const saveSettings = async (cfg) => {
    try { await api.saveSettings(cfg); setSettings(cfg); showToast("✓ Configuración guardada"); }
    catch(e) { throw e; }
  };

  // ── CRUD Inversiones ───────────────────────────────────────
  const addInvestment    = async (inv) => { try { const c=await api.createInvestment(inv);  setInvestments(p=>[c,...p]); showToast("✓ Activo agregado"); return c; } catch(e){ showToast("Error: "+e.message); throw e; } };
  const editInvestment   = async (id,inv) => { try { const u=await api.updateInvestment(id,inv); setInvestments(p=>p.map(x=>x.id===id?u:x)); showToast("✓ Activo actualizado"); } catch(e){ showToast("Error: "+e.message); } };
  const removeInvestment = async (id) => { try { await api.deleteInvestment(id); setInvestments(p=>p.filter(x=>x.id!==id)); showToast("Activo eliminado"); } catch(e){ showToast("Error: "+e.message); } };
  const addSnapshot      = async (snap) => { try { await api.saveSnapshot(snap); setSnapshots(await api.getSnapshots()); showToast("✓ Snapshot guardado"); } catch(e){ showToast("Error: "+e.message); } };
  const removeSnapshot   = async (id) => { try { await api.deleteSnapshot(id); setSnapshots(p=>p.filter(x=>x.id!==id)); showToast("Snapshot eliminado"); } catch(e){ showToast("Error: "+e.message); } };

  const exportBackup = async () => {
    try {
      const data = await api.exportAll();
      const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href=url; a.download=`finanzas-vh-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click(); URL.revokeObjectURL(url);
      showToast("✓ Backup exportado");
    } catch(e) { showToast("Error exportando: "+e.message); }
  };

  // ── Métricas derivadas ─────────────────────────────────────
  const metrics  = calcMetrics(transactions, profile?.income||0);
  const health   = getHealth(metrics);
  const hc       = HEALTH[health];

  const catMap = {};
  transactions.filter(t=>t.type!=="ingreso"&&!t.excluir_del_analisis).forEach(t=>{
    if (!catMap[t.category]) catMap[t.category]={amount:0,type:t.type};
    catMap[t.category].amount += Math.abs(t.amount);
  });
  const catData  = Object.entries(catMap).map(([cat,v])=>({cat,amount:v.amount,type:v.type,color:getCatColor(cat,v.type)})).sort((a,b)=>b.amount-a.amount);
  const pieData  = [
    {name:"Gastos Fijos",    value:metrics.gastosFijos,     color:TYPE_CONFIG.gasto_fijo.color},
    {name:"Gastos Variables",value:metrics.gastosVariables, color:TYPE_CONFIG.gasto_variable.color},
    {name:"Deudas",          value:metrics.deudas,          color:TYPE_CONFIG.deuda.color},
    {name:"Ahorros",         value:metrics.ahorros,         color:TYPE_CONFIG.ahorro.color},
  ].filter(d=>d.value>0);

  const alerts = Object.entries(budgets).filter(([cat,bud])=>{
    const actual=catMap[cat]?.amount||0; return bud>0&&actual/bud>=0.85;
  }).map(([cat,bud])=>({cat,pct:Math.round((catMap[cat]?.amount||0)/bud*100)}));

  const filteredTxs = transactions
    .filter(t=>filterType==="all"||t.type===filterType)
    .filter(t=>filterAccount==="all"||t.account===filterAccount)  // OBS-07
    .filter(t=>!searchQ||t.description.toLowerCase().includes(searchQ.toLowerCase()))
    .sort((a,b)=>b.date.localeCompare(a.date));

  // ── Loading / Error ────────────────────────────────────────
  if (loading) return (
    <div style={{background:"#080809",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}><div style={{fontSize:32,marginBottom:12}}>💼</div><p style={{color:"#888",fontSize:14}}>Conectando con el backend...</p></div>
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
          <code style={{color:"#22c55e",fontSize:12,lineHeight:2,display:"block"}}>cd finanzas-vh<br/>docker-compose up -d<br/># Luego abre: http://localhost:3000</code>
        </div>
        <button onClick={()=>window.location.reload()} style={{...s.btn,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff"}}>Reintentar</button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{background:"#080809",minHeight:"100vh",fontFamily:"'DM Mono','Courier New',monospace",color:"#f0f0f2"}}>

      {/* Toast */}
      {toast&&<div style={{position:"fixed",bottom:20,right:20,background:"#111113",border:"1px solid #22c55e",color:"#22c55e",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:600,zIndex:999,boxShadow:"0 4px 20px rgba(0,0,0,0.5)"}}>{toast}</div>}

      {/* Header */}
      <div style={{background:"#0c0c0f",borderBottom:"1px solid #1a1a20",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:40}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{background:"linear-gradient(135deg,#22c55e,#16a34a)",borderRadius:9,padding:"7px 9px",fontSize:18}}>💼</div>
          <div>
            <div style={{fontSize:15,fontWeight:700,letterSpacing:"-0.3px"}}>FinanzasVH <span style={{color:"#22c55e",fontSize:10}}>v3.1</span></div>
            <div style={{color:"#444",fontSize:10}}>{profile?.name||"Mi sistema financiero"} · {PERIOD_LABEL(period)}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {alerts.length>0&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:6,padding:"4px 10px",display:"flex",alignItems:"center",gap:5}}>
            <Bell size={12} color="#ef4444"/><span style={{color:"#ef4444",fontSize:12,fontWeight:600}}>{alerts.length}</span>
          </div>}
          <select value={period} onChange={e=>changePeriod(e.target.value)} style={{...s.select,width:"auto",padding:"5px 10px",fontSize:12}}>
            {periods.map(p=><option key={p} value={p}>{PERIOD_LABEL(p)}</option>)}
          </select>
          <button onClick={exportBackup} title="Exportar backup JSON"
            style={{...s.btn,background:"#1a1a20",color:"#888",border:"1px solid #2a2a30",padding:"6px 10px",display:"flex",alignItems:"center",gap:4}}>
            <Download size={13}/>
          </button>
          {onLogout&&<button onClick={()=>{if(window.confirm("¿Cerrar sesión?"))onLogout();}} title="Cerrar sesión"
            style={{...s.btn,background:"#1a1a20",color:"#555",border:"1px solid #2a2a30",padding:"6px 10px",display:"flex",alignItems:"center",gap:4,fontSize:12}}>
            🔒
          </button>}
          <button onClick={()=>setShowHelpPanel(true)} title="Ayuda y documentación"
            style={{...s.btn,background:"#1a1a20",color:"#888",border:"1px solid #2a2a30",padding:"6px 10px",display:"flex",alignItems:"center",gap:4,fontWeight:700,fontSize:12}}>
            <HelpCircle size={13}/>
          </button>
          <button onClick={()=>setShowSettingsPanel(true)} title="Configuración"
            style={{...s.btn,background:customRules.length>0?"rgba(34,197,94,0.12)":"#1a1a20",color:customRules.length>0?"#22c55e":"#888",
              border:`1px solid ${customRules.length>0?"rgba(34,197,94,0.3)":"#2a2a30"}`,padding:"6px 10px",display:"flex",alignItems:"center",gap:4}}>
            <Settings size={13}/>{customRules.length>0&&<span style={{fontSize:10,fontWeight:700}}>{customRules.length}</span>}
          </button>
        </div>
      </div>

      {/* Panels laterales */}
      {showHelpPanel&&<HelpPanel onClose={()=>setShowHelpPanel(false)}/>}
      {showSettingsPanel&&settings&&(
        <SettingsPanel settings={settings} profile={profile} onSave={saveSettings} onSaveProfile={saveProfile} onClose={()=>setShowSettingsPanel(false)}/>
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

        {/* Banner primera configuración */}
        {activeAccounts.length===0&&(
          <div style={{background:"linear-gradient(135deg,rgba(34,197,94,0.08),rgba(56,189,248,0.06))",border:"1px solid rgba(34,197,94,0.3)",borderRadius:12,padding:"20px 24px",marginBottom:20,display:"flex",alignItems:"flex-start",gap:16}}>
            <span style={{fontSize:32,flexShrink:0}}>👋</span>
            <div style={{flex:1}}>
              <p style={{color:"#22c55e",fontWeight:700,fontSize:15,margin:"0 0 6px"}}>Bienvenido — sistema vacío y listo</p>
              <p style={{color:"#888",fontSize:12,margin:"0 0 14px",lineHeight:1.7}}>Antes de registrar movimientos, configura tus cuentas y datos básicos. Solo toma 2 minutos.</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {[{n:"1",t:"Abre ⚙️ Configuración",d:"Botón arriba a la derecha"},{n:"2",t:"Agrega tus cuentas",d:"Bancos, tarjetas, billeteras"},{n:"3",t:"Configura tus ciclos",d:"Fechas de corte de tarjetas"},{n:"4",t:"Ingresa tu perfil",d:"Nombre, sueldo, día de cobro"}].map(step=>(
                  <div key={step.n} style={{background:"#0a0a0c",border:"1px solid #1e1e26",borderRadius:8,padding:"10px 14px",display:"flex",gap:10,alignItems:"center",minWidth:180}}>
                    <span style={{background:"rgba(34,197,94,0.15)",color:"#22c55e",fontWeight:700,fontSize:12,width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{step.n}</span>
                    <div><p style={{color:"#d0d0d8",fontSize:12,fontWeight:600,margin:0}}>{step.t}</p><p style={{color:"#555",fontSize:11,margin:0}}>{step.d}</p></div>
                  </div>
                ))}
              </div>
              <button onClick={()=>setShowSettingsPanel(true)} style={{...s.btn,marginTop:14,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff",display:"flex",alignItems:"center",gap:6,fontSize:13}}>
                <Settings size={14}/> Abrir Configuración ahora
              </button>
            </div>
          </div>
        )}

        {/* ══ DASHBOARD ═══════════════════════════════════════ */}
        {tab==="dashboard"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {/* Semáforo */}
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
            {/* KPIs */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:10}}>
              <Metric label="Ingresos"         value={fmtN(metrics.ingresos)}         color="#22c55e" icon="💰" sub={profile?.name||"—"}/>
              <Metric label="Gastos Fijos"      value={fmtN(metrics.gastosFijos)}      color="#f59e0b" icon="🏠" sub={`${((metrics.gastosFijos/Math.max(metrics.ingresos,1))*100).toFixed(0)}%`}/>
              <Metric label="Gastos Variables"  value={fmtN(metrics.gastosVariables)}  color="#f87171" icon="🛒" sub={`${((metrics.gastosVariables/Math.max(metrics.ingresos,1))*100).toFixed(0)}%`}/>
              <Metric label="Deudas"            value={fmtN(metrics.deudas)}           color="#a78bfa" icon="💳" sub={`${metrics.ratioDeuda.toFixed(1)}%`}/>
              <Metric label="Ahorros"           value={fmtN(metrics.ahorros)}          color="#38bdf8" icon="🏦" sub={`Tasa ${metrics.tasaAhorro.toFixed(1)}%`}/>
            </div>
            {/* F-07 — Alertas inteligentes */}
            <AlertasPanel period={period} />

            {/* Gráficos */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div style={s.card}>
                <p style={{color:"#555",fontSize:11,fontWeight:600,margin:"0 0 14px",letterSpacing:"0.5px"}}>DISTRIBUCIÓN GASTOS</p>
                <ResponsiveContainer width="100%" height={185}>
                  <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} dataKey="value" paddingAngle={3}>
                    {pieData.map((e,i)=><Cell key={i} fill={e.color}/>)}</Pie>
                    <Tooltip content={<TTip/>}/><Legend formatter={v=><span style={{color:"#888",fontSize:10}}>{v}</span>}/>
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

            {/* G-01 — Treemap de gastos */}
            {catData.length > 0 && (
              <div style={s.card}>
                <p style={{color:"#555",fontSize:11,fontWeight:600,margin:"0 0 14px",letterSpacing:"0.5px"}}>MAPA DE GASTOS · {PERIOD_LABEL(period)}</p>
                <GastoTreemap catData={catData} />
              </div>
            )}

            {/* Evolución mensual */}
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
                    <Tooltip content={<TTip/>}/><Legend formatter={v=><span style={{color:"#888",fontSize:10}}>{v}</span>}/>
                    <Line type="monotone" dataKey="ingresos"        name="💰 Ingresos"     stroke="#22c55e" strokeWidth={2} dot={{fill:"#22c55e",r:3}} activeDot={{r:5}}/>
                    <Line type="monotone" dataKey="gastosFijos"     name="🏠 Gastos Fijos" stroke="#f59e0b" strokeWidth={2} dot={{fill:"#f59e0b",r:3}} activeDot={{r:5}}/>
                    <Line type="monotone" dataKey="gastosVariables" name="🛒 Gastos Var."  stroke="#f87171" strokeWidth={2} dot={{fill:"#f87171",r:3}} activeDot={{r:5}}/>
                    <Line type="monotone" dataKey="saldoNeto"       name="📊 Saldo Neto"   stroke="#38bdf8" strokeWidth={2} strokeDasharray="5 3" dot={{fill:"#38bdf8",r:3}} activeDot={{r:5}}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Comparativo */}
            {(()=>{
              const curIdx=trendData.findIndex(d=>d.period===period);
              const prevData=curIdx>0?trendData[curIdx-1]:null, curData=trendData[curIdx];
              if (!prevData||!curData) return null;
              const compData=[
                {cat:"Gastos Fijos",actual:curData.gastosFijos,anterior:prevData.gastosFijos,color:"#f59e0b"},
                {cat:"Gastos Var.",actual:curData.gastosVariables,anterior:prevData.gastosVariables,color:"#f87171"},
                {cat:"Deudas",actual:curData.deudas,anterior:prevData.deudas,color:"#a78bfa"},
                {cat:"Ahorros",actual:curData.ahorros,anterior:prevData.ahorros,color:"#38bdf8"},
              ].filter(d=>d.actual>0||d.anterior>0);
              const varPct=(a,b)=>b>0?((a-b)/b*100).toFixed(0):null;
              return (
                <div style={s.card}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <p style={{color:"#555",fontSize:11,fontWeight:600,margin:0,letterSpacing:"0.5px"}}>COMPARATIVO</p>
                    <div style={{display:"flex",gap:14}}>
                      <span style={{display:"flex",alignItems:"center",gap:4,color:"#888",fontSize:10}}><span style={{width:10,height:10,borderRadius:2,background:"#22c55e",display:"inline-block"}}/>{curData.label}</span>
                      <span style={{display:"flex",alignItems:"center",gap:4,color:"#888",fontSize:10}}><span style={{width:10,height:10,borderRadius:2,background:"#333",display:"inline-block"}}/>{prevData.label}</span>
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
                    {compData.map(d=>{ const pct=varPct(d.actual,d.anterior); if(pct===null) return null; const up=parseFloat(pct)>0, isGood=d.cat==="Ahorros"?up:!up;
                      return <div key={d.cat} style={{background:"#0a0a0c",border:"1px solid #1a1a20",borderRadius:6,padding:"5px 10px",display:"flex",gap:5,alignItems:"center"}}>
                        <span style={{color:"#555",fontSize:11}}>{d.cat}</span>
                        <span style={{color:parseFloat(pct)===0?"#444":isGood?"#22c55e":"#f87171",fontWeight:700,fontSize:12}}>{up?"+":""}{pct}%</span>
                      </div>;
                    })}
                  </div>
                </div>
              );
            })()}

            {/* F-03 — Resumen Mensual con IA */}
            <ResumenMensualPanel period={period} />

            {/* Recomendaciones */}
            {(()=>{
              const cuentasAhorro    = (settings?.accounts||[]).filter(a=>a.active&&["ahorro","saving"].includes((a.type||a.tipo||a.kind||"").toLowerCase())).map(a=>a.name);
              const cuentasInversion = (settings?.accounts||[]).filter(a=>a.active&&["inversión","inversion","investment","cripto","crypto","broker"].some(t=>(a.type||a.tipo||a.kind||"").toLowerCase().includes(t))).map(a=>a.name);
              const destAhorro    = cuentasAhorro.length>0    ? cuentasAhorro.join(" o ")    : "tu cuenta de ahorro";
              const destInversion = cuentasInversion.length>0 ? cuentasInversion.join(" o ") : "tus inversiones";
              return (
                <div style={s.card}>
                  <p style={{color:"#555",fontSize:11,fontWeight:600,margin:"0 0 12px",letterSpacing:"0.5px"}}>RECOMENDACIONES</p>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {metrics.tasaAhorro<10&&<div style={{background:"rgba(56,189,248,0.07)",border:"1px solid rgba(56,189,248,0.18)",borderRadius:8,padding:"12px 14px"}}><p style={{color:"#38bdf8",fontWeight:700,fontSize:13,margin:"0 0 4px"}}>Incrementa tu ahorro</p><p style={{color:"#666",fontSize:12,margin:0}}>Meta 10% = {fmtN(metrics.ingresos*0.10)}/mes. Transfiere a {destAhorro} el día {(profile?.pay_day||6)+1}.</p></div>}
                    {metrics.ratioDeuda>25&&<div style={{background:"rgba(167,139,250,0.07)",border:"1px solid rgba(167,139,250,0.18)",borderRadius:8,padding:"12px 14px"}}><p style={{color:"#a78bfa",fontWeight:700,fontSize:13,margin:"0 0 4px"}}>Controla el ratio de deuda</p><p style={{color:"#666",fontSize:12,margin:0}}>Deudas = {metrics.ratioDeuda.toFixed(1)}% (límite: 25%). Paga tarjetas en total para evitar intereses.</p></div>}
                    {metrics.saldoNeto>500&&<div style={{background:"rgba(34,197,94,0.07)",border:"1px solid rgba(34,197,94,0.18)",borderRadius:8,padding:"12px 14px"}}><p style={{color:"#22c55e",fontWeight:700,fontSize:13,margin:"0 0 4px"}}>Aprovecha el excedente</p><p style={{color:"#666",fontSize:12,margin:0}}>Tienes {fmtN(metrics.saldoNeto)} disponible. Considera transferir a {destAhorro} o a {destInversion}.</p></div>}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ══ MOVIMIENTOS ═════════════════════════════════════ */}
        {tab==="movimientos"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",gap:4,borderBottom:"1px solid #1a1a20",marginBottom:2}}>
              {[{id:"lista",label:"📋 Lista de movimientos"},{id:"transferencias",label:"🔁 Transferencias internas"},{id:"heatmap",label:"🔥 Heatmap"}].map(st=>(
                <button key={st.id} onClick={()=>setMovTab(st.id)}
                  style={{background:"transparent",border:"none",cursor:"pointer",padding:"8px 14px",fontSize:12,fontWeight:movTab===st.id?700:400,
                    color:movTab===st.id?"#22c55e":"#555",borderBottom:movTab===st.id?"2px solid #22c55e":"2px solid transparent"}}>
                  {st.label}
                </button>
              ))}
            </div>
            {movTab==="transferencias"&&<TransferenciasPanel currentPeriod={period} onTransferCreated={async()=>{const f=await api.getTransactions(period);setTransactions(f);}}/>}
            {movTab==="heatmap"&&<HeatmapSemanal transactions={transactions} period={period}/>}
            {movTab==="lista"&&<>
              {/* OBS-08: Formulario unificado para agregar Y editar movimientos */}
              {(showForm||editingTxId!==null)&&(()=>{
                const isEdit=editingTxId!==null;
                const formData=isEdit?editTxData:newTx;
                const setFD=isEdit?setEditTxData:setNewTx;
                return (
                <div style={{...s.card,border:`1px solid ${isEdit?"rgba(56,189,248,0.35)":"rgba(34,197,94,0.3)"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <span style={{color:isEdit?"#38bdf8":"#22c55e",fontWeight:700,fontSize:13}}>{isEdit?"✏️ Editar Movimiento":"+ Nuevo Movimiento"}</span>
                    <button onClick={()=>{setShowForm(false);setEditingTxId(null);setEditTxData(null);}} style={{background:"none",border:"none",color:"#444",cursor:"pointer"}}><X size={15}/></button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
                    <div><label style={s.label}>FECHA</label><input type="date" style={s.input} value={formData?.date||""} onChange={e=>setFD(x=>({...x,date:e.target.value}))}/></div>
                    <div style={{gridColumn:"span 2"}}><label style={s.label}>DESCRIPCIÓN</label><input style={s.input} placeholder="Ej. Supermercado Wong" value={formData?.description||""} onChange={e=>setFD(x=>({...x,description:e.target.value}))}/></div>
                    <div><label style={s.label}>MONTO (S/)</label><input type="number" style={s.input} value={formData?.amount||""} onChange={e=>setFD(x=>({...x,amount:e.target.value}))}/></div>
                    <div>
                      <label style={{...s.label,display:"flex",alignItems:"center",gap:4}}>TIPO
                        {formData?.type==="deuda"&&<span title="Pago de obligación contraída previamente" style={{cursor:"help",color:"#a78bfa",display:"inline-flex",alignItems:"center"}}><Info size={12}/></span>}
                      </label>
                      <select style={s.select} value={formData?.type||"gasto_variable"} onChange={e=>setFD(x=>({...x,type:e.target.value,category:(categories[e.target.value]||[])[0]||""}))}>
                        {Object.entries(TYPE_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                      </select>
                      {formData?.type==="deuda"&&<div style={{marginTop:5,padding:"6px 9px",borderRadius:6,background:"rgba(167,139,250,0.08)",border:"1px solid rgba(167,139,250,0.25)",fontSize:10.5,color:"#c4b5fd",lineHeight:1.5}}>
                        💳 <strong>Deuda/Cuota:</strong> obligación de crédito ya contraída.<br/>
                        <span style={{opacity:0.8}}>Ej: pago tarjeta BBVA, cuota préstamo, iO crédito.</span>
                      </div>}
                    </div>
                    <div><label style={s.label}>CATEGORÍA</label>
                      <select style={s.select} value={formData?.category||""} onChange={e=>setFD(x=>({...x,category:e.target.value}))}>
                        {(categories[formData?.type||"gasto_variable"]||[]).map(c=><option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div><label style={s.label}>CUENTA</label>
                      <select style={s.select} value={formData?.account||""} onChange={e=>setFD(x=>({...x,account:e.target.value}))}>
                        {activeAccounts.map(a=><option key={a}>{a}</option>)}
                      </select>
                    </div>
                  </div>
                  <button onClick={isEdit?updateTx:addTx} style={{...s.btn,background:isEdit?"linear-gradient(135deg,#38bdf8,#0284c7)":"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff",marginTop:12}}>
                    {isEdit?"Actualizar movimiento":"Guardar movimiento"}
                  </button>
                </div>
                );
              })()}
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
                <select value={filterAccount} onChange={e=>setFilterAccount(e.target.value)}
                  style={{...s.select,width:"auto",padding:"5px 10px",fontSize:11,color:filterAccount==="all"?"#555":"#38bdf8",border:`1px solid ${filterAccount==="all"?"#1a1a20":"rgba(56,189,248,0.3)"}`}}>
                  <option value="all">Todas las cuentas</option>
                  {activeAccounts.map(a=><option key={a} value={a}>{a}</option>)}
                </select>
                {!showForm&&editingTxId===null&&<button onClick={()=>setShowForm(true)} style={{...s.btn,background:"rgba(34,197,94,0.12)",color:"#22c55e",border:"1px solid rgba(34,197,94,0.3)",display:"flex",alignItems:"center",gap:5}}>
                  <Plus size={13}/> Agregar
                </button>}
              </div>
              <div style={{display:"flex",gap:8}}>
                {[{l:"Registros",v:filteredTxs.length,c:"#888"},{l:"Ingresos",v:fmtN(filteredTxs.filter(t=>t.type==="ingreso").reduce((s,t)=>s+t.amount,0)),c:"#22c55e"},
                  {l:"Egresos",v:fmtN(filteredTxs.filter(t=>t.type!=="ingreso").reduce((s,t)=>s+Math.abs(t.amount),0)),c:"#f87171"}
                ].map(item=>(
                  <div key={item.l} style={{flex:1,...s.card,padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
                    <span style={{color:"#444",fontSize:11}}>{item.l}</span><span style={{color:item.c,fontWeight:700,fontSize:13}}>{item.v}</span>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {filteredTxs.length>0&&(
                  <div style={{display:"grid",gridTemplateColumns:"52px 78px 1fr 88px 96px 70px 82px 46px 22px 22px",gap:6,padding:"4px 14px",alignItems:"center"}}>
                    {["Período","Fecha","Descripción / Comercio","Cuenta","Categoría","Tipo","Monto","","",""].map((h,i)=>(
                      <span key={i} style={{color:"#2a2a30",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</span>
                    ))}
                  </div>
                )}
                {filteredTxs.length===0&&<div style={{...s.card,textAlign:"center",color:"#444",padding:32}}>No hay movimientos para este período.</div>}
                {filteredTxs.map(tx=>{
                  const accColor=getAccountColor(tx.account);
                  const isEditing=editingTxId===tx.id;
                  return (
                  <div key={tx.id} style={{background:isEditing?"#0c1520":"#0f0f12",border:`1px solid ${isEditing?"rgba(56,189,248,0.35)":tx.excluir_del_analisis?"rgba(56,189,248,0.12)":"#1a1a20"}`,borderLeft:`3px solid ${tx.excluir_del_analisis?"#38bdf8":TYPE_CONFIG[tx.type]?.color||"#555"}`,borderRadius:8,padding:"10px 14px",display:"grid",gridTemplateColumns:"52px 78px 1fr 88px 96px 70px 82px 46px 22px 22px",gap:6,alignItems:"center"}}>
                    <span style={{color:"#333",fontSize:10}}>{tx.period||tx.date?.substring(0,7)||""}</span>
                    <span style={{color:"#444",fontSize:11}}>{tx.date}</span>
                    <span style={{color:tx.excluir_del_analisis?"#555":"#d0d0d8",fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.description}</span>
                    {/* OBS-07: columna cuenta con punto de color */}
                    <div style={{display:"flex",alignItems:"center",gap:4,overflow:"hidden"}}>
                      <span style={{width:6,height:6,borderRadius:"50%",background:accColor,flexShrink:0,boxShadow:`0 0 4px ${accColor}70`}}/>
                      <span style={{color:"#666",fontSize:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.account||"—"}</span>
                    </div>
                    <span style={{color:"#555",fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.category||"—"}</span>
                    <Chip type={tx.type}/>
                    <span style={{color:tx.amount>0?"#22c55e":"#f87171",fontWeight:700,fontSize:13,textAlign:"right"}}>{tx.amount>0?"+":"-"}{fmt(tx.amount)}</span>
                    {/* badge fuente */}
                    {tx.excluir_del_analisis
                      ?<span style={{background:"rgba(56,189,248,0.08)",color:"#38bdf8",fontSize:9,padding:"2px 6px",borderRadius:3,textAlign:"center",whiteSpace:"nowrap"}}>INTERNO 🔒</span>
                      :tx.source&&tx.source!=="manual"
                        ?<span style={{background:"rgba(56,189,248,0.06)",color:"#555",fontSize:9,padding:"2px 5px",borderRadius:3}}>{tx.source==="import_csv"?"CSV":"PDF"}</span>
                        :<span/>
                    }
                    {/* OBS-08: botón editar */}
                    <button
                      onClick={()=>{
                        if(tx.excluir_del_analisis){showToast("⚠️ Edita transferencias internas desde su módulo.");return;}
                        if(isEditing){setEditingTxId(null);setEditTxData(null);}
                        else{setEditingTxId(tx.id);setEditTxData({...tx,amount:Math.abs(tx.amount)});setShowForm(false);window.scrollTo({top:0,behavior:"smooth"});}
                      }}
                      title={tx.excluir_del_analisis?"No editable: transferencia interna":isEditing?"Cancelar edición":"Editar movimiento"}
                      style={{background:isEditing?"rgba(56,189,248,0.15)":"none",border:"none",color:tx.excluir_del_analisis?"#1e1e26":isEditing?"#38bdf8":"#333",cursor:tx.excluir_del_analisis?"not-allowed":"pointer",padding:3,borderRadius:3,display:"flex",alignItems:"center"}}>
                      <Edit2 size={12}/>
                    </button>
                    {/* botón eliminar */}
                    <button onClick={()=>deleteTx(tx.id)} title={tx.excluir_del_analisis?"No se puede eliminar: transferencia interna":"Eliminar"}
                      style={{background:"none",border:"none",color:tx.excluir_del_analisis?"#1a1a20":"#2a2a30",cursor:tx.excluir_del_analisis?"not-allowed":"pointer",padding:3,display:"flex",alignItems:"center"}}>
                      <Trash2 size={13}/>
                    </button>
                  </div>
                  );
                })}
              </div>
            </>}
          </div>
        )}

        {/* ══ IMPORTAR / INGESTA IA ════════════════════════════ */}
        {tab==="importar"&&<IngestaExtracto
          onImport={handleImport}
          classify={classify}
          customRules={customRules}
          activeAccounts={activeAccounts}
          categories={categories}
          existingTransactions={transactions}
          billingCycles={billingCycles}
          onSaveRule={async (rule)=>{
            const newCfg={...settings,custom_rules:[...(settings?.custom_rules||[]),rule]};
            await saveSettings(newCfg);
            showToast(`✓ Regla "${rule.label}" guardada`);
          }}
        />}

        {/* ══ PRESUPUESTO ═════════════════════════════════════ */}
        {tab==="presupuesto"&&(()=>{
          const allCats=new Map();
          ["gasto_fijo","gasto_variable","deuda","ahorro"].forEach(type=>{
            (categories[type]||DEFAULT_CATEGORIES[type]||[]).forEach(cat=>{
              if(!allCats.has(cat)) allCats.set(cat,{cat,amount:0,type,color:getCatColor(cat,type)});
            });
          });
          catData.forEach(({cat,amount,type})=>allCats.set(cat,{cat,amount,type,color:getCatColor(cat,type)}));
          const sorted=[...allCats.values()].sort((a,b)=>{
            const aBud=budgets[a.cat]||0, bBud=budgets[b.cat]||0;
            if(aBud>0&&bBud===0) return -1; if(bBud>0&&aBud===0) return 1; return b.amount-a.amount;
          });
          return (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <p style={{color:"#555",fontSize:12,margin:0}}>Presupuesto · {PERIOD_LABEL(period)} · Edita los montos directamente</p>
                <span style={{color:"#333",fontSize:11}}>{Object.keys(budgets).filter(k=>budgets[k]>0).length} categorías con meta</span>
              </div>
              {sorted.map(({cat,amount,type,color})=>{
                const bud=budgets[cat]||0, pct2=bud>0?Math.min((amount/bud)*100,120):0;
                const bc=pct2>100?"#ef4444":pct2>85?"#f59e0b":color;
                return (
                  <div key={cat} style={{...s.card,opacity:amount===0&&bud===0?0.5:1}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <span style={{fontSize:13,fontWeight:500,color:amount===0?"#555":"#d0d0d8"}}>{cat} <Chip type={type}/></span>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{color:"#888",fontSize:12}}>Real: <b style={{color:amount===0?"#333":color}}>{fmtN(amount)}</b></span>
                        <span style={{color:"#333",fontSize:12}}>/ S/</span>
                        <input type="number" value={bud||""} placeholder="—" onChange={e=>saveBudget(cat,e.target.value)} style={{...s.input,width:80,textAlign:"right",padding:"3px 8px"}}/>
                      </div>
                    </div>
                    <div style={{background:"#0a0a0c",borderRadius:4,height:5,overflow:"hidden"}}>
                      <div style={{background:bud>0?bc:"#1a1a20",width:`${Math.min(pct2,100)}%`,height:"100%",borderRadius:4,transition:"width .3s"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                      <span style={{color:"#2a2a30",fontSize:10}}>{amount===0?"sin movimientos":""}</span>
                      {bud>0&&<span style={{color:pct2>100?"#ef4444":pct2>85?"#f59e0b":"#444",fontSize:11}}>{Math.round(pct2)}%{pct2>100?" ⚠️ EXCEDIDO":""}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ══ CALENDARIO ══════════════════════════════════════ */}
        {tab==="calendario"&&profile&&<CalendarView profile={profile} period={period}/>}

        {/* ══ INVERSIONES ═════════════════════════════════════ */}
        {tab==="inversiones"&&(
          <InversionesTab
            investments={investments} snapshots={snapshots}
            onAdd={addInvestment} onEdit={editInvestment} onDelete={removeInvestment}
            onSaveSnapshot={addSnapshot} onDeleteSnapshot={removeSnapshot}
          />
        )}

        {/* ══ PATRIMONIO ══════════════════════════════════════ */}
        {tab==="patrimonio"&&<PatrimonioConsolidado/>}

        {/* ══ METAS FINANCIERAS (F-04) ═══════════ */}
        {tab==="metas"&&(
          <MetasFinancieras
            accounts={activeAccounts}
            income={profile?.income||0}
          />
        )}

        {/* ══ FLUJO DE CAJA PROYECTADO (F-05) ═════════ */}
        {tab==="flujo"&&(
          <FlujoCajaProyectado period={period} />
        )}

      </div>
    </div>
  );
}
