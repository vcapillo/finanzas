/**
 * G-08 — RadarSaludFinanciera.jsx
 * Módulo Patrimonio — FinanzasOS v3.1
 *
 * Uso en PatrimonioConsolidado.jsx:
 *   import RadarSaludFinanciera from "./RadarSaludFinanciera";
 *   // Al final del return, antes de cerrar el <div> principal:
 *   <RadarSaludFinanciera period={period} />
 *
 * Dependencias ya disponibles en el proyecto:
 *   - recharts
 *   - Estilos: mismo sistema inline s.* de PatrimonioConsolidado
 */

import { useState, useEffect, useCallback } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

// ── Estilos coherentes con PatrimonioConsolidado.jsx ─────────────────────────
const s = {
  card:  { background: "#111113", border: "1px solid #222226", borderRadius: 12, padding: "18px 20px" },
  label: { color: "#666670", fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4, letterSpacing: "0.5px" },
  btn:   { border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
};

const SEMAFORO = {
  verde:    { color: "#22c55e", bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.3)",  label: "Saludable 🟢" },
  amarillo: { color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.3)", label: "En observación 🟡" },
  rojo:     { color: "#ef4444", bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.3)",  label: "Requiere acción 🔴" },
};

// ── Tooltip personalizado ─────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{
      background: "#1a1a20", border: "1px solid #2a2a32",
      borderRadius: 10, padding: "10px 14px", fontSize: 12,
      boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
    }}>
      <p style={{ color: "#f0f0f2", fontWeight: 700, marginBottom: 4 }}>
        {d.emoji} {d.label}
      </p>
      <p style={{ color: "#888", marginBottom: 4, lineHeight: 1.5 }}>{d.description}</p>
      <p style={{ color: "#38bdf8", fontFamily: "monospace" }}>
        Score: <strong style={{ color: "#fff" }}>{d.score}/100</strong>
      </p>
    </div>
  );
};

// ── Tarjeta de indicador ──────────────────────────────────────────────────────
const IndicatorCard = ({ ind }) => {
  const color = ind.score >= 70 ? "#22c55e" : ind.score >= 40 ? "#f59e0b" : "#ef4444";
  const icon  = ind.score >= 70 ? "✅" : ind.score >= 40 ? "⚠️" : "🔴";
  return (
    <div style={{
      background: "#0d0d10", border: "1px solid #1e1e24",
      borderRadius: 10, padding: "12px 14px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "#aaa", fontWeight: 600 }}>
          {ind.emoji} {ind.label}
        </span>
        <span style={{ fontSize: 10 }}>{icon}</span>
      </div>
      {/* Barra de progreso */}
      <div style={{ height: 4, background: "#1e1e24", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
        <div style={{
          height: "100%", width: `${ind.score}%`,
          background: color, borderRadius: 4,
          transition: "width 0.7s ease",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: color, fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>
          {ind.score}pts
        </span>
        <span style={{ color: "#444", fontSize: 11, fontFamily: "monospace" }}>
          {ind.value}{ind.unit} / meta {ind.key === "control_deuda" ? "<" : "≥"}{ind.target}{ind.unit}
        </span>
      </div>
    </div>
  );
};

// ── Componente principal ──────────────────────────────────────────────────────
export default function RadarSaludFinanciera({ period }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [collapsed,  setCollapsed]  = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const params = period ? `?period=${period}` : "";
      const res = await fetch(`/api/financial-health${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ ...s.card, textAlign: "center", padding: 36 }}>
      <p style={{ color: "#555", fontSize: 13 }}>⏳ Calculando radar de salud…</p>
    </div>
  );

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) return (
    <div style={{ ...s.card, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)", textAlign: "center", padding: 24 }}>
      <p style={{ color: "#ef4444", fontWeight: 700, marginBottom: 8 }}>⚠️ Error al cargar el radar</p>
      <p style={{ color: "#666", fontSize: 12, marginBottom: 14 }}>{error}</p>
      <button onClick={fetchData} style={{ ...s.btn, background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}>
        ↻ Reintentar
      </button>
    </div>
  );

  if (!data) return null;

  const sem = SEMAFORO[data.semaforo] || SEMAFORO.amarillo;

  // Datos para recharts
  const radarData = data.indicators.map((ind) => ({
    ...ind,
    fullMark: 100,
  }));

  return (
    <div style={{ ...s.card, background: `linear-gradient(135deg,${sem.bg},#111113)`, border: `1px solid ${sem.border}` }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ color: "#555560", fontSize: 11, fontWeight: 600, letterSpacing: "0.5px", marginBottom: 4 }}>
            📡 RADAR DE SALUD FINANCIERA · G-08
          </div>
          <div style={{ color: sem.color, fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px" }}>
            {data.score_global}
            <span style={{ color: "#444", fontSize: 16, fontWeight: 400 }}>/100</span>
          </div>
          <div style={{ color: sem.color, fontSize: 12, fontWeight: 600, marginTop: 2 }}>
            {sem.label}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#444", fontSize: 11 }}>{data.period_label}</span>
          <button
            onClick={fetchData}
            disabled={refreshing}
            style={{ ...s.btn, background: "#1a1a20", color: "#666", border: "1px solid #2a2a30", fontSize: 12, padding: "6px 12px" }}
          >
            {refreshing ? "⟳" : "↻"}
          </button>
          <button
            onClick={() => setCollapsed((v) => !v)}
            style={{ ...s.btn, background: "#1a1a20", color: "#666", border: "1px solid #2a2a30", fontSize: 12, padding: "6px 12px" }}
          >
            {collapsed ? "▼ Ver" : "▲ Ocultar"}
          </button>
        </div>
      </div>

      {/* Barra de score global */}
      <div style={{ height: 4, background: "#1a1a20", borderRadius: 4, overflow: "hidden", marginBottom: collapsed ? 0 : 20 }}>
        <div style={{
          height: "100%", width: `${data.score_global}%`,
          background: sem.color, borderRadius: 4,
          transition: "width 1s ease",
        }} />
      </div>

      {/* ── Contenido colapsable ── */}
      {!collapsed && (
        <>
          {/* Radar Chart */}
          <div style={{ height: 300, marginBottom: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid gridType="polygon" stroke="#2a2a32" strokeDasharray="3 3" />
                <PolarAngleAxis
                  dataKey="label"
                  tick={({ x, y, payload, index }) => {
                    const item = radarData[index];
                    return (
                      <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                        fill="#666670" fontSize={10} fontWeight={600}>
                        {item?.emoji} {payload.value.split(" ")[0]}
                      </text>
                    );
                  }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: "#444", fontSize: 9 }}
                  tickCount={4}
                  axisLine={false}
                />
                {/* Zona meta (70 pts) */}
                <Radar
                  name="Meta"
                  dataKey={() => 70}
                  stroke="#2a2a32"
                  fill="#1a1a20"
                  fillOpacity={0.4}
                  strokeDasharray="4 4"
                  isAnimationActive={false}
                />
                {/* Score real */}
                <Radar
                  name="Tu score"
                  dataKey="score"
                  stroke={sem.color}
                  fill={sem.color}
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
                <Tooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Leyenda */}
          <div style={{ display: "flex", gap: 16, marginBottom: 16, paddingLeft: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 20, borderTop: "1px dashed #2a2a32" }} />
              <span style={{ color: "#444", fontSize: 10 }}>Meta mínima (70pts)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: sem.color, opacity: 0.7 }} />
              <span style={{ color: "#444", fontSize: 10 }}>Tu desempeño</span>
            </div>
          </div>

          {/* Grid de indicadores */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {data.indicators.map((ind) => (
              <IndicatorCard key={ind.key} ind={ind} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
