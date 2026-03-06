/**
 * AlertasPanel.jsx — F-07 + OBS-09: Alertas Inteligentes con Cerrar/Archivar
 * OBS-09: Cada alerta tiene:
 *   [✕ Cerrar]   — descarta para la sesión; reaparece si la condición persiste al recargar
 *   [📥 Archivar] — marca como gestionada; pasa a historial consultable (localStorage)
 * Muestra contador de archivadas con enlace a panel de historial.
 */
import { useState, useEffect, useCallback } from "react";
import { Bell, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, X, Archive, RotateCcw } from "lucide-react";
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

const STORAGE_KEY = "finanzasvh_alertas_archivadas";

// ── Helpers localStorage ──────────────────────────────────────
const loadArchivadas = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
};
const saveArchivadas = (arr) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch {}
};

// Clave única por alerta — combina tipo + título + detalle truncado + métricas
// Garantiza que dos alertas del mismo tipo pero distinta transacción tengan claves distintas
const alertaKey = (a) => {
  const detalle  = (a.detalle  || "").slice(0, 80);
  const metrica  = a.metrica  !== undefined ? String(a.metrica)  : "";
  const promedio = a.promedio !== undefined ? String(a.promedio) : "";
  const cat      = a.categoria || a.titulo || "";
  return `${a.tipo}__${cat}__${metrica}__${promedio}__${detalle}`;
};

// ── Componente individual ─────────────────────────────────────
function AlertaCard({ alerta, onCerrar, onArchivar }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = TIPO_CONFIG[alerta.tipo] || TIPO_CONFIG.MONTO_INUSUAL;
  const sev = SEVERIDAD_CONFIG[alerta.severidad] || SEVERIDAD_CONFIG.baja;

  return (
    <div style={{
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: 8,
      padding: "10px 14px",
    }}>
      {/* Fila principal */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span
          style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.4, cursor: "pointer" }}
          onClick={() => setExpanded(e => !e)}
        >{alerta.icono}</span>

        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2, flexWrap: "wrap" }}>
            <span style={{ color: cfg.color, fontWeight: 700, fontSize: 12 }}>
              {alerta.titulo}
            </span>
            <span style={{
              background: `${sev.color}20`, color: sev.color,
              fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
              textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
            }}>{sev.label}</span>
          </div>

          {alerta.tipo === "TASA_AHORRO_BAJA" && (
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ color: "#555", fontSize: 11 }}>
                Actual: <b style={{ color: alerta.metrica < 5 ? "#ef4444" : "#f59e0b" }}>{alerta.metrica}%</b>
              </span>
              <span style={{ color: "#555", fontSize: 11 }}>
                Meta: <b style={{ color: "#22c55e" }}>≥ {alerta.meta}%</b>
              </span>
            </div>
          )}
          {alerta.tipo === "MONTO_INUSUAL" && (
            <div style={{ display: "flex", gap: 10 }}>
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
              color: "#888", fontSize: 12, margin: "8px 0 0", lineHeight: 1.6,
              padding: "8px 10px", background: "#0a0a0c", borderRadius: 6,
            }}>{alerta.detalle}</p>
          )}
        </div>

        {/* Acciones OBS-09 */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <span style={{ color: "#333", cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
          <button
            onClick={() => onArchivar(alerta)}
            title="Archivar — marcar como gestionada"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#555", padding: "2px 4px", borderRadius: 3,
              display: "flex", alignItems: "center",
            }}>
            <Archive size={12} />
          </button>
          <button
            onClick={() => onCerrar(alerta)}
            title="Cerrar — ocultar para esta sesión"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#444", padding: "2px 4px", borderRadius: 3,
              display: "flex", alignItems: "center",
            }}>
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Panel historial archivadas ────────────────────────────────
function HistorialPanel({ archivadas, onRestaurar, onLimpiar, onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "#0f0f12", border: "1px solid #1a1a20", borderRadius: 12,
        padding: "20px 24px", width: "100%", maxWidth: 560, maxHeight: "80vh",
        overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ color: "#888", fontWeight: 700, fontSize: 13 }}>📥 Alertas Archivadas ({archivadas.length})</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#444", cursor: "pointer" }}>
            <X size={15} />
          </button>
        </div>

        {archivadas.length === 0 && (
          <p style={{ color: "#333", fontSize: 12, textAlign: "center", padding: "20px 0" }}>
            No hay alertas archivadas.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {archivadas.map((a, i) => {
            const cfg = TIPO_CONFIG[a.tipo] || TIPO_CONFIG.MONTO_INUSUAL;
            return (
              <div key={i} style={{
                background: "#0a0a0c", border: `1px solid ${cfg.border}`,
                borderRadius: 7, padding: "10px 14px",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 16 }}>{a.icono}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ color: cfg.color, fontSize: 12, fontWeight: 600 }}>{a.titulo}</span>
                  {a.archivedAt && (
                    <p style={{ color: "#2a2a30", fontSize: 10, margin: "2px 0 0" }}>
                      Archivada: {new Date(a.archivedAt).toLocaleDateString("es-PE", { day:"2-digit", month:"short", year:"numeric" })}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onRestaurar(i)}
                  title="Restaurar alerta"
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "#333", padding: "2px 4px", display: "flex", alignItems: "center",
                  }}>
                  <RotateCcw size={12} />
                </button>
              </div>
            );
          })}
        </div>

        {archivadas.length > 0 && (
          <button
            onClick={onLimpiar}
            style={{
              marginTop: 16, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              color: "#ef4444", borderRadius: 6, padding: "6px 14px", fontSize: 11,
              cursor: "pointer", fontFamily: "inherit",
            }}>
            Limpiar historial completo
          </button>
        )}
      </div>
    </div>
  );
}

// ── Panel principal ───────────────────────────────────────────
export default function AlertasPanel({ period }) {
  const [data,            setData]            = useState(null);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState(null);
  const [collapsed,       setCollapsed]       = useState(false);
  // OBS-09: cerradas en sesión (no persistente)
  const [cerradas,        setCerradas]        = useState(new Set());
  // OBS-09: archivadas en localStorage
  const [archivadas,      setArchivadas]      = useState(loadArchivadas);
  const [showHistorial,   setShowHistorial]   = useState(false);

  const cargar = useCallback(async () => {
    if (!period) return;
    setLoading(true); setError(null);
    try {
      const res = await api.getAlertas(period);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Handlers OBS-09 ───────────────────────────────────────
  const handleCerrar = (alerta) => {
    setCerradas(prev => new Set([...prev, alertaKey(alerta)]));
  };

  const handleArchivar = (alerta) => {
    const nueva = { ...alerta, archivedAt: new Date().toISOString(), period };
    const updated = [...archivadas, nueva];
    setArchivadas(updated);
    saveArchivadas(updated);
    // También cierra en sesión para que desaparezca de la vista
    setCerradas(prev => new Set([...prev, alertaKey(alerta)]));
  };

  const handleRestaurar = (idx) => {
    const updated = archivadas.filter((_, i) => i !== idx);
    setArchivadas(updated);
    saveArchivadas(updated);
  };

  const handleLimpiarHistorial = () => {
    setArchivadas([]);
    saveArchivadas([]);
  };

  // ── Derivados ─────────────────────────────────────────────
  if (!data && !loading && !error) return null;

  const todasAlertas = data?.alertas ?? [];
  // Filtrar las cerradas en sesión
  const alertasArchivadas_keys = new Set(archivadas.map(a => alertaKey(a)));
  const alertasVisibles = todasAlertas.filter(a =>
    !cerradas.has(alertaKey(a)) && !alertasArchivadas_keys.has(alertaKey(a))
  );

  const total   = alertasVisibles.length;
  const porSev  = {
    alta:  alertasVisibles.filter(a => a.severidad === "alta").length,
    media: alertasVisibles.filter(a => a.severidad === "media").length,
    baja:  alertasVisibles.filter(a => a.severidad === "baja").length,
  };

  const headerColor = porSev.alta > 0 ? "#ef4444"
    : porSev.media > 0 ? "#f59e0b"
    : "#a78bfa";

  return (
    <>
      {showHistorial && (
        <HistorialPanel
          archivadas={archivadas}
          onRestaurar={handleRestaurar}
          onLimpiar={handleLimpiarHistorial}
          onClose={() => setShowHistorial(false)}
        />
      )}

      <div style={{ background: "#0f0f12", border: "1px solid #1a1a20", borderRadius: 12, padding: 0, overflow: "hidden" }}>
        {/* Header */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "11px 16px",
            background: total > 0 ? `${headerColor}08` : "#0f0f12",
            borderBottom: "1px solid #1a1a20", cursor: "pointer",
          }}
          onClick={() => setCollapsed(c => !c)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Bell size={13} color={total > 0 ? headerColor : "#333"} />
            <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: "0.5px", color: total > 0 ? headerColor : "#444" }}>
              ALERTAS INTELIGENTES
            </span>
            {loading && <RefreshCw size={11} color="#444" />}
            {!loading && total > 0 && (
              <div style={{ display: "flex", gap: 4 }}>
                {porSev.alta  > 0 && <span style={{ background: "#ef444420", color: "#ef4444", fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 10 }}>{porSev.alta} alta{porSev.alta > 1 ? "s" : ""}</span>}
                {porSev.media > 0 && <span style={{ background: "#f59e0b20", color: "#f59e0b", fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 10 }}>{porSev.media} media{porSev.media > 1 ? "s" : ""}</span>}
                {porSev.baja  > 0 && <span style={{ background: "#a78bfa20", color: "#a78bfa", fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 10 }}>{porSev.baja} baja{porSev.baja > 1 ? "s" : ""}</span>}
              </div>
            )}
            {!loading && total === 0 && !error && (
              <span style={{ color: "#22c55e", fontSize: 11 }}>✓ Sin alertas activas</span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {/* Contador archivadas — OBS-09 */}
            {archivadas.length > 0 && (
              <button
                onClick={e => { e.stopPropagation(); setShowHistorial(true); }}
                style={{
                  background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.2)",
                  color: "#38bdf8", fontSize: 10, fontWeight: 600, padding: "2px 8px",
                  borderRadius: 4, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                <Archive size={10} />
                {archivadas.length} archivada{archivadas.length > 1 ? "s" : ""}
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); cargar(); }}
              style={{ background: "transparent", border: "none", color: "#333", padding: "2px 4px", cursor: "pointer", display: "flex" }}
              title="Actualizar">
              <RefreshCw size={11} />
            </button>
            {collapsed ? <ChevronDown size={13} color="#444" /> : <ChevronUp size={13} color="#444" />}
          </div>
        </div>

        {/* Cuerpo */}
        {!collapsed && (
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 7 }}>
            {loading && (
              <div style={{ color: "#444", fontSize: 12, padding: "12px 0", textAlign: "center" }}>
                Analizando anomalías del período...
              </div>
            )}

            {error && (
              <div style={{ color: "#f87171", fontSize: 12, padding: "8px 12px", background: "rgba(248,113,113,0.06)", borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={12} /> Error al cargar alertas: {error}
              </div>
            )}

            {!loading && !error && total === 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <div>
                  <p style={{ margin: 0, color: "#22c55e", fontWeight: 600, fontSize: 13 }}>
                    Sin anomalías activas {cerradas.size > 0 ? `· ${cerradas.size} cerrada${cerradas.size > 1 ? "s" : ""} esta sesión` : ""}
                  </p>
                  <p style={{ margin: "2px 0 0", color: "#444", fontSize: 11 }}>
                    Base histórica: {data?.periodos_base?.length || 0} período{data?.periodos_base?.length !== 1 ? "s" : ""}.
                    {cerradas.size > 0 && (
                      <button
                        onClick={() => setCerradas(new Set())}
                        style={{ background: "none", border: "none", color: "#555", fontSize: 11, cursor: "pointer", textDecoration: "underline", padding: "0 4px", fontFamily: "inherit" }}>
                        Mostrar cerradas
                      </button>
                    )}
                  </p>
                </div>
              </div>
            )}

            {!loading && alertasVisibles.map((alerta, idx) => (
              <AlertaCard
                key={idx}
                alerta={alerta}
                onCerrar={handleCerrar}
                onArchivar={handleArchivar}
              />
            ))}

            {/* Nota base histórica */}
            {!loading && data?.periodos_base?.length > 0 && (
              <p style={{ color: "#222", fontSize: 10, margin: "2px 0 0", textAlign: "right" }}>
                Base: {data.periodos_base.join(" · ")}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
