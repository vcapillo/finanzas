/**
 * FinanzasVH v3.1 — HeatmapSemanal.jsx
 * G-05: Intensidad de gastos por día de la semana y semana del mes.
 * Tema oscuro coherente con el sistema.
 */
import { useMemo, useState } from "react";
import { fmt } from "../../utils/format.js";
import { s } from "../../components/ui/shared.jsx";

const DIAS   = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIAS_L = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// Día JS (0=Dom) → índice Lun-first (0=Lun)
const jsToLun = (d) => (d + 6) % 7;

// Semana del mes (0-indexed) a partir de la fecha
const weekOfMonth = (dateStr) => {
  const d = new Date(dateStr + "T12:00:00");
  return Math.floor((d.getDate() - 1) / 7);
};

// Paleta de calor oscura: de apagado a rojo intenso
const heatColor = (ratio) => {
  if (ratio <= 0) return { bg: "#0f0f12", border: "#1a1a20" };
  if (ratio < 0.15) return { bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.15)" };
  if (ratio < 0.30) return { bg: "rgba(245,158,11,0.18)",  border: "rgba(245,158,11,0.30)" };
  if (ratio < 0.50) return { bg: "rgba(251,146,60,0.22)",  border: "rgba(251,146,60,0.38)" };
  if (ratio < 0.70) return { bg: "rgba(239,68,68,0.28)",   border: "rgba(239,68,68,0.45)"  };
  if (ratio < 0.85) return { bg: "rgba(239,68,68,0.40)",   border: "rgba(239,68,68,0.60)"  };
  return               { bg: "rgba(239,68,68,0.58)",   border: "rgba(239,68,68,0.80)"  };
};

const textColor = (ratio) => {
  if (ratio <= 0)   return "#2a2a30";
  if (ratio < 0.30) return "#666";
  if (ratio < 0.60) return "#aaa";
  return "#f0f0f2";
};

export default function HeatmapSemanal({ transactions = [], period }) {
  const [tooltip, setTooltip] = useState(null); // { week, day, x, y }
  const [modeView, setModeView] = useState("monto"); // "monto" | "cantidad"

  // ── Construcción de la grilla ─────────────────────────────
  const { grid, semanas, maxVal, totalesDia, totalesSem } = useMemo(() => {
    // Filtrar gastos del período (excluir ingresos e internos)
    const gastos = transactions.filter(
      t => t.type !== "ingreso" && !t.excluir_del_analisis && t.date
    );

    // grid[semana][dia] = { monto, cantidad, txs[] }
    const g = Array.from({ length: 5 }, () =>
      Array.from({ length: 7 }, () => ({ monto: 0, cantidad: 0, txs: [] }))
    );

    let maxSem = 0;
    gastos.forEach(t => {
      const d   = new Date(t.date + "T12:00:00");
      const dia = jsToLun(d.getDay());
      const sem = Math.min(weekOfMonth(t.date), 4);
      const amt = Math.abs(t.amount);
      g[sem][dia].monto    += amt;
      g[sem][dia].cantidad += 1;
      g[sem][dia].txs.push(t);
      if (sem > maxSem) maxSem = sem;
    });

    const numSems = maxSem + 1;

    // Determinar cuántas semanas tiene el mes del período
    let semsLabel = [];
    if (period) {
      const [y, m] = period.split("-").map(Number);
      const firstDay = new Date(y, m - 1, 1);
      const lastDay  = new Date(y, m, 0).getDate();
      for (let s = 0; s < 5; s++) {
        const start = s * 7 + 1;
        if (start > lastDay) break;
        const end = Math.min(start + 6, lastDay);
        semsLabel.push(`Sem ${s + 1} (${start}–${end})`);
      }
    } else {
      semsLabel = ["Sem 1","Sem 2","Sem 3","Sem 4","Sem 5"].slice(0, numSems);
    }

    // Máximo valor para normalización
    let maxV = 0;
    const td = Array(7).fill(0);
    const ts = Array(5).fill(0);
    g.forEach((sem, si) => sem.forEach((cell, di) => {
      const val = modeView === "monto" ? cell.monto : cell.cantidad;
      if (val > maxV) maxV = val;
      td[di] += cell.monto;
      ts[si] += cell.monto;
    }));

    return { grid: g, semanas: semsLabel, maxVal: maxV, totalesDia: td, totalesSem: ts };
  }, [transactions, period, modeView]);

  const numSems = semanas.length || 1;

  // ── Celda del heatmap ─────────────────────────────────────
  const Cell = ({ sem, dia }) => {
    const cell  = grid[sem]?.[dia] || { monto: 0, cantidad: 0, txs: [] };
    const val   = modeView === "monto" ? cell.monto : cell.cantidad;
    const ratio = maxVal > 0 ? val / maxVal : 0;
    const { bg, border } = heatColor(ratio);
    const tc    = textColor(ratio);

    return (
      <div
        onMouseEnter={(e) => {
          if (val > 0) setTooltip({ sem, dia, cell, rect: e.currentTarget.getBoundingClientRect() });
        }}
        onMouseLeave={() => setTooltip(null)}
        style={{
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 6,
          minHeight: 54,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          cursor: val > 0 ? "pointer" : "default",
          transition: "all 0.15s",
          padding: "4px 2px",
          position: "relative",
        }}
      >
        {val > 0 && (
          <>
            <span style={{ color: tc, fontSize: 10, fontWeight: 700, lineHeight: 1.3 }}>
              {modeView === "monto"
                ? val >= 1000 ? `S/${(val / 1000).toFixed(1)}k` : `S/${Math.round(val)}`
                : `${cell.cantidad} tx`}
            </span>
            {modeView === "monto" && cell.cantidad > 0 && (
              <span style={{ color: "#333", fontSize: 9, marginTop: 1 }}>
                {cell.cantidad} mov.
              </span>
            )}
          </>
        )}
      </div>
    );
  };

  // ── Tooltip flotante ──────────────────────────────────────
  const TooltipBox = () => {
    if (!tooltip || !tooltip.cell) return null;
    const { sem, dia, cell } = tooltip;
    const top3 = [...cell.txs]
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 3);
    return (
      <div style={{
        position: "fixed",
        top: (tooltip.rect?.bottom || 0) + 6,
        left: Math.min((tooltip.rect?.left || 0), window.innerWidth - 240),
        zIndex: 999,
        background: "#1a1a20",
        border: "1px solid #2a2a30",
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 11,
        color: "#ccc",
        minWidth: 210,
        pointerEvents: "none",
        boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
      }}>
        <p style={{ fontWeight: 700, color: "#f0f0f2", marginBottom: 5 }}>
          {DIAS_L[dia]} · {semanas[sem]}
        </p>
        <div style={{ display: "flex", gap: 14, marginBottom: 7 }}>
          <span>Total: <b style={{ color: "#ef4444" }}>{fmt(cell.monto)}</b></span>
          <span>Movs: <b style={{ color: "#f59e0b" }}>{cell.cantidad}</b></span>
        </div>
        {top3.length > 0 && (
          <>
            <p style={{ color: "#444", fontSize: 10, marginBottom: 4 }}>TOP MOVIMIENTOS</p>
            {top3.map((t, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", gap: 8,
                padding: "3px 0", borderTop: "1px solid #1e1e26", fontSize: 10,
              }}>
                <span style={{ color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
                  {t.description}
                </span>
                <span style={{ color: "#f87171", fontWeight: 700, flexShrink: 0 }}>
                  {fmt(Math.abs(t.amount))}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    );
  };

  // ── Leyenda de color ──────────────────────────────────────
  const Legend = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#444" }}>
      <span>Menor</span>
      {[0, 0.15, 0.35, 0.55, 0.75, 0.95].map((r, i) => {
        const { bg } = heatColor(r);
        return (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: 3,
            background: r === 0 ? "#1a1a20" : bg,
            border: "1px solid #2a2a30",
          }} />
        );
      })}
      <span>Mayor</span>
    </div>
  );

  const hasData = transactions.some(t => t.type !== "ingreso" && !t.excluir_del_analisis);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ color: "#f0f0f2", fontSize: 15, fontWeight: 700, margin: 0 }}>
            🔥 Intensidad de Gastos
          </h2>
          <p style={{ color: "#555", fontSize: 11, marginTop: 3, marginBottom: 0 }}>
            Distribución por día de la semana y semana del mes · Hover para detalle
          </p>
        </div>
        {/* Toggle monto / cantidad */}
        <div style={{ display: "flex", gap: 4, background: "#0a0a0c", borderRadius: 8, padding: 4 }}>
          {[["monto", "S/ Monto"], ["cantidad", "# Cantidad"]].map(([id, label]) => (
            <button key={id} onClick={() => setModeView(id)} style={{
              ...s.btn, padding: "5px 12px", fontSize: 11,
              background: modeView === id ? "#1a1a20" : "transparent",
              color: modeView === id ? "#f59e0b" : "#555",
              fontWeight: modeView === id ? 700 : 400,
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div style={{ ...s.card, textAlign: "center", color: "#333", padding: 40 }}>
          Sin gastos registrados para este período.
        </div>
      ) : (
        <div style={s.card}>
          {/* Grilla */}
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 420 }}>

              {/* Cabeceras de semanas */}
              <div style={{
                display: "grid",
                gridTemplateColumns: `64px repeat(${numSems}, 1fr)`,
                gap: 5,
                marginBottom: 5,
              }}>
                <div />
                {semanas.map((label, si) => (
                  <div key={si} style={{
                    textAlign: "center", color: "#444", fontSize: 9,
                    fontWeight: 600, letterSpacing: "0.4px", padding: "2px 0",
                  }}>
                    {label}
                  </div>
                ))}
              </div>

              {/* Filas de días */}
              {DIAS.map((dia, di) => (
                <div key={di} style={{
                  display: "grid",
                  gridTemplateColumns: `64px repeat(${numSems}, 1fr)`,
                  gap: 5,
                  marginBottom: 5,
                }}>
                  {/* Etiqueta día */}
                  <div style={{
                    display: "flex", flexDirection: "column",
                    justifyContent: "center", paddingRight: 8,
                  }}>
                    <span style={{ color: "#555", fontSize: 11, fontWeight: 600 }}>{dia}</span>
                    {totalesDia[di] > 0 && (
                      <span style={{ color: "#2a2a30", fontSize: 9 }}>
                        {fmt(totalesDia[di])}
                      </span>
                    )}
                  </div>
                  {/* Celdas de semanas */}
                  {semanas.map((_, si) => (
                    <Cell key={si} sem={si} dia={di} />
                  ))}
                </div>
              ))}

              {/* Fila de totales por semana */}
              <div style={{
                display: "grid",
                gridTemplateColumns: `64px repeat(${numSems}, 1fr)`,
                gap: 5,
                marginTop: 4,
                borderTop: "1px solid #1a1a20",
                paddingTop: 8,
              }}>
                <div style={{ color: "#333", fontSize: 9, fontWeight: 600, letterSpacing: "0.4px", display: "flex", alignItems: "center" }}>
                  TOTAL
                </div>
                {semanas.map((_, si) => (
                  <div key={si} style={{ textAlign: "center", color: "#444", fontSize: 10, fontWeight: 600 }}>
                    {totalesSem[si] > 0 ? fmt(totalesSem[si]) : "—"}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Leyenda */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, flexWrap: "wrap", gap: 8 }}>
            <Legend />
            <span style={{ color: "#2a2a30", fontSize: 10 }}>
              Solo gastos · excluye ingresos y transferencias internas
            </span>
          </div>
        </div>
      )}

      {/* Resumen por día de la semana */}
      {hasData && (
        <div style={s.card}>
          <p style={{ color: "#555", fontSize: 11, fontWeight: 600, margin: "0 0 12px", letterSpacing: "0.5px" }}>
            PROMEDIO POR DÍA DE LA SEMANA
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DIAS.map((dia, di) => {
              const total   = totalesDia[di];
              const semsCon = semanas.filter((_, si) => grid[si]?.[di]?.monto > 0).length;
              const prom    = semsCon > 0 ? total / semsCon : 0;
              const maxDia  = Math.max(...totalesDia);
              const ratio   = maxDia > 0 ? total / maxDia : 0;
              const { bg }  = heatColor(ratio);
              return (
                <div key={di} style={{
                  flex: 1, minWidth: 70, background: bg,
                  border: "1px solid #1a1a20", borderRadius: 8,
                  padding: "10px 8px", textAlign: "center",
                }}>
                  <div style={{ color: "#888", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{dia}</div>
                  <div style={{ color: total > 0 ? "#f87171" : "#2a2a30", fontSize: 12, fontWeight: 700 }}>
                    {total > 0 ? fmt(total) : "—"}
                  </div>
                  {prom > 0 && (
                    <div style={{ color: "#444", fontSize: 9, marginTop: 2 }}>
                      ~{fmt(prom)}/sem
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tooltip && <TooltipBox />}
    </div>
  );
}
