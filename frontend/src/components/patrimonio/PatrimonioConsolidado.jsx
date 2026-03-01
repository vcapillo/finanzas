/**
 * FinanzasVH v3.0 — PatrimonioConsolidado.jsx
 * Estilo 100% coherente con App.jsx (mismo sistema inline s.*)
 */
import { useEffect, useState } from "react";
import { api } from "../../api.js";
import AssetCard             from "./AssetCard.jsx";
import NetWorthChart         from "./NetWorthChart.jsx";
import RadarSaludFinanciera  from "./RadarSaludFinanciera.jsx";  // G-08

// ── Mismo objeto de estilos que App.jsx ───────────────────────
const s = {
  card:   { background:"#111113", border:"1px solid #222226", borderRadius:12, padding:"18px 20px" },
  input:  { width:"100%", background:"#0a0a0c", border:"1px solid #2a2a30", color:"#f0f0f2", borderRadius:8, padding:"8px 12px", fontSize:13, boxSizing:"border-box", outline:"none" },
  btn:    { border:"none", borderRadius:8, padding:"9px 18px", fontSize:13, fontWeight:600, cursor:"pointer" },
  label:  { color:"#666670", fontSize:11, fontWeight:600, display:"block", marginBottom:4, letterSpacing:"0.5px" },
};

const GROUP_ORDER  = ["CUENTA_OPERATIVA","AHORRO","FONDO_MUTUO","BOLSA_USA","CRYPTO","CREDITO"];
const GROUP_LABELS = {
  CUENTA_OPERATIVA:"Cuentas Operativas",
  AHORRO:          "Ahorro",
  FONDO_MUTUO:     "Fondos Mutuos",
  BOLSA_USA:       "Bolsa USA",
  CRYPTO:          "Criptomonedas",
  CREDITO:         "Crédito / Pasivos",
};
const GROUP_ICONS  = {
  CUENTA_OPERATIVA:"🏦", AHORRO:"🏛️", FONDO_MUTUO:"📈",
  BOLSA_USA:"🇺🇸", CRYPTO:"₿", CREDITO:"💳",
};
const GROUP_COLORS = {
  CUENTA_OPERATIVA:"#22c55e", AHORRO:"#38bdf8", FONDO_MUTUO:"#a78bfa",
  BOLSA_USA:"#f59e0b",        CRYPTO:"#fb923c", CREDITO:"#f87171",
};

const fmtPEN = (n) =>
  `S/ ${Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits:2, maximumFractionDigits:2 })}`;

export default function PatrimonioConsolidado() {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [period,     setPeriod]     = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [error,      setError]      = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      const res = await api.getPatrimonioConsolidado();
      setData(res);
      setError(null);
    } catch {
      setError(
        "No se pudo cargar el patrimonio. Verifica que el backend esté activo y que hayas ejecutado el seed de activos."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Loading
  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:60, gap:12 }}>
      <div style={{ fontSize:32 }}>⏳</div>
      <p style={{ color:"#555", fontSize:13 }}>Cargando patrimonio consolidado…</p>
    </div>
  );

  // Error
  if (error) return (
    <div style={{
      ...s.card,
      border:"1px solid rgba(239,68,68,0.3)",
      background:"rgba(239,68,68,0.05)",
      textAlign:"center", padding:36,
    }}>
      <div style={{ fontSize:32, marginBottom:12 }}>⚠️</div>
      <p style={{ color:"#ef4444", fontWeight:700, fontSize:14, margin:"0 0 8px" }}>Error al cargar</p>
      <p style={{ color:"#666", fontSize:12, lineHeight:1.7, margin:"0 0 14px" }}>{error}</p>
      <p style={{ color:"#444", fontSize:11, margin:"0 0 16px" }}>
        ¿Ejecutaste el seed?{" "}
        <code style={{ color:"#38bdf8", background:"#0a0a0c", padding:"2px 6px", borderRadius:4 }}>
          docker exec finanzas-backend python seed_assets_v3.py
        </code>
      </p>
      <button onClick={fetchData}
        style={{ ...s.btn, background:"rgba(34,197,94,0.12)", color:"#22c55e", border:"1px solid rgba(34,197,94,0.3)" }}>
        ↻ Reintentar
      </button>
    </div>
  );

  // Sin activos
  if (!data?.assets?.length) return (
    <div style={{ ...s.card, textAlign:"center", padding:48 }}>
      <div style={{ fontSize:40, marginBottom:12 }}>🏦</div>
      <p style={{ color:"#888", fontSize:14, fontWeight:600, margin:"0 0 8px" }}>Sin activos registrados</p>
      <p style={{ color:"#444", fontSize:12, lineHeight:1.7, margin:"0 0 16px" }}>
        Ejecuta el seed para cargar tus cuentas iniciales:
      </p>
      <code style={{
        display:"block", background:"#0a0a0c",
        border:"1px solid #1a1a20", borderRadius:8,
        padding:"12px 16px", color:"#22c55e", fontSize:12, lineHeight:2,
      }}>
        docker exec finanzas-backend python seed_assets_v3.py
      </code>
    </div>
  );

  // Agrupar activos por tipo
  const grouped = (data.assets || []).reduce((acc, asset) => {
    const key = asset.asset_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(asset);
    return acc;
  }, {});

  const isPositive = (data.patrimonio_neto_pen || 0) >= 0;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* ── BANNER: Patrimonio Neto ── */}
      <div style={{
        ...s.card,
        background: `linear-gradient(135deg,${isPositive ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)"},#111113)`,
        border: `1px solid ${isPositive ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
      }}>
        {/* Título + botón */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
          <div>
            <div style={{ color:"#555560", fontSize:11, fontWeight:600, letterSpacing:"0.5px", marginBottom:4 }}>
              PATRIMONIO NETO TOTAL
            </div>
            <div style={{ color: isPositive ? "#22c55e" : "#ef4444", fontSize:32, fontWeight:700, letterSpacing:"-0.5px" }}>
              {fmtPEN(data.patrimonio_neto_pen)}
            </div>
          </div>
          <button onClick={fetchData} disabled={refreshing}
            style={{ ...s.btn, background:"#1a1a20", color:"#666", border:"1px solid #2a2a30", fontSize:12, padding:"6px 14px" }}>
            {refreshing ? "⟳ Actualizando…" : "↻ Actualizar"}
          </button>
        </div>

        {/* Activos − Pasivos */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:16, alignItems:"center", marginBottom:16 }}>
          <div style={{ background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:10, padding:"14px 18px" }}>
            <div style={{ color:"#555", fontSize:11, marginBottom:4 }}>ACTIVOS</div>
            <div style={{ color:"#22c55e", fontSize:20, fontWeight:700 }}>{fmtPEN(data.total_activos_pen)}</div>
          </div>
          <span style={{ color:"#333", fontSize:24, fontWeight:300 }}>−</span>
          <div style={{ background:"rgba(248,113,113,0.08)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:10, padding:"14px 18px" }}>
            <div style={{ color:"#555", fontSize:11, marginBottom:4 }}>PASIVOS</div>
            <div style={{ color:"#f87171", fontSize:20, fontWeight:700 }}>{fmtPEN(data.total_pasivos_pen)}</div>
          </div>
        </div>

        {/* Meta info */}
        <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
          <span style={{ color:"#444", fontSize:11 }}>
            💱 TC: <strong style={{ color:"#f59e0b" }}>S/ {(data.exchange_rate_used || 0).toFixed(3)}</strong> / USD
          </span>
          {data.generated_at && (
            <span style={{ color:"#333", fontSize:11 }}>
              🕒 {new Date(data.generated_at).toLocaleString("es-PE")}
            </span>
          )}
        </div>
      </div>

      {/* ── SECCIONES POR TIPO ── */}
      {GROUP_ORDER.map((type) => {
        if (!grouped[type]?.length) return null;
        const color = GROUP_COLORS[type] || "#888";
        const total = grouped[type].reduce((sum, a) => sum + (a.balance_pen || 0), 0);
        return (
          <div key={type}>
            {/* Encabezado de sección */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
              <span style={{ fontSize:16 }}>{GROUP_ICONS[type]}</span>
              <span style={{ color:"#888", fontSize:11, fontWeight:700, letterSpacing:"0.5px" }}>
                {GROUP_LABELS[type].toUpperCase()}
              </span>
              <div style={{ flex:1, height:1, background:"#1a1a20" }}/>
              <span style={{ color, fontSize:11, fontWeight:700 }}>{fmtPEN(total)}</span>
            </div>
            {/* Grid de tarjetas */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:10 }}>
              {grouped[type].map((asset) => (
                <AssetCard key={asset.asset_id} asset={asset} onSnapshotSaved={fetchData}/>
              ))}
            </div>
          </div>
        );
      })}

      {/* ── G-08: RADAR DE SALUD FINANCIERA ── */}
      <RadarSaludFinanciera period={period} />

      {/* ── GRÁFICO HISTÓRICO ── */}
      <div style={s.card}>
        <p style={{ color:"#555", fontSize:11, fontWeight:600, margin:"0 0 16px", letterSpacing:"0.5px" }}>
          📊 EVOLUCIÓN DEL PATRIMONIO NETO
        </p>
        <NetWorthChart/>
      </div>
    </div>
  );
}
