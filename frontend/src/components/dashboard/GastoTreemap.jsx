/**
 * FinanzasOS v3.1 — GastoTreemap.jsx
 * G-01: Mapa de calor jerárquico de gastos por categoría y tipo.
 * Usa recharts Treemap con celdas personalizadas en tema oscuro.
 */
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { fmt } from "../../utils/format.js";

// ── Tooltip personalizado ─────────────────────────────────────
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d?.name) return null;
  return (
    <div style={{
      background: "#1a1a20", border: "1px solid #2a2a30",
      borderRadius: 8, padding: "8px 13px", fontSize: 11, color: "#ccc",
      pointerEvents: "none",
    }}>
      <p style={{ fontWeight: 700, color: "#f0f0f2", marginBottom: 3 }}>{d.name}</p>
      <p style={{ color: d.color || "#888" }}>
        {fmt(d.value)} — {d.pct}%
      </p>
      {d.typeName && (
        <p style={{ color: "#555", marginTop: 2, fontSize: 10 }}>{d.typeName}</p>
      )}
    </div>
  );
};

// ── Celda personalizada ───────────────────────────────────────
const CustomContent = ({ x, y, width, height, name, value, color, pct }) => {
  const tooSmall = width < 36 || height < 24;
  const verySmall = width < 60 || height < 36;

  return (
    <g>
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(width - 2, 0)}
        height={Math.max(height - 2, 0)}
        rx={6}
        style={{
          fill: color || "#1a1a20",
          fillOpacity: 0.18,
          stroke: color || "#2a2a30",
          strokeOpacity: 0.45,
          strokeWidth: 1,
        }}
      />
      {!tooSmall && (
        <>
          <text
            x={x + 10}
            y={y + (verySmall ? height / 2 : height / 2 - 8)}
            fill="#f0f0f2"
            fontSize={verySmall ? 10 : 12}
            fontWeight={600}
            fontFamily="'DM Mono','Courier New',monospace"
            dominantBaseline="middle"
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {name?.length > 18 ? name.slice(0, 16) + "…" : name}
          </text>
          {!verySmall && (
            <text
              x={x + 10}
              y={y + height / 2 + 10}
              fill={color || "#888"}
              fontSize={11}
              fontFamily="'DM Mono','Courier New',monospace"
              dominantBaseline="middle"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {fmt(value)} · {pct}%
            </text>
          )}
        </>
      )}
    </g>
  );
};

// ── TYPE labels ───────────────────────────────────────────────
const TYPE_NAME = {
  gasto_fijo:     "Gasto Fijo",
  gasto_variable: "Gasto Variable",
  deuda:          "Deuda / Cuota",
  ahorro:         "Ahorro",
};

// ── Componente principal ──────────────────────────────────────
export default function GastoTreemap({ catData = [] }) {
  // Filtrar solo categorías con monto > 0 (excluir ingresos)
  const filtered = catData.filter(d => d.amount > 0);
  if (filtered.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "#333", padding: "32px 0", fontSize: 13 }}>
        Sin datos de gastos para este período.
      </div>
    );
  }

  const total = filtered.reduce((s, d) => s + d.amount, 0);

  // Armar datos para recharts Treemap
  const data = filtered.map(d => ({
    name:     d.cat,
    value:    d.amount,
    color:    d.color,
    pct:      total > 0 ? ((d.amount / total) * 100).toFixed(1) : "0",
    typeName: TYPE_NAME[d.type] || d.type,
  }));

  // Resumen por tipo (leyenda inferior)
  const byType = {};
  filtered.forEach(d => {
    if (!byType[d.type]) byType[d.type] = { amount: 0, color: d.color };
    byType[d.type].amount += d.amount;
  });

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <Treemap
          data={data}
          dataKey="value"
          content={<CustomContent />}
          isAnimationActive={false}
        >
          <Tooltip content={<CustomTooltip />} />
        </Treemap>
      </ResponsiveContainer>

      {/* Leyenda por tipo */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
        {Object.entries(byType).map(([type, { amount, color }]) => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#555" }}>
            <div style={{ width: 9, height: 9, borderRadius: 2, background: color, opacity: 0.85 }} />
            <span>{TYPE_NAME[type] || type}:</span>
            <span style={{ color, fontWeight: 700 }}>{fmt(amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
