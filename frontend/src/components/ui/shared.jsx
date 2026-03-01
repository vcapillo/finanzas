/**
 * FinanzasVH — components/ui/shared.jsx
 * Estilos base, Chip de tipo, tarjeta Metric y Tooltips de gráficos.
 */
import { TYPE_CONFIG } from "../../constants/types.js";
import { fmtN } from "../../utils/format.js";

// ── Estilos base coherentes con el tema oscuro ────────────────
export const s = {
  card:   { background: "#111113", border: "1px solid #222226", borderRadius: 12, padding: "18px 20px" },
  input:  { width: "100%", background: "#0a0a0c", border: "1px solid #2a2a30", color: "#f0f0f2", borderRadius: 8, padding: "8px 12px", fontSize: 13, boxSizing: "border-box", outline: "none" },
  select: { width: "100%", background: "#0a0a0c", border: "1px solid #2a2a30", color: "#f0f0f2", borderRadius: 8, padding: "8px 12px", fontSize: 13, boxSizing: "border-box", cursor: "pointer" },
  btn:    { border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  label:  { color: "#666670", fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4, letterSpacing: "0.5px" },
};

// ── Chip de tipo de movimiento ────────────────────────────────
export const Chip = ({ type }) => {
  const c = TYPE_CONFIG[type];
  return (
    <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
      {c.label}
    </span>
  );
};

// ── Tarjeta de métrica ────────────────────────────────────────
export const Metric = ({ label, value, sub, color = "#f0f0f2", icon }) => (
  <div style={{ ...s.card, display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: "#555560", fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 18 }}>{icon}</span>
    </div>
    <div style={{ color, fontSize: 20, fontWeight: 700 }}>{value}</div>
    {sub && <div style={{ color: "#44444e", fontSize: 11 }}>{sub}</div>}
  </div>
);

// ── Tooltip genérico (moneda S/) ──────────────────────────────
export const TTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 16px", boxShadow: "0 4px 20px rgba(0,0,0,0.35)", minWidth: 140 }}>
      {label && <p style={{ color: "#475569", fontSize: 11, fontWeight: 600, margin: "0 0 6px", letterSpacing: "0.3px" }}>{label}</p>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: i > 0 ? 4 : 0 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color || "#64748b", display: "inline-block", flexShrink: 0 }} />
          <span style={{ color: "#334155", fontSize: 12 }}>{p.name}:</span>
          <span style={{ color: "#0f172a", fontSize: 13, fontWeight: 700, marginLeft: "auto", paddingLeft: 8 }}>
            {typeof p.value === "number" ? fmtN(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── Tooltip para gráficos en USD (inversiones) ────────────────
export const TTipUSD = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 16px", boxShadow: "0 4px 20px rgba(0,0,0,0.35)", minWidth: 150 }}>
      {label && <p style={{ color: "#475569", fontSize: 11, fontWeight: 600, margin: "0 0 6px" }}>{label}</p>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: i > 0 ? 4 : 0 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color || "#64748b", display: "inline-block", flexShrink: 0 }} />
          <span style={{ color: "#334155", fontSize: 12 }}>{p.name}:</span>
          <span style={{ color: "#0f172a", fontSize: 13, fontWeight: 700, marginLeft: "auto", paddingLeft: 8 }}>
            {typeof p.value === "number" ? `$${p.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};
