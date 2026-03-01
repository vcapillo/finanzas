/**
 * FinanzasVH — components/inversiones/InversionesTab.jsx
 * Portafolio de inversiones: crypto + acciones con precios en tiempo real.
 * F-02: Precios actualizados automáticamente por scheduler backend (APScheduler).
 */
import { useState, useEffect } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, LineChart, Line, CartesianGrid, Legend
} from "recharts";
import { RefreshCw, Plus, Save, Edit2, Trash2, Clock, Zap } from "lucide-react";
import { api } from "../../api.js";
import { COINGECKO_IDS } from "../../constants/rules.js";
import { s, Metric, TTipUSD, TTip } from "../ui/shared.jsx";

export default function InversionesTab({ investments, snapshots, onAdd, onEdit, onDelete, onSaveSnapshot, onDeleteSnapshot }) {
  const [prices,       setPrices]      = useState({});
  const [exRate,       setExRate]       = useState(3.72);
  const [loading,      setLoading]      = useState(false);
  const [refreshing,   setRefreshing]   = useState(false);
  const [lastUpdated,  setLastUpdated]  = useState(null);   // F-02: timestamp backend
  const [scheduleInfo, setScheduleInfo] = useState(null);   // F-02: estado scheduler
  const [showForm,     setShowForm]     = useState(false);
  const [editId,       setEditId]       = useState(null);
  const [manualPrices, setManualPrices] = useState({});
  const [inputValues,  setInputValues]  = useState({});
  const [form, setForm] = useState({
    name:"", ticker:"", type:"crypto", platform:"Binance",
    quantity:"", buy_price:"", buy_date: new Date().toISOString().split("T")[0], notes:""
  });

  // ── F-02: Cargar precios desde caché del backend ───────────
  const loadCachedPrices = async () => {
    try {
      const data = await api.getCurrentPrices();
      if (data?.prices) {
        const flat = {};
        Object.entries(data.prices).forEach(([ticker, info]) => {
          flat[ticker.toUpperCase()] = info.price_usd;
        });
        setPrices(p => ({ ...p, ...flat }));
      }
      if (data?.exchange_rate) setExRate(data.exchange_rate);
      if (data?.last_updated)  setLastUpdated(new Date(data.last_updated));
    } catch(_) {}
  };

  // ── Fetch precios (usa caché backend F-02) ─────────────────
  const fetchPrices = async () => {
    setLoading(true);
    await loadCachedPrices();
    setLoading(false);
  };

  // ── F-02: Forzar actualización vía backend ─────────────────
  const forceRefresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshPrices();
      await new Promise(r => setTimeout(r, 2500));
      await loadCachedPrices();
      const info = await api.getScheduleInfo();
      setScheduleInfo(info);
    } catch(e) {
      console.error("Error al forzar actualización:", e);
    }
    setRefreshing(false);
  };

  // ── F-02: Estado del scheduler ─────────────────────────────
  const loadScheduleInfo = async () => {
    try {
      const info = await api.getScheduleInfo();
      setScheduleInfo(info);
    } catch(_) {}
  };

  useEffect(() => {
    if (investments.length > 0) {
      fetchPrices();
      loadScheduleInfo();
    }
  }, [investments.length]);

  // ── Cálculos del portafolio ────────────────────────────────
  const getPrice = (ticker) => {
    const t = ticker.toUpperCase();
    return prices[t] ?? manualPrices[t] ?? null;
  };

  const enriched = investments.map(inv=>{
    const ticker    = inv.ticker.toUpperCase();
    const curPrice  = getPrice(ticker);
    const costBasis = inv.quantity * inv.buy_price;
    const curValue  = curPrice != null ? inv.quantity * curPrice : null;
    const pnl       = curValue != null ? curValue - costBasis : null;
    const pnlPct    = pnl != null && costBasis > 0 ? (pnl / costBasis) * 100 : null;
    return { ...inv, ticker, curPrice, costBasis, curValue, pnl, pnlPct };
  });

  const totalCostUSD = enriched.reduce((s,i)=>s+i.costBasis, 0);
  const totalCurUSD  = enriched.reduce((s,i)=>s+(i.curValue??i.costBasis), 0);
  const totalPnL     = totalCurUSD - totalCostUSD;
  const totalPnLPct  = totalCostUSD > 0 ? (totalPnL/totalCostUSD)*100 : 0;
  const totalCurPEN  = totalCurUSD * exRate;

  const cryptoUSD = enriched.filter(i=>i.type==="crypto").reduce((s,i)=>s+(i.curValue??i.costBasis),0);
  const stockUSD  = enriched.filter(i=>i.type==="stock") .reduce((s,i)=>s+(i.curValue??i.costBasis),0);
  const pieData   = [
    {name:"🪙 Crypto",  value:parseFloat(cryptoUSD.toFixed(2)), color:"#f59e0b"},
    {name:"📈 Acciones",value:parseFloat(stockUSD.toFixed(2)),  color:"#38bdf8"},
  ].filter(d=>d.value>0);

  // ── Consolidado por ticker (PPP) — OBS-06 ─────────────────
  const consolidatedByTicker = Object.values(
    enriched.reduce((acc, inv) => {
      const t = inv.ticker;
      if (!acc[t]) acc[t] = { ticker:t, name:inv.name, type:inv.type, totalQty:0, totalCost:0, curPrice:inv.curPrice };
      acc[t].totalQty  += inv.quantity;
      acc[t].totalCost += inv.costBasis;
      if (inv.curPrice != null) acc[t].curPrice = inv.curPrice;
      return acc;
    }, {})
  ).map(c => {
    const ppp      = c.totalQty > 0 ? c.totalCost / c.totalQty : 0;
    const curValue = c.curPrice != null ? c.totalQty * c.curPrice : null;
    const pnl      = curValue != null ? curValue - c.totalCost : null;
    const pnlPct   = pnl != null && c.totalCost > 0 ? (pnl / c.totalCost) * 100 : null;
    return { ...c, ppp, curValue, pnl, pnlPct };
  });

  const TICKER_COLORS = [
    "#f59e0b","#38bdf8","#22c55e","#a78bfa",
    "#f87171","#34d399","#fb923c","#60a5fa",
    "#e879f9","#94a3b8","#fbbf24","#2dd4bf",
  ];

  // Mapa ticker → color único, compartido entre pie y bar
  const tickerColorMap = {};
  [...consolidatedByTicker]
    .sort((a,b)=>(b.curValue??b.totalCost)-(a.curValue??a.totalCost))
    .forEach((c,i) => { tickerColorMap[c.ticker] = TICKER_COLORS[i % TICKER_COLORS.length]; });

  const pieDataByTicker = consolidatedByTicker
    .filter(c=>(c.curValue??c.totalCost)>0)
    .sort((a,b)=>(b.curValue??b.totalCost)-(a.curValue??a.totalCost))
    .map((c)=>({  // ← sin índice, usa tickerColorMap
      name:c.ticker, fullName:c.name,
      value:parseFloat((c.curValue??c.totalCost).toFixed(2)),
      color:tickerColorMap[c.ticker], type:c.type,
    }));

  // ── Snapshot ───────────────────────────────────────────────
  const handleSnapshot = async () => {
    const flushed = {...manualPrices};
    Object.entries(inputValues).forEach(([ticker, val])=>{
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 0) flushed[ticker] = parsed;
    });
    setManualPrices(flushed);

    const sinPrecio = investments.filter(inv=>{
      const t = inv.ticker.toUpperCase();
      return !prices[t] && !flushed[t];
    });

    if (sinPrecio.length > 0) {
      const lista = sinPrecio.map(i=>i.ticker).join(", ");
      const ok = window.confirm(
        `Los siguientes activos no tienen precio: ${lista}\n\nSe usará el precio de compra. ¿Continuar?`
      );
      if (!ok) return;
    }

    const enrichedForSnap = investments.map(inv=>{
      const t = inv.ticker.toUpperCase();
      const curPrice = prices[t] ?? flushed[t] ?? null;
      const curValue = curPrice != null ? inv.quantity * curPrice : inv.quantity * inv.buy_price;
      return { ...inv, ticker:t, curPrice, curValue };
    });

    const totalUSD = enrichedForSnap.reduce((s,i)=>s+i.curValue, 0);
    const now      = new Date();
    const dateStr  = now.toISOString().split("T")[0];
    const timeStr  = now.toTimeString().slice(0,5);
    const dateTime = `${dateStr} ${timeStr}`;

    await onSaveSnapshot({
      date:          dateTime,
      total_usd:     parseFloat(totalUSD.toFixed(2)),
      total_pen:     parseFloat((totalUSD * exRate).toFixed(2)),
      exchange_rate: exRate,
      detail:        enrichedForSnap.map(i=>({
        ticker:    i.ticker, name:i.name, qty:i.quantity,
        price_usd: parseFloat((i.curPrice ?? i.buy_price).toFixed(4)),
        value_usd: parseFloat(i.curValue.toFixed(2)),
      })),
    });
  };

  // ── Form helpers ───────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.name||!form.ticker||!form.quantity||!form.buy_price||!form.buy_date) return;
    const data = { ...form, ticker:form.ticker.toUpperCase(), quantity:parseFloat(form.quantity), buy_price:parseFloat(form.buy_price) };
    if (editId) { await onEdit(editId, data); setEditId(null); }
    else        { await onAdd(data); }
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
        <p style={{color:"#888",fontSize:12,margin:0}}>
          Portafolio · TC: <b style={{color:"#f59e0b"}}>S/{exRate.toFixed(3)}</b> por USD
        </p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {/* F-02: indicador última actualización */}
          {lastUpdated && (
            <div style={{display:"flex",alignItems:"center",gap:4,background:"#0a0a0c",
              border:"1px solid #1a1a20",borderRadius:6,padding:"4px 10px",fontSize:11}}>
              <Clock size={10} style={{color:"#444"}}/>
              <span style={{color:"#444"}}>
                Actualizado: <span style={{color:"#555"}}>
                  {lastUpdated.toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})}
                </span>
              </span>
            </div>
          )}
          {/* F-02: botón forzar actualización */}
          <button onClick={forceRefresh} disabled={refreshing}
            style={{...s.btn,background:"rgba(168,85,247,0.08)",color:"#a855f7",
              border:"1px solid rgba(168,85,247,0.25)",display:"flex",alignItems:"center",gap:5,fontSize:12}}>
            <Zap size={12} style={{animation:refreshing?"spin 1s linear infinite":undefined}}/>
            {refreshing?"Actualizando APIs...":"Actualizar ahora"}
          </button>
          <button onClick={fetchPrices} disabled={loading}
            style={{...s.btn,background:"#111113",border:"1px solid #2a2a30",color:"#888",display:"flex",alignItems:"center",gap:5,fontSize:12}}>
            <RefreshCw size={12} style={{animation:loading?"spin 1s linear infinite":undefined}}/> {loading?"Cargando...":"Recargar caché"}
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

      {/* F-02: Panel estado scheduler */}
      {scheduleInfo?.running && (
        <div style={{background:"#050507",border:"1px solid #151518",borderRadius:8,
          padding:"10px 14px",display:"flex",flexWrap:"wrap",gap:16,alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:"#22c55e",
              boxShadow:"0 0 6px #22c55e"}}/>
            <span style={{color:"#22c55e",fontSize:11,fontWeight:600}}>Scheduler activo</span>
          </div>
          {(scheduleInfo.jobs || []).map(job => (
            <div key={job.id} style={{display:"flex",alignItems:"center",gap:5,fontSize:10}}>
              <span style={{color:"#333",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>
                {{
                  crypto_prices:"🪙 Crypto",
                  stock_prices:"📈 Acciones",
                  exchange_rate:"💱 TC",
                  auto_snapshot:"📸 Snapshot",
                }[job.id] || job.id}
              </span>
              <span style={{color:"#1a1a24"}}>·</span>
              <span style={{color:"#2a2a38"}}>
                {job.next_run
                  ? new Date(job.next_run).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"})
                  : "—"}
              </span>
            </div>
          ))}
          <span style={{color:"#1a1a24",fontSize:10,marginLeft:"auto"}}>
            crypto/4h · acciones/6h · TC/1h · snapshot/fin-mes
          </span>
        </div>
      )}

      {/* Formulario */}
      {showForm&&(
        <div style={{...s.card,border:"1px solid rgba(34,197,94,0.25)"}}>
          <p style={{color:"#22c55e",fontWeight:700,fontSize:13,margin:"0 0 14px"}}>
            {editId?"✏️ Editar activo":"+ Nuevo activo"}
          </p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:10}}>
            {[
              {label:"NOMBRE",      field:"name",       ph:"Ej. Bitcoin"},
              {label:"TICKER",      field:"ticker",     ph:"Ej. BTC", upper:true},
            ].map(({label,field,ph,upper})=>(
              <div key={field}>
                <label style={s.label}>{label}</label>
                <input style={s.input} placeholder={ph} value={form[field]}
                  onChange={e=>setForm(x=>({...x,[field]:upper?e.target.value.toUpperCase():e.target.value}))}/>
              </div>
            ))}
            <div>
              <label style={s.label}>TIPO</label>
              <select style={s.select} value={form.type}
                onChange={e=>setForm(x=>({...x,type:e.target.value,platform:e.target.value==="crypto"?"Binance":"InteractiveBrokers"}))}>
                <option value="crypto">🪙 Crypto</option>
                <option value="stock">📈 Acción</option>
              </select>
            </div>
            <div>
              <label style={s.label}>PLATAFORMA</label>
              <select style={s.select} value={form.platform}
                onChange={e=>setForm(x=>({...x,platform:e.target.value}))}>
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
          <Metric label="Valor actual (USD)" value={fmtUSD(totalCurUSD)}  color="#22c55e" icon="💰"/>
          <Metric label="Valor actual (S/)"  value={fmtPEN(totalCurPEN)}  color="#38bdf8" icon="🏦"/>
          <Metric label="Costo total"         value={fmtUSD(totalCostUSD)} color="#888"    icon="📊"/>
          <Metric label="P&L total"
            value={fmtUSD(totalPnL)}
            color={totalPnL>=0?"#22c55e":"#f87171"}
            icon={totalPnL>=0?"📈":"📉"}
            sub={fmtPct(totalPnLPct)}/>
        </div>
      )}

      {/* Posiciones consolidadas por ticker — OBS-06 */}
      {consolidatedByTicker.length>0&&(
        <div style={s.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div>
              <p style={{color:"#555",fontSize:11,fontWeight:600,margin:"0 0 2px",letterSpacing:"0.5px"}}>POSICIONES CONSOLIDADAS</p>
              <p style={{color:"#333",fontSize:10,margin:0}}>PPP = Precio Promedio Ponderado de todas las compras por ticker</p>
            </div>
            <span style={{background:"rgba(56,189,248,0.1)",color:"#38bdf8",fontSize:10,padding:"2px 8px",borderRadius:4,border:"1px solid rgba(56,189,248,0.2)"}}>
              {consolidatedByTicker.length} ticker{consolidatedByTicker.length!==1?"s":""}
            </span>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{borderBottom:"1px solid #1a1a20"}}>
                  {["Activo","Qty total","PPP (compra)","Precio actual","Costo total","Valor USD","Valor S/","P&L","Rend."].map(h=>(
                    <th key={h} style={{color:"#444",fontWeight:600,padding:"6px 10px",textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...consolidatedByTicker].sort((a,b)=>(b.curValue??0)-(a.curValue??0)).map((c)=>{
                  const isPos = c.pnl==null||c.pnl>=0;
                  return (
                    <tr key={c.ticker} style={{borderBottom:"1px solid #111115"}}>
                      <td style={{padding:"10px",color:"#e0e0e8",fontWeight:600,whiteSpace:"nowrap"}}>
                        <span style={{background:c.type==="crypto"?"rgba(245,158,11,0.12)":"rgba(56,189,248,0.12)",
                          color:c.type==="crypto"?"#f59e0b":"#38bdf8",borderRadius:4,padding:"2px 6px",fontSize:11,marginRight:6}}>
                          {c.type==="crypto"?"🪙":"📈"}
                        </span>
                        {c.ticker}
                        <span style={{color:"#555",fontWeight:400,marginLeft:6,fontSize:11}}>{c.name}</span>
                      </td>
                      <td style={{padding:"10px",color:"#888"}}>{c.totalQty.toLocaleString("en-US",{maximumFractionDigits:6})}</td>
                      <td style={{padding:"10px",color:"#666"}}>${c.ppp.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:4})}</td>
                      <td style={{padding:"10px",color:"#e0e0e8"}}>
                        {c.curPrice!=null
                          ?`$${c.curPrice.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:4})}`
                          :<span style={{color:"#444",fontSize:11}}>sin precio</span>}
                      </td>
                      <td style={{padding:"10px",color:"#666"}}>${c.totalCost.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                      <td style={{padding:"10px",color:"#e0e0e8",fontWeight:600}}>
                        {c.curValue!=null?`$${c.curValue.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"-"}
                      </td>
                      <td style={{padding:"10px",color:"#a0a0b8"}}>
                        {c.curValue!=null?`S/${(c.curValue*exRate).toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"-"}
                      </td>
                      <td style={{padding:"10px",color:isPos?"#22c55e":"#f87171",fontWeight:600}}>
                        {c.pnl!=null?`${c.pnl>=0?"+":""}$${c.pnl.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"-"}
                      </td>
                      <td style={{padding:"10px"}}>
                        {c.pnlPct!=null&&(
                          <span style={{background:isPos?"rgba(34,197,94,0.1)":"rgba(248,113,113,0.1)",
                            color:isPos?"#22c55e":"#f87171",borderRadius:4,padding:"2px 6px",fontWeight:700}}>
                            {`${c.pnlPct>=0?"+":""}${c.pnlPct.toFixed(2)}%`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabla de activos (detalle por compra) */}
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
                          color:inv.type==="crypto"?"#f59e0b":"#38bdf8",borderRadius:4,padding:"2px 6px",fontSize:11,marginRight:6}}>
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
                          ? fmtUSD(prices[inv.ticker])
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
                          <button onClick={()=>startEdit(inv)} style={{background:"none",border:"none",color:"#444",cursor:"pointer",padding:4}}><Edit2 size={12}/></button>
                          <button onClick={()=>onDelete(inv.id)} style={{background:"none",border:"none",color:"#333",cursor:"pointer",padding:4}}><Trash2 size={12}/></button>
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

      {/* Distribución por ticker + Top Activos */}
      {pieDataByTicker.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div style={s.card}>
            <p style={{color:"#555",fontSize:11,fontWeight:600,margin:"0 0 4px",letterSpacing:"0.5px"}}>DISTRIBUCIÓN POR ACTIVO</p>
            <p style={{color:"#333",fontSize:10,margin:"0 0 10px"}}>Valor consolidado por ticker</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieDataByTicker} cx="50%" cy="50%" innerRadius={52} outerRadius={78} dataKey="value" paddingAngle={3}>
                  {pieDataByTicker.map((e,i)=><Cell key={i} fill={e.color}/>)}
                </Pie>
                <Tooltip content={<TTipUSD/>}/>
                <Legend formatter={(v,entry)=>(
                  <span style={{color:"#888",fontSize:10}}>
                    {entry.payload.type==="crypto"?"🪙":"📈"} {v}
                  </span>
                )}/>
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
                      {topData.map((e,i)=><Cell key={i} fill={tickerColorMap[e.ticker] ?? TICKER_COLORS[i]}/>)}
                    </Bar>
                  </BarChart>
                );
              })()}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Evolución del portafolio / Snapshots */}
      <div style={s.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <p style={{color:"#555",fontSize:11,fontWeight:600,margin:0,letterSpacing:"0.5px"}}>HISTORIAL DE SNAPSHOTS</p>
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
            <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:snapshots.length>=2?16:0}}>
              {[...snapshots].reverse().map((snap,i)=>(
                <div key={snap.id||i} style={{display:"flex",alignItems:"center",gap:12,
                  background:"#0a0a0c",border:"1px solid #1a1a20",borderRadius:7,padding:"9px 14px"}}>
                  <div style={{minWidth:130}}>
                    <div style={{color:"#888",fontSize:12}}>{snap.date.split(" ")[0]}</div>
                    {snap.date.includes(" ")&&<div style={{color:"#444",fontSize:10}}>{snap.date.split(" ")[1]}</div>}
                  </div>
                  <span style={{color:"#22c55e",fontWeight:700,fontSize:13,minWidth:110}}>
                    ${snap.total_usd.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
                  </span>
                  <span style={{color:"#38bdf8",fontSize:12,minWidth:110}}>
                    S/{snap.total_pen.toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2})}
                  </span>
                  <span style={{color:"#444",fontSize:11,flex:1}}>TC: S/{snap.exchange_rate.toFixed(3)}</span>
                  <button
                    onClick={()=>{ if(window.confirm(`¿Eliminar snapshot del ${snap.date}?`)) onDeleteSnapshot(snap.id); }}
                    style={{background:"none",border:"none",color:"#2a2a30",cursor:"pointer",padding:4,borderRadius:4,lineHeight:0,transition:"color .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.color="#f87171"}
                    onMouseLeave={e=>e.currentTarget.style.color="#2a2a30"}>
                    <Trash2 size={13}/>
                  </button>
                </div>
              ))}
            </div>

            {snapshots.length>=2&&(
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={snapshots} margin={{top:4,right:8,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a20"/>
                  <XAxis dataKey="date" tick={{fill:"#555",fontSize:10}} axisLine={false} tickLine={false} tickFormatter={d=>d.slice(5,10)}/>
                  <YAxis yAxisId="usd" orientation="left"  tick={{fill:"#444",fontSize:10}} tickFormatter={v=>`$${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={44}/>
                  <YAxis yAxisId="pen" orientation="right" tick={{fill:"#444",fontSize:10}} tickFormatter={v=>`S/${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={52}/>
                  <Tooltip content={<TTip/>}/>
                  <Legend formatter={v=><span style={{color:"#888",fontSize:10}}>{v}</span>}/>
                  <Line yAxisId="usd" type="monotone" dataKey="total_usd" name="Total USD" stroke="#22c55e" strokeWidth={2} dot={{fill:"#22c55e",r:3}} activeDot={{r:5}}/>
                  <Line yAxisId="pen" type="monotone" dataKey="total_pen" name="Total S/"  stroke="#38bdf8" strokeWidth={2} dot={{fill:"#38bdf8",r:3}} activeDot={{r:5}} strokeDasharray="5 3"/>
                </LineChart>
              </ResponsiveContainer>
            )}
            {snapshots.length===1&&(
              <p style={{color:"#333",fontSize:11,textAlign:"center",margin:"8px 0 0"}}>Guarda un segundo snapshot para ver el gráfico de evolución.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
