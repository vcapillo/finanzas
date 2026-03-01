/**
 * FinanzasVH v3.1 — ResumenMensualPanel.jsx
 * F-03: Resumen Mensual de Salud Financiera con IA (Gemini)
 *
 * Muestra el diagnóstico narrativo generado por Gemini para el período activo.
 * Permite regenerar el resumen manualmente desde el panel.
 */
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Brain, AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../../api.js";
import { fmt } from "../../utils/format.js";

// ── Helpers ──────────────────────────────────────────────────

const SEMAFORO = {
  verde:    { emoji: "🟢", color: "#22c55e", bg: "rgba(34,197,94,0.08)",  border: "rgba(34,197,94,0.25)",  label: "Saludable"     },
  amarillo: { emoji: "🟡", color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", label: "En observación" },
  rojo:     { emoji: "🔴", color: "#ef4444", bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.25)",  label: "Requiere acción" },
};

const PERIOD_LABEL = (p) =>
  p
    ? `${["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][parseInt(p.split("-")[1])]} ${p.split("-")[0].slice(-2)}`
    : "";

const FUENTE_LABEL = (fuente) => {
  if (!fuente) return "";
  if (fuente.startsWith("GEMINI_ALT"))   return "🔑 Generado con key alternativa";
  if (fuente.startsWith("GEMINI"))       return "🤖 Generado con Gemini IA";
  if (fuente === "LOCAL_FALLBACK")       return "⚙️ Generado localmente (Gemini sin cuota)";
  return fuente;
};

const cardStyle = {
  background:   "#0f0f12",
  border:       "1px solid #1a1a20",
  borderRadius: 10,
  padding:      "14px 16px",
};

const labelStyle = {
  color:        "#444",
  fontSize:     10,
  fontWeight:   700,
  letterSpacing: "0.5px",
  textTransform: "uppercase",
  marginBottom: 6,
  display:      "block",
};

// ── Componente principal ──────────────────────────────────────

export default function ResumenMensualPanel({ period }) {
  const [resumen,       setResumen]       = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [generating,    setGenerating]    = useState(false);
  const [error,         setError]         = useState(null);
  const [expandedRecs,  setExpandedRecs]  = useState(true);
  const [expandedCats,  setExpandedCats]  = useState(false);

  // Cargar resumen guardado al montar o cambiar período
  const cargarResumen = useCallback(async () => {
    if (!period) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getResumen(period);
      setResumen(data.existe ? data : null);
    } catch (e) {
      setError("No se pudo cargar el resumen: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { cargarResumen(); }, [cargarResumen]);

  // Generar resumen con Gemini
  const generarResumen = async () => {
    setGenerating(true);
    setError(null);
    try {
      const data = await api.generarResumen(period);
      if (data.error) {
        setError(data.mensaje || "Error al generar el resumen.");
        setResumen(null);
      } else {
        setResumen({
          existe:      true,
          periodo:     period,
          semaforo:    data.semaforo,
          fuente:      data._meta?.fuente,
          generado_en: data._meta?.generado_en,
          contenido:   data,
        });
      }
    } catch (e) {
      setError("Error generando resumen: " + e.message);
    } finally {
      setGenerating(false);
    }
  };

  // ── Render ────────────────────────────────────────────────
  const c = resumen?.contenido || {};
  const sem = SEMAFORO[resumen?.semaforo] || SEMAFORO.amarillo;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Header del panel */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Brain size={16} color="#a78bfa" />
          <span style={{ color: "#d0d0d8", fontWeight: 700, fontSize: 14 }}>
            Resumen IA — {PERIOD_LABEL(period)}
          </span>
        </div>
        <button
          onClick={generarResumen}
          disabled={generating}
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          6,
            background:   generating ? "#1a1a20" : "rgba(167,139,250,0.12)",
            border:       "1px solid rgba(167,139,250,0.3)",
            borderRadius: 7,
            color:        generating ? "#555" : "#a78bfa",
            cursor:       generating ? "not-allowed" : "pointer",
            fontSize:     12,
            fontWeight:   600,
            padding:      "6px 14px",
          }}
        >
          <RefreshCw size={13} style={{ animation: generating ? "spin 1s linear infinite" : "none" }} />
          {generating ? "Generando con Gemini..." : resumen ? "Regenerar" : "Generar Resumen IA"}
        </button>
      </div>

      {/* Spinner de carga */}
      {loading && (
        <div style={{ ...cardStyle, textAlign: "center", padding: 32 }}>
          <p style={{ color: "#555", fontSize: 13 }}>Cargando resumen...</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{ ...cardStyle, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={14} color="#ef4444" />
            <span style={{ color: "#ef4444", fontSize: 13 }}>{error}</span>
          </div>
        </div>
      )}

      {/* Sin resumen aún */}
      {!loading && !resumen && !error && (
        <div style={{ ...cardStyle, textAlign: "center", padding: "32px 20px" }}>
          <Brain size={32} color="#2a2a35" style={{ marginBottom: 12 }} />
          <p style={{ color: "#444", fontSize: 13, marginBottom: 8 }}>
            Aún no hay resumen generado para {PERIOD_LABEL(period)}.
          </p>
          <p style={{ color: "#333", fontSize: 11, marginBottom: 16 }}>
            Haz clic en <strong style={{ color: "#a78bfa" }}>Generar Resumen IA</strong> para que
            Gemini analice tus datos del mes y entregue un diagnóstico personalizado.
          </p>
          <p style={{ color: "#2a2a35", fontSize: 10 }}>
            También se genera automáticamente el último día de cada mes a las 23:30 Lima.
          </p>
        </div>
      )}

      {/* Resumen disponible */}
      {resumen && !loading && (
        <>
          {/* Semáforo + Resumen ejecutivo */}
          <div style={{
            ...cardStyle,
            background: sem.bg,
            border:     `1px solid ${sem.border}`,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <span style={{ fontSize: 28, flexShrink: 0 }}>{sem.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: sem.color, fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                  {sem.label} · {PERIOD_LABEL(period)}
                </div>
                <p style={{ color: "#888", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                  {c.resumen_ejecutivo || "Sin resumen ejecutivo."}
                </p>
              </div>
            </div>
          </div>

          {/* KPIs principales */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {[
              { label: "Tasa de Ahorro",   value: `${(c.tasa_ahorro_pct || 0).toFixed(1)}%`,        color: c.tasa_ahorro_pct >= 20 ? "#22c55e" : c.tasa_ahorro_pct >= 10 ? "#f59e0b" : "#ef4444", meta: "Meta: 20%" },
              { label: "Ratio Deuda",       value: `${(c.ratio_deuda_ingreso_pct || 0).toFixed(1)}%`, color: c.ratio_deuda_ingreso_pct <= 20 ? "#22c55e" : c.ratio_deuda_ingreso_pct <= 30 ? "#f59e0b" : "#ef4444", meta: "Límite: 30%" },
              { label: "Saldo Neto",        value: `S/ ${(c.saldo_neto || 0).toLocaleString("es-PE", { minimumFractionDigits: 0 })}`, color: c.saldo_neto >= 0 ? "#22c55e" : "#ef4444", meta: c.saldo_neto >= 0 ? "Positivo ✓" : "Negativo ⚠️" },
            ].map(item => (
              <div key={item.label} style={cardStyle}>
                <span style={labelStyle}>{item.label}</span>
                <div style={{ color: item.color, fontSize: 20, fontWeight: 700 }}>{item.value}</div>
                <div style={{ color: "#333", fontSize: 10, marginTop: 3 }}>{item.meta}</div>
              </div>
            ))}
          </div>

          {/* Diagnóstico */}
          {c.diagnostico && (
            <div style={cardStyle}>
              <span style={labelStyle}>Diagnóstico</span>
              <p style={{ color: "#888", fontSize: 13, margin: 0, lineHeight: 1.7 }}>
                {c.diagnostico}
              </p>
            </div>
          )}

          {/* Recomendaciones */}
          {c.recomendaciones?.length > 0 && (
            <div style={cardStyle}>
              <button
                onClick={() => setExpandedRecs(v => !v)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: expandedRecs ? 12 : 0 }}
              >
                <span style={{ ...labelStyle, margin: 0 }}>Recomendaciones</span>
                {expandedRecs ? <ChevronUp size={13} color="#444" /> : <ChevronDown size={13} color="#444" />}
              </button>
              {expandedRecs && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {c.recomendaciones.map((rec, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{
                        background:   "rgba(167,139,250,0.15)",
                        color:        "#a78bfa",
                        fontWeight:   700,
                        fontSize:     11,
                        width:        20,
                        height:       20,
                        borderRadius: "50%",
                        display:      "flex",
                        alignItems:   "center",
                        justifyContent: "center",
                        flexShrink:   0,
                        marginTop:    1,
                      }}>
                        {i + 1}
                      </span>
                      <p style={{ color: "#888", fontSize: 13, margin: 0, lineHeight: 1.6 }}>{rec}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Top categorías de gasto */}
          {c.top_categorias_gasto?.length > 0 && (
            <div style={cardStyle}>
              <button
                onClick={() => setExpandedCats(v => !v)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: expandedCats ? 12 : 0 }}
              >
                <span style={{ ...labelStyle, margin: 0 }}>Top Categorías de Gasto</span>
                {expandedCats ? <ChevronUp size={13} color="#444" /> : <ChevronDown size={13} color="#444" />}
              </button>
              {expandedCats && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {c.top_categorias_gasto.map((cat, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < c.top_categorias_gasto.length - 1 ? "1px solid #1a1a20" : "none" }}>
                      <span style={{ color: "#888", fontSize: 12 }}>{cat.nombre}</span>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <span style={{ color: "#f87171", fontSize: 12, fontWeight: 600 }}>
                          S/ {(cat.monto || 0).toLocaleString("es-PE", { minimumFractionDigits: 0 })}
                        </span>
                        <span style={{ color: "#333", fontSize: 11 }}>
                          {(cat.porcentaje_ingreso || 0).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Comparativa mes anterior */}
          {c.comparativa_mes_anterior && (
            <div style={cardStyle}>
              <span style={labelStyle}>Comparativa Mes Anterior</span>
              <p style={{ color: "#888", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                {c.comparativa_mes_anterior}
              </p>
            </div>
          )}

          {/* Proyección anual */}
          {c.proyeccion_anual && (
            <div style={{ ...cardStyle, background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.15)" }}>
              <span style={{ ...labelStyle, color: "#38bdf8" }}>Proyección Anual</span>
              <p style={{ color: "#888", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                {c.proyeccion_anual}
              </p>
            </div>
          )}

          {/* Frase motivadora */}
          {c.frase_motivadora && (
            <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
              <p style={{ color: "#2a2a35", fontSize: 12, fontStyle: "italic", margin: 0 }}>
                "{c.frase_motivadora}"
              </p>
            </div>
          )}

          {/* Metadata del resumen */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
            <span style={{ color: "#222", fontSize: 10 }}>
              {FUENTE_LABEL(resumen.fuente)}
            </span>
            <span style={{ color: "#1a1a20", fontSize: 10 }}>
              {resumen.generado_en
                ? `Generado: ${new Date(resumen.generado_en).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </span>
          </div>

          {/* Aviso si es fallback local */}
          {resumen.fuente === "LOCAL_FALLBACK" && (
            <div style={{ ...cardStyle, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <AlertTriangle size={13} color="#f59e0b" />
                <span style={{ color: "#f59e0b", fontSize: 12 }}>
                  Resumen generado localmente — Gemini sin cuota disponible. Regenera cuando la cuota se renueve
                  o agrega <strong>GEMINI_API_KEY_ALT</strong> en tu <code>.env</code>.
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* CSS spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
