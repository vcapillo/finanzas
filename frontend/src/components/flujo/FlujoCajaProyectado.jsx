/**
 * FinanzasOS v3.1 — FlujoCajaProyectado.jsx
 * F-05: Análisis de Flujo de Caja Proyectado
 * Estilo coherente con el tema oscuro del sistema.
 */
import { useState, useEffect, useCallback } from "react";
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { RefreshCw } from "lucide-react";
import { api } from "../../api.js";
import { fmt } from "../../utils/format.js";
import { s } from "../../components/ui/shared.jsx";

// ─── PALETA (mismos tonos que el resto del sistema) ──────────
const C = {
  ingreso:   "#22c55e",
  egreso:    "#ef4444",
  saldoPos:  "#38bdf8",
  saldoNeg:  "#f59e0b",
  grid:      "#1a1a20",
  textMuted: "#555560",
  textSub:   "#888",
  bg:        "#0f0f12",
  border:    "#1a1a20",
};

const TIPO_BADGE = {
  real:       { label: "Real",       bg: "rgba(56,189,248,0.1)",   color: "#38bdf8",  border: "rgba(56,189,248,0.2)"  },
  proyectado: { label: "Proyectado", bg: "rgba(100,100,110,0.12)", color: "#888",     border: "rgba(100,100,110,0.2)" },
  en_curso:   { label: "En curso",   bg: "rgba(167,139,250,0.1)",  color: "#a78bfa",  border: "rgba(167,139,250,0.2)" },
};

// ─── TOOLTIP ─────────────────────────────────────────────────
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d?.tooltip) return null;
  return (
    <div style={{
      background: "#1a1a20", border: "1px solid #2a2a30", borderRadius: 8,
      padding: "8px 12px", fontSize: 11, color: "#ccc", maxWidth: 240,
    }}>
      <p style={{ fontWeight: 700, marginBottom: 3, color: "#f0f0f2" }}>{d.name}</p>
      <p style={{ opacity: 0.8 }}>{d.tooltip}</p>
    </div>
  );
};

// ─── KPI CARD ─────────────────────────────────────────────────
const KPICard = ({ label, value, sub, color = "#f0f0f2", icon }) => (
  <div style={{ ...s.card, display: "flex", flexDirection: "column", gap: 5 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: C.textMuted, fontSize: 11 }}>{label}</span>
      {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
    </div>
    <div style={{ color, fontSize: 20, fontWeight: 700 }}>{value}</div>
    {sub && <div style={{ color: C.textSub, fontSize: 11 }}>{sub}</div>}
  </div>
);

// ─── TABLA DE SEMANAS ─────────────────────────────────────────
const TablaSemanas = ({ semanas }) => (
  <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ color: C.textMuted, fontSize: 11 }}>
          {["Semana","Ingresos","G. Fijo","G. Variable","Deuda","Saldo cierre","Tipo"].map(h => (
            <th key={h} style={{
              padding: "8px 12px", fontWeight: 600, letterSpacing: "0.4px",
              textAlign: h === "Semana" || h === "Tipo" ? "left" : "right",
              borderBottom: `1px solid ${C.border}`,
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {semanas.map((sem) => {
          const badge = TIPO_BADGE[sem.tipo] || TIPO_BADGE.proyectado;
          return (
            <tr key={sem.semana} style={{
              background: sem.es_negativo ? "rgba(239,68,68,0.05)" : "transparent",
              borderTop: `1px solid ${C.border}`,
            }}>
              <td style={{ padding: "9px 12px", color: "#d0d0d8", fontWeight: 500 }}>{sem.label}</td>
              <td style={{ padding: "9px 12px", textAlign: "right", color: "#22c55e", fontWeight: 600 }}>
                {sem.ingresos > 0 ? `+${fmt(sem.ingresos)}` : "—"}
              </td>
              <td style={{ padding: "9px 12px", textAlign: "right", color: "#f59e0b" }}>
                {sem.gastos_fijos > 0 ? `-${fmt(sem.gastos_fijos)}` : "—"}
              </td>
              <td style={{ padding: "9px 12px", textAlign: "right", color: "#ef4444" }}>
                {sem.gastos_variables > 0 ? `-${fmt(sem.gastos_variables)}` : "—"}
              </td>
              <td style={{ padding: "9px 12px", textAlign: "right", color: "#a78bfa" }}>
                {sem.deuda > 0 ? `-${fmt(sem.deuda)}` : "—"}
              </td>
              <td style={{
                padding: "9px 12px", textAlign: "right", fontWeight: 700,
                color: sem.es_negativo ? "#ef4444" : "#38bdf8",
              }}>
                {fmt(sem.saldo_fin)}{sem.es_negativo ? " ⚠️" : ""}
              </td>
              <td style={{ padding: "9px 12px" }}>
                <span style={{
                  background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
                  borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700,
                }}>
                  {badge.label}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────
export default function FlujoCajaProyectado({ period }) {
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [saldoInput,   setSaldoInput]   = useState("0");
  const [viewMode,     setViewMode]     = useState("grafico");

  const cargar = useCallback(async (saldo) => {
    if (!period) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getFlujoCaja(period, saldo ?? saldoInicial);
      setData(res);
    } catch (err) {
      setError(err.message || "Error al cargar el flujo de caja");
    } finally {
      setLoading(false);
    }
  }, [period, saldoInicial]);

  useEffect(() => {
    setSaldoInicial(0);
    setSaldoInput("0");
    cargar(0);
  }, [period]);

  const handleRecalcular = () => {
    const val = parseFloat(saldoInput.replace(",", ".")) || 0;
    setSaldoInicial(val);
    cargar(val);
  };

  // ── Waterfall data para recharts ───────────────────────────
  const buildWaterfall = () => {
    if (!data?.waterfall) return [];
    return data.waterfall.map((w) => {
      if (w.tipo === "saldo") {
        return {
          ...w,
          displaySaldo: w.saldo,
          barColor: (w.saldo ?? 0) < 0 ? C.saldoNeg : C.saldoPos,
        };
      }
      const base = w.base ?? 0;
      const val  = w.valor ?? 0;
      return {
        ...w,
        displayBase:  Math.min(base, base + val),
        displayValor: Math.abs(val),
        barColor:     w.tipo === "ingreso" ? C.ingreso : C.egreso,
      };
    });
  };

  const wfData = buildWaterfall();

  // ── Semáforo tasa de ahorro ────────────────────────────────
  const tasa    = data?.resumen?.tasa_ahorro_pct ?? 0;
  const tasaCol = tasa >= 20 ? "#22c55e" : tasa >= 10 ? "#f59e0b" : "#ef4444";
  const tasaSub = tasa >= 20 ? "🟢 Meta alcanzada (≥20%)" : tasa >= 10 ? "🟡 En observación (10–20%)" : "🔴 Por debajo del mínimo (<10%)";

  const cierreCol = (data?.resumen?.saldo_cierre ?? 0) >= 0 ? "#38bdf8" : "#ef4444";
  const cierreSub = (data?.resumen?.saldo_cierre ?? 0) < 0 ? "⚠️ Déficit proyectado" : "Disponible al cierre del mes";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Header ───────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#f0f0f2", fontSize: 16, fontWeight: 700, margin: 0 }}>
            💧 Flujo de Caja Proyectado
          </h2>
          <p style={{ color: C.textMuted, fontSize: 12, marginTop: 4, marginBottom: 0 }}>
            Proyección semanal · Semanas pasadas con datos reales · Semanas futuras estimadas
          </p>
        </div>

        {/* Toggle Gráfico / Tabla */}
        <div style={{ display: "flex", gap: 4, background: "#0a0a0c", borderRadius: 8, padding: 4 }}>
          {[["grafico","📊 Gráfico"],["tabla","📋 Tabla"]].map(([id, label]) => (
            <button key={id} onClick={() => setViewMode(id)} style={{
              ...s.btn,
              padding: "6px 14px", fontSize: 12,
              background: viewMode === id ? "#1a1a20" : "transparent",
              color: viewMode === id ? "#38bdf8" : C.textMuted,
              fontWeight: viewMode === id ? 700 : 400,
              boxShadow: viewMode === id ? "0 1px 3px rgba(0,0,0,0.4)" : "none",
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Saldo inicial ─────────────────────────────────── */}
      <div style={{
        ...s.card,
        background: "rgba(56,189,248,0.05)",
        border: "1px solid rgba(56,189,248,0.15)",
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16,
      }}>
        <div style={{ flex: 1 }}>
          <p style={{ color: "#38bdf8", fontWeight: 700, fontSize: 12, marginBottom: 3 }}>
            Saldo disponible al inicio del mes (S/)
          </p>
          <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
            Configura el saldo inicial para una proyección más precisa. Presiona Enter o "Recalcular".
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="number"
            value={saldoInput}
            onChange={(e) => setSaldoInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRecalcular()}
            style={{ ...s.input, width: 130, textAlign: "right" }}
            placeholder="0.00"
            min="0"
          />
          <button
            onClick={handleRecalcular}
            style={{ ...s.btn, background: "#38bdf8", color: "#0a0a0c", display: "flex", alignItems: "center", gap: 6 }}
          >
            <RefreshCw size={13} />
            Recalcular
          </button>
        </div>
      </div>

      {/* ── Loading / Error ───────────────────────────────── */}
      {loading && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 48, color: C.textMuted, gap: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid #38bdf8", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
          Calculando proyección...
        </div>
      )}
      {error && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "12px 16px", color: "#ef4444", fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {data && !loading && (<>

        {/* ── KPIs ─────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
          <KPICard label="Ingreso proyectado"  value={fmt(data.resumen.ingreso_total)} sub="Total del mes" color="#22c55e" icon="💰" />
          <KPICard label="Egreso proyectado"   value={fmt(data.resumen.egreso_total)}  sub="Fijos + Variables + Deuda" color="#ef4444" icon="📤" />
          <KPICard label="Saldo de cierre"     value={fmt(data.resumen.saldo_cierre)}  sub={cierreSub} color={cierreCol} icon="🏁" />
          <KPICard label="Tasa de ahorro"      value={`${data.resumen.tasa_ahorro_pct}%`} sub={tasaSub} color={tasaCol} icon="📊" />
        </div>

        {/* ── Alertas ──────────────────────────────────────── */}
        {data.alertas?.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.alertas.map((a, i) => {
              const isRed = a.nivel === "🔴";
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  background: isRed ? "rgba(239,68,68,0.07)" : "rgba(245,158,11,0.07)",
                  border: `1px solid ${isRed ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)"}`,
                  borderRadius: 8, padding: "10px 14px", fontSize: 12,
                  color: isRed ? "#ef4444" : "#f59e0b",
                }}>
                  <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.4 }}>{a.nivel}</span>
                  <span>{a.mensaje}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Gráfico waterfall ─────────────────────────────── */}
        {viewMode === "grafico" && (
          <div style={s.card}>
            <p style={{ color: "#888", fontSize: 12, marginBottom: 16 }}>
              Cascada de flujo de caja mensual — barras en verde=ingreso · rojo=egreso · azul/naranja=saldo acumulado
            </p>
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={wfData} margin={{ top: 10, right: 10, left: 5, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: C.textMuted }}
                  angle={-35}
                  textAnchor="end"
                  height={72}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: C.textMuted }}
                  tickFormatter={(v) => `S/${(v / 1000).toFixed(1)}k`}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <ReferenceLine y={0} stroke="#2a2a30" strokeWidth={1.5} />

                {/* Barras de saldo (puntos de control) */}
                <Bar dataKey="displaySaldo" radius={[4, 4, 0, 0]}>
                  {wfData.map((entry, i) => (
                    <Cell
                      key={`s-${i}`}
                      fill={entry.tipo === "saldo" ? entry.barColor : "transparent"}
                      fillOpacity={entry.tipo === "saldo" ? 0.85 : 0}
                    />
                  ))}
                </Bar>

                {/* Base transparente para flotar las barras de movimiento */}
                <Bar dataKey="displayBase" stackId="wf" fill="transparent" />
                <Bar dataKey="displayValor" stackId="wf" radius={[4, 4, 0, 0]}>
                  {wfData.map((entry, i) => (
                    <Cell
                      key={`m-${i}`}
                      fill={entry.tipo !== "saldo" ? entry.barColor : "transparent"}
                      fillOpacity={entry.tipo !== "saldo" ? 0.8 : 0}
                    />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>

            {/* Leyenda */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", marginTop: 8 }}>
              {[
                { color: C.ingreso,   label: "Ingreso" },
                { color: C.egreso,    label: "Egreso"  },
                { color: C.saldoPos,  label: "Saldo +"  },
                { color: C.saldoNeg,  label: "Saldo −"  },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textMuted }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tabla de semanas ──────────────────────────────── */}
        {viewMode === "tabla" && (
          <div style={s.card}>
            <p style={{ color: "#888", fontSize: 12, marginBottom: 12 }}>Detalle por semana</p>
            <TablaSemanas semanas={data.semanas} />
          </div>
        )}

        {/* ── Info de proyección ────────────────────────────── */}
        <div style={{
          ...s.card, background: "#0a0a0c",
          display: "flex", flexWrap: "wrap", gap: 20, fontSize: 11, color: C.textMuted,
        }}>
          <span>📅 <b style={{ color: "#555" }}>Histórico:</b> {data.meta?.periodos_hist?.join(", ") || "—"}</span>
          <span>🛒 <b style={{ color: "#555" }}>Var. estimada/sem:</b> {fmt(data.meta?.avg_var_semanal || 0)}</span>
          <span>🔧 <b style={{ color: "#555" }}>Fijo estimado/sem:</b> {fmt(data.meta?.avg_fijo_semanal || 0)}</span>
          <span>⚠️ <b style={{ color: "#555" }}>Semanas negativas:</b> {data.resumen.semanas_negativas} de {data.resumen.num_semanas}</span>
        </div>

      </>)}
    </div>
  );
}
