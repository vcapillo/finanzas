/**
 * FinanzasVH — G-04: Gauge / Velocímetro de Tasa de Ahorro
 * SVG autocontenido (sin overflow), layout horizontal.
 * Semáforo: 🟢 ≥20% | 🟡 10-20% | 🔴 <10%
 */

const META_DEFAULT = 20;

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const s = polarToCartesian(cx, cy, r, startAngle);
  const e = polarToCartesian(cx, cy, r, endAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

function needlePath(cx, cy, r, angleDeg) {
  const tip   = polarToCartesian(cx, cy, r - 8, angleDeg);
  const base1 = polarToCartesian(cx, cy, 7, angleDeg + 90);
  const base2 = polarToCartesian(cx, cy, 7, angleDeg - 90);
  return `M ${base1.x} ${base1.y} L ${tip.x} ${tip.y} L ${base2.x} ${base2.y} Z`;
}

export default function GaugeAhorro({ tasaAhorro = 0, meta = META_DEFAULT, ingresos = 0, ahorros = 0 }) {
  // Radio pequeño para que quepa sin overflow
  // Pivote en cy=130, arco de r=78 → tope superior en cy-r=52
  // Con etiquetas en r+20=98 → tope etiquetas: 130-98=32 — margen 32px dentro del viewBox
  const W = 260, H = 140;
  const cx = 130, cy = 128, r = 78;

  const START = 180, END = 360, RANGE = 180;
  const MAX_VISUAL = 40;

  const clampedTasa   = Math.min(tasaAhorro, MAX_VISUAL);
  const needleAngle   = START + (clampedTasa / MAX_VISUAL) * RANGE;
  const metaAngle     = START + (meta        / MAX_VISUAL) * RANGE;
  const progressAngle = needleAngle;

  const color =
    tasaAhorro >= meta     ? "#22c55e" :
    tasaAhorro >= meta / 2 ? "#f59e0b" :
                             "#ef4444";
  const label =
    tasaAhorro >= meta     ? "Saludable" :
    tasaAhorro >= meta / 2 ? "En observación" :
                             "Requiere acción";
  const icon = tasaAhorro >= meta ? "🟢" : tasaAhorro >= meta / 2 ? "🟡" : "🔴";

  const metaMontos  = ingresos * meta / 100;
  const diff        = Math.abs(ahorros) - metaMontos;
  const diffPos     = diff >= 0;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 28,
      padding: "12px 8px 4px",
      flexWrap: "wrap",
    }}>

      {/* ── SVG gauge — sin overflow ── */}
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ flexShrink: 0 }}
      >
        {/* Track fondo */}
        <path d={arcPath(cx, cy, r, START, END)}
          fill="none" stroke="#1a1a20" strokeWidth={20} strokeLinecap="round"/>

        {/* Zonas de color de fondo */}
        <path d={arcPath(cx, cy, r, START, START + (10 / MAX_VISUAL) * RANGE)}
          fill="none" stroke="rgba(239,68,68,0.18)" strokeWidth={20}/>
        <path d={arcPath(cx, cy, r, START + (10 / MAX_VISUAL) * RANGE, metaAngle)}
          fill="none" stroke="rgba(245,158,11,0.18)" strokeWidth={20}/>
        <path d={arcPath(cx, cy, r, metaAngle, END)}
          fill="none" stroke="rgba(34,197,94,0.13)" strokeWidth={20}/>

        {/* Progreso coloreado */}
        {tasaAhorro > 0 && (
          <path d={arcPath(cx, cy, r, START, progressAngle)}
            fill="none" stroke={color} strokeWidth={20} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 5px ${color}55)` }}/>
        )}

        {/* Línea META */}
        {(() => {
          const inner = polarToCartesian(cx, cy, r - 14, metaAngle);
          const outer = polarToCartesian(cx, cy, r + 14, metaAngle);
          return <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
            stroke="#22c55e" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.7}/>;
        })()}

        {/* Etiquetas escala — dentro del viewBox */}
        {[0, 10, 20, 30, 40].map(pct => {
          const angle = START + (pct / MAX_VISUAL) * RANGE;
          const pos = polarToCartesian(cx, cy, r + 20, angle);
          return (
            <text key={pct} x={pos.x} y={pos.y}
              textAnchor="middle" dominantBaseline="middle"
              fill={pct === meta ? "#22c55e" : "#333"}
              fontSize={9} fontFamily="'DM Mono', monospace"
              fontWeight={pct === meta ? "700" : "400"}>
              {pct}%
            </text>
          );
        })}

        {/* Aguja */}
        <path d={needlePath(cx, cy, r, needleAngle)}
          fill={color} opacity={0.9}
          style={{ filter: `drop-shadow(0 1px 4px ${color}66)` }}/>

        {/* Pivot */}
        <circle cx={cx} cy={cy} r={8} fill="#111113" stroke={color} strokeWidth={2}/>
        <circle cx={cx} cy={cy} r={3.5} fill={color}/>

        {/* Valor % centrado — entre el arco y el pivote */}
        <text x={cx} y={cy - 26}
          textAnchor="middle" fill={color}
          fontSize={26} fontWeight="700" fontFamily="'DM Mono', monospace"
          style={{ filter: `drop-shadow(0 0 8px ${color}44)` }}>
          {tasaAhorro.toFixed(1)}%
        </text>

        <text x={cx} y={cy - 10}
          textAnchor="middle" fill="#3a3a44"
          fontSize={8} fontFamily="'DM Mono', monospace" letterSpacing="1">
          TASA DE AHORRO
        </text>
      </svg>

      {/* ── Panel derecho: badge + stats ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 195 }}>

        {/* Badge semáforo */}
        <div style={{
          background: `${color}10`,
          border: `1px solid ${color}30`,
          borderRadius: 10,
          padding: "10px 16px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 18, marginBottom: 3 }}>{icon}</div>
          <div style={{ color, fontSize: 13, fontWeight: 700 }}>{label}</div>
          <div style={{ color: "#444", fontSize: 10, marginTop: 2 }}>Meta: {meta}% de los ingresos</div>
        </div>

        {/* Tabla stats */}
        <div style={{ background: "#0a0a0c", border: "1px solid #1a1a20", borderRadius: 10, overflow: "hidden" }}>
          {[
            { label: "AHORRADO",        value: `S/ ${Math.abs(ahorros).toLocaleString("es-PE")}`,                                                         col: "#38bdf8" },
            { label: `META (${meta}%)`, value: `S/ ${metaMontos.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`,                                   col: "#22c55e" },
            { label: "DIFERENCIA",      value: `${diffPos ? "+" : ""}S/ ${Math.abs(diff).toLocaleString("es-PE", { maximumFractionDigits: 0 })}`,           col: diffPos ? "#22c55e" : "#ef4444" },
          ].map((item, i) => (
            <div key={item.label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 13px",
              borderBottom: i < 2 ? "1px solid #111113" : "none",
            }}>
              <span style={{ color: "#444", fontSize: 10, letterSpacing: "0.5px" }}>{item.label}</span>
              <span style={{ color: item.col, fontSize: 13, fontWeight: 700 }}>{item.value}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
