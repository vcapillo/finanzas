/**
 * FinanzasVH v3.0 — BandejaDuplicados.jsx
 * Estilo coherente con App.jsx (mismo sistema inline s.*)
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Trash2, AlertTriangle } from "lucide-react";
import { api } from "../../api.js";

const s = {
  card: { background:"#111113", border:"1px solid #222226", borderRadius:12, padding:"18px 20px" },
  btn:  { border:"none", borderRadius:8, padding:"9px 18px", fontSize:13, fontWeight:600, cursor:"pointer" },
};

function scoreLabel(score) {
  if (score >= 0.90) return { label:"Muy similar", color:"#ef4444", bg:"rgba(239,68,68,0.08)",  border:"rgba(239,68,68,0.25)"  };
  if (score >= 0.75) return { label:"Similar",     color:"#f59e0b", bg:"rgba(245,158,11,0.08)", border:"rgba(245,158,11,0.25)" };
  return                    { label:"Posible",      color:"#38bdf8", bg:"rgba(56,189,248,0.08)", border:"rgba(56,189,248,0.25)" };
}

function TxPanel({ tx, label, color }) {
  return (
    <div style={{
      flex:1, background:"#0a0a0c",
      border:`1px solid ${color}30`,
      borderTop:`3px solid ${color}`,
      borderRadius:8, padding:"12px 14px",
    }}>
      <span style={{
        display:"inline-block",
        background:`${color}18`, color,
        border:`1px solid ${color}30`,
        borderRadius:4, padding:"2px 8px",
        fontSize:10, fontWeight:700, marginBottom:10,
      }}>{label}</span>
      <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
        {[
          ["Fecha",       tx.date],
          ["Descripción", tx.description],
          ["Monto",       `${tx.currency === "USD" ? "$" : "S/"} ${Number(tx.amount || 0).toFixed(2)}`],
          ["Tipo",        tx.type],
        ].map(([k, v]) => (
          <div key={k} style={{ display:"flex", gap:8 }}>
            <span style={{ color:"#444", fontSize:11, minWidth:70, flexShrink:0 }}>{k}:</span>
            <span style={{
              color: k === "Monto" ? color : "#d0d0d8",
              fontSize:12, fontWeight: k === "Monto" ? 700 : 400,
            }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BandejaDuplicados({ onReviewComplete }) {
  const [candidates, setCandidates] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [processing, setProcessing] = useState(null);

  const fetchCandidates = () => {
    setLoading(true);
    api.getDuplicados("PENDING")
      .then((res) => setCandidates(Array.isArray(res) ? res : []))
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCandidates(); }, []);

  const handleAction = async (id, action) => {
    setProcessing(id);
    try {
      await api.revisarDuplicado(id, action);
      setCandidates((prev) => prev.filter((c) => c.id !== id));
      if (onReviewComplete) onReviewComplete();
    } catch {
      alert("Error al procesar. Intenta de nuevo.");
    } finally {
      setProcessing(null);
    }
  };

  const handleAll = async (action) => {
    const label = action === "APPROVE" ? "APROBAR" : "RECHAZAR";
    if (!window.confirm(`¿${label} todos los duplicados pendientes?`)) return;
    try {
      await api.revisarTodosDuplicados(action);
      setCandidates([]);
      if (onReviewComplete) onReviewComplete();
    } catch { alert("Error en acción masiva."); }
  };

  if (loading) return (
    <div style={{ ...s.card, textAlign:"center", padding:32 }}>
      <span style={{ color:"#555", fontSize:13 }}>⏳ Cargando duplicados…</span>
    </div>
  );

  if (!candidates.length) return (
    <div style={{
      ...s.card, textAlign:"center", padding:36,
      border:"1px solid rgba(34,197,94,0.2)",
    }}>
      <CheckCircle2 size={28} color="#22c55e" style={{ display:"block", margin:"0 auto 12px" }}/>
      <p style={{ color:"#22c55e", fontWeight:700, fontSize:14, margin:"0 0 6px" }}>Sin duplicados pendientes</p>
      <p style={{ color:"#444", fontSize:12, margin:0 }}>
        Cuando importes un extracto, aquí aparecerán las transacciones dudosas.
      </p>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

      {/* Encabezado + acciones masivas */}
      <div style={{
        ...s.card,
        background:"rgba(245,158,11,0.05)",
        border:"1px solid rgba(245,158,11,0.2)",
        display:"flex", justifyContent:"space-between",
        alignItems:"center", flexWrap:"wrap", gap:10,
      }}>
        <div>
          <div style={{ color:"#f59e0b", fontWeight:700, fontSize:14, marginBottom:4, display:"flex", alignItems:"center", gap:8 }}>
            <AlertTriangle size={14}/>
            Revisión de Duplicados ({candidates.length})
          </div>
          <div style={{ color:"#555", fontSize:11 }}>
            <strong style={{ color:"#22c55e" }}>IMPORTAR</strong> = no es duplicado ·{" "}
            <strong style={{ color:"#ef4444" }}>DESCARTAR</strong> = es duplicado
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={() => handleAll("REJECT")}
            style={{ ...s.btn, background:"rgba(239,68,68,0.1)", color:"#ef4444", border:"1px solid rgba(239,68,68,0.25)", fontSize:12, padding:"7px 14px" }}>
            <Trash2 size={12} style={{ display:"inline", marginRight:5 }}/>Rechazar todos
          </button>
          <button onClick={() => handleAll("APPROVE")}
            style={{ ...s.btn, background:"rgba(34,197,94,0.1)", color:"#22c55e", border:"1px solid rgba(34,197,94,0.25)", fontSize:12, padding:"7px 14px" }}>
            <CheckCircle2 size={12} style={{ display:"inline", marginRight:5 }}/>Aprobar todos
          </button>
        </div>
      </div>

      {/* Lista de candidatos */}
      {candidates.map((c) => {
        const cfg   = scoreLabel(c.similarity_score);
        const isProc = processing === c.id;
        return (
          <div key={c.id} style={{
            background:"#111113",
            border:`1px solid ${cfg.border}`,
            borderLeft:`3px solid ${cfg.color}`,
            borderRadius:12, padding:"16px 18px",
            opacity: isProc ? 0.5 : 1, transition:"opacity .2s",
          }}>
            {/* Badge de similitud */}
            <div style={{ marginBottom:14 }}>
              <span style={{
                background:cfg.bg, color:cfg.color,
                border:`1px solid ${cfg.border}`,
                borderRadius:5, padding:"3px 10px", fontSize:11, fontWeight:700,
              }}>
                {cfg.label} — {Math.round(c.similarity_score * 100)}%
              </span>
            </div>

            {/* Comparación */}
            <div style={{ display:"flex", gap:12, marginBottom:12 }}>
              <TxPanel tx={c.incoming_transaction} label="NUEVA"     color="#22c55e"/>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <span style={{
                  color:"#333", fontSize:11, fontWeight:700,
                  background:"#0a0a0c", border:"1px solid #1a1a20",
                  borderRadius:20, padding:"4px 8px",
                }}>VS</span>
              </div>
              <TxPanel tx={c.incoming_transaction} label="EXISTENTE" color="#a78bfa"/>
            </div>

            {/* Razonamiento IA */}
            {c.ai_reasoning && (
              <div style={{
                background:"rgba(56,189,248,0.05)",
                border:"1px solid rgba(56,189,248,0.15)",
                borderRadius:8, padding:"10px 14px", marginBottom:12,
                display:"flex", gap:10,
              }}>
                <span style={{ fontSize:14, flexShrink:0 }}>🤖</span>
                <div>
                  <div style={{ color:"#38bdf8", fontSize:10, fontWeight:700, marginBottom:3, letterSpacing:"0.5px" }}>GEMINI DICE</div>
                  <div style={{ color:"#666", fontSize:12, lineHeight:1.6 }}>{c.ai_reasoning}</div>
                </div>
              </div>
            )}

            {/* Acciones */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              <button onClick={() => handleAction(c.id, "REJECT")} disabled={isProc}
                style={{ ...s.btn, background:"rgba(239,68,68,0.1)", color:"#ef4444", border:"1px solid rgba(239,68,68,0.25)" }}>
                🗑️ Descartar — Es duplicado
              </button>
              <button onClick={() => handleAction(c.id, "APPROVE")} disabled={isProc}
                style={{ ...s.btn, background:"rgba(34,197,94,0.12)", color:"#22c55e", border:"1px solid rgba(34,197,94,0.3)" }}>
                ✅ Importar — No es duplicado
              </button>
            </div>
            {isProc && (
              <div style={{ textAlign:"center", color:"#555", fontSize:12, marginTop:8 }}>Procesando…</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
