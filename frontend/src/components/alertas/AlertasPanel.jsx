/**
 * AlertasPanel.jsx — F-07: Alertas Inteligentes de Anomalías
 * Consumidor del endpoint GET /v3/analytics/alertas/{period}
 */
import { useState, useEffect } from "react";
import { Bell, AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../../api.js";

// ── Config visual por tipo de alerta ─────────────────────────
const TIPO_CONFIG = {
  TASA_AHORRO_BAJA:   { color: "#38bdf8", border: "rgba(56,189,248,0.25)",  bg: "rgba(56,189,248,0.06)"  },
  POSIBLE_DUPLICADO:  { color: "#f59e0b", border: "rgba(245,158,11,0.25)",  bg: "rgba(245,158,11,0.06)"  },
  MONTO_INUSUAL:      { color: "#f87171", border: "rgba(248,113,113,0.25)", bg: "rgba(248,113,113,0.06)" },
  RECURRENTE_AUSENTE: { color: "#a78bfa", border: "rgba(167,139,250,0.25)", bg: "rgba(167,139,250,0.06)" },
};

const SEVERIDAD_CONFIG = {
  alta:  { label: "Alta",  color: "#ef4444" },
  media: { label: "Media", color: "#f59e0b" },
  baja:  { label: "Baja",  color: "#a78bfa" },
};

const s = {
  card: {
    background: "#0f0f12",
    border: "1px solid #1a1a20",
    borderRadius: 12,
    padding: "16px 20px",
  },
  btn: {
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    padding: "6px 12px",
    fontSize: 12,
    fontFamily: "inherit",
  },
};

// ── Componente individual de alerta ──────────────────────────
function AlertaCard({ alerta }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = TIPO_CONFIG[alerta.tipo] || TIPO_CONFIG.MONTO_INUSUAL;
  const sev = SEVERIDAD_CONFIG[alerta.severidad] || SEVERIDAD_CONFIG.baja;

  return (
    <div style={{
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: 8,
      padding: "12px 16px",
    }}>
      <div
        style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.3 }}>{alerta.icono}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ color: cfg.color, fontWeight: 700, fontSize: 13 }}>
              {alerta.titulo}
            </span>
            <span style={{
              background: `${sev.color}20`,
              color: sev.color,
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 3,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              flexShrink: 0,
            }}>
              {sev.label}
            </span>
          </div>

          {alerta.tipo === "TASA_AHORRO_BAJA" && (
            <div style={{ display: "flex", gap: 12 }}>
              <span style={{ color: "#555", fontSize: 11 }}>
                Actual: <b style={{ color: alerta.metrica < 5 ? "#ef4444" : "#f59e0b" }}>{alerta.metrica}%</b>
              </span>
              <span style={{ color: "#555", fontSize: 11 }}>
                Meta: <b style={{ color: "#22c55e" }}>≥ {alerta.meta}%</b>
              </span>
            </div>
          )}
          {alerta.tipo === "MONTO_INUSUAL" && (
            <div style={{ display: "flex", gap: 12 }}>
              <span style={{ color: "#555", fontSize: 11 }}>
                Este mes: <b style={{ color: "#f87171" }}>S/ {alerta.metrica?.toFixed(2)}</b>
              </span>
              <span style={{ color: "#555", fontSize: 11 }}>
                Prom. hist.: <b style={{ color: "#888" }}>S/ {alerta.promedio?.toFixed(2)}</b>
              </span>
            </div>
          )}

          {expanded && (
            <p style={{
              color: "#888",
              fontSize: 12,
              margin: "8px 0 0",
              lineHeight: 1.6,
              padding: "10px 12px",
              background: "#0a0a0c",
              borderRadius: 6,
            }}>
              {alerta.detalle}
            </p>
          )}
        </div>

        <span style={{ color: "#333", flexShrink: 0 }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </div>
    </div>
  );
}

// ── Panel principal ───────────────────────────────────────────
export default function AlertasPanel({ period }) {
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const cargar = async () => {
    if (!period) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAlertas(period);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, [period]);

  if (!data && !loading && !error) return null;

  const total   = data?.total_alertas ?? 0;
  const alertas = data?.alertas ?? [];
  const porSev  = {
    alta:  alertas.filter(a => a.severidad === "alta").length,
    media: alertas.filter(a => a.severidad === "media").length,
    baja:  alertas.filter(a => a.severidad === "baja").length,
  };

  const headerColor = porSev.alta > 0 ? "#ef4444"
    : porSev.media > 0 ? "#f59e0b"
    : "#a78bfa";

  return (
    <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
      {/* Header clicable */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 18px",
          background: total > 0 ? `${headerColor}08` : "#0f0f12",
          borderBottom: "1px solid #1a1a20",
          cursor: "pointer",
        }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bell size={14} color={total > 0 ? headerColor : "#333"} />
          <span style={{
            fontWeight: 700, fontSize: 11, letterSpacing: "0.5px",
            color: total > 0 ? headerColor : "#444",
          }}>
            ALERTAS INTELIGENTES
          </span>
          {loading && <RefreshCw size={11} color="#444" />}
          {!loading && total > 0 && (
            <div style={{ display: "flex", gap: 5 }}>
              {porSev.alta  > 0 && <span style={{ background: "#ef444420", color: "#ef4444", fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 10 }}>{porSev.alta} alta{porSev.alta > 1 ? "s" : ""}</span>}
              {porSev.media > 0 && <span style={{ background: "#f59e0b20", color: "#f59e0b", fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 10 }}>{porSev.media} media{porSev.media > 1 ? "s" : ""}</span>}
              {porSev.baja  > 0 && <span style={{ background: "#a78bfa20", color: "#a78bfa", fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 10 }}>{porSev.baja} baja{porSev.baja > 1 ? "s" : ""}</span>}
            </div>
          )}
          {!loading && total === 0 && (
            <span style={{ color: "#22c55e", fontSize: 11 }}>✓ Sin anomalías</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={e => { e.stopPropagation(); cargar(); }}
            style={{ ...s.btn, background: "transparent", color: "#333", padding: "2px 5px" }}
            title="Actualizar"
          >
            <RefreshCw size={12} />
          </button>
          {collapsed ? <ChevronDown size={14} color="#444" /> : <ChevronUp size={14} color="#444" />}
        </div>
      </div>

      {/* Cuerpo */}
      {!collapsed && (
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          {loading && (
            <div style={{ color: "#444", fontSize: 12, padding: "12px 0", textAlign: "center" }}>
              Analizando anomalías del período...
            </div>
          )}

          {error && (
            <div style={{ color: "#f87171", fontSize: 12, padding: "8px 12px", background: "rgba(248,113,113,0.06)", borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={12} />
              Error al cargar alertas: {error}
            </div>
          )}

          {!loading && !error && total === 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
              <span style={{ fontSize: 22 }}>✅</span>
              <div>
                <p style={{ margin: 0, color: "#22c55e", fontWeight: 600, fontSize: 13 }}>Período sin anomalías detectadas</p>
                <p style={{ margin: "2px 0 0", color: "#444", fontSize: 11 }}>
                  Análisis basado en {data?.periodos_base?.length || 0} período{data?.periodos_base?.length !== 1 ? "s" : ""} histórico{data?.periodos_base?.length !== 1 ? "s" : ""}.
                </p>
              </div>
            </div>
          )}

          {!loading && alertas.map((alerta, idx) => (
            <AlertaCard key={idx} alerta={alerta} />
          ))}

          {!loading && data?.periodos_base?.length > 0 && (
            <p style={{ color: "#2a2a30", fontSize: 10, margin: "4px 0 0", textAlign: "right" }}>
              Base histórica: {data.periodos_base.join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
