/**
 * FinanzasVH v3.0 — IngestaExtracto.jsx  (Actualizado v3.1)
 * Previsualización completa + guardado + edición de categorías + creación de reglas con IA
 * Mismo estilo y flujo que el Importer (App.jsx)
 */
import { useEffect, useState } from "react";
import { Zap, CheckCircle2, AlertTriangle, Settings, Plus, X } from "lucide-react";
import { api } from "../../api.js";
import BandejaDuplicados from "./BandejaDuplicados.jsx";

// ── Estilos coherentes con App.jsx ────────────────────────────
const s = {
  card:   { background:"#111113", border:"1px solid #222226", borderRadius:12, padding:"18px 20px" },
  input:  { width:"100%", background:"#0a0a0c", border:"1px solid #2a2a30", color:"#f0f0f2", borderRadius:8, padding:"8px 12px", fontSize:13, boxSizing:"border-box", outline:"none" },
  select: { width:"100%", background:"#0a0a0c", border:"1px solid #2a2a30", color:"#f0f0f2", borderRadius:8, padding:"8px 12px", fontSize:13, boxSizing:"border-box", cursor:"pointer" },
  btn:    { border:"none", borderRadius:8, padding:"9px 18px", fontSize:13, fontWeight:600, cursor:"pointer" },
  label:  { color:"#666670", fontSize:11, fontWeight:600, display:"block", marginBottom:4, letterSpacing:"0.5px" },
};

const TYPE_CONFIG = {
  ingreso:        { label:"💰 Ingreso",        color:"#22c55e", bg:"rgba(34,197,94,0.1)",   border:"rgba(34,197,94,0.25)"   },
  gasto_fijo:     { label:"🏠 Gasto Fijo",     color:"#f59e0b", bg:"rgba(245,158,11,0.1)",  border:"rgba(245,158,11,0.25)"  },
  gasto_variable: { label:"🛒 Gasto Variable",  color:"#f87171", bg:"rgba(248,113,113,0.1)", border:"rgba(248,113,113,0.25)" },
  deuda:          { label:"💳 Deuda/Cuota",    color:"#a78bfa", bg:"rgba(167,139,250,0.1)", border:"rgba(167,139,250,0.25)" },
  ahorro:         { label:"🏦 Ahorro",         color:"#38bdf8", bg:"rgba(56,189,248,0.1)",  border:"rgba(56,189,248,0.25)"  },
};

// Mapeo de tipos Gemini → tipos internos de la app
const GEMINI_TYPE_MAP = {
  "INGRESO":               "ingreso",
  "GASTO":                 "gasto_variable",
  "TRANSFERENCIA_INTERNA": "gasto_fijo",
  "COMISION":              "gasto_variable",
};

const DEFAULT_CATEGORIES = {
  ingreso:        ["Sueldo","Honorarios","Transferencia recibida","Otro ingreso"],
  gasto_fijo:     ["Alquiler","Educación","Internet/Cable","Seguros","Suscripciones","Otro fijo"],
  gasto_variable: ["Alimentación","Salud/Farmacia","Transporte/Gasolina","Restaurante","Otro variable"],
  deuda:          ["Tarjeta de crédito","Cuota diferida","Otra deuda"],
  ahorro:         ["Ahorro programado","Inversión","Otro ahorro"],
};

const Chip = ({ type }) => {
  const c = TYPE_CONFIG[type] || TYPE_CONFIG.gasto_variable;
  return (
    <span style={{
      background:c.bg, color:c.color, border:`1px solid ${c.border}`,
      borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700, whiteSpace:"nowrap",
    }}>{c.label}</span>
  );
};

const fmt  = n => `S/ ${Math.abs(n).toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

function compilePattern(p) {
  try { return new RegExp(p, "i"); } catch { return null; }
}

// Convierte una tx de Gemini al formato interno del Importer
function mapGeminiTx(tx, sourceAccount, categories, classify) {
  const geminiType = tx.type || "GASTO";
  let   appType    = GEMINI_TYPE_MAP[geminiType] || "gasto_variable";
  let   amount     = Number(tx.amount || 0);

  // Normalizar signo
  if (appType !== "ingreso" && amount > 0) amount = -amount;
  if (appType === "ingreso"  && amount < 0) amount = Math.abs(amount);

  const description = tx.merchant_clean || tx.description || "";
  const date        = tx.date || "";
  const period      = date.substring(0, 7);

  // Intentar reclasificar con las reglas del usuario / sistema
  let finalType     = appType;
  let finalCategory = tx.category_suggestion || (categories[appType] || DEFAULT_CATEGORIES[appType] || [])[0] || "Otro";
  let confidence    = "ia";

  if (classify) {
    const classified = classify(description, amount);
    finalType     = classified.type;
    finalCategory = classified.category;
    confidence    = classified.confidence;
  }

  return { date, period, description, amount, type:finalType, category:finalCategory, account:sourceAccount, confidence, excluded:false, isDup:false };
}

const PERIOD_LABELS = {
  "2025-09":"Sep 25","2025-10":"Oct 25","2025-11":"Nov 25","2025-12":"Dic 25",
  "2026-01":"Ene 26","2026-02":"Feb 26","2026-03":"Mar 26","2026-04":"Abr 26",
  "2026-05":"May 26","2026-06":"Jun 26","2026-07":"Jul 26","2026-08":"Ago 26",
  "2026-09":"Sep 26","2026-10":"Oct 26","2026-11":"Nov 26","2026-12":"Dic 26",
};
const lbl = p => PERIOD_LABELS[p] || p;

// ─────────────────────────────────────────────────────────────
export default function IngestaExtracto({
  onImport,
  classify,
  customRules          = [],
  activeAccounts: propsAccounts = [],
  categories: propsCats = {},
  existingTransactions = [],
  onSaveRule,
}) {
  const categories = Object.keys(propsCats).length > 0 ? propsCats : DEFAULT_CATEGORIES;

  // ── Estado general ────────────────────────────────────────
  const [accounts,      setAccounts]      = useState(propsAccounts);
  const [loadingAccts,  setLoadingAccts]  = useState(false);
  const [sourceAccount, setSourceAccount] = useState(propsAccounts[0] || "");
  const [rawText,       setRawText]       = useState("");
  const [loading,       setLoading]       = useState(false);
  const [aiResult,      setAiResult]      = useState(null);   // respuesta cruda de Gemini
  const [showBandeja,   setShowBandeja]   = useState(false);

  // ── Estado del preview (igual que Importer) ───────────────
  const [preview,      setPreview]      = useState([]);
  const [editIdx,      setEditIdx]      = useState(null);
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState(null);

  // ── Modal para crear regla con IA ─────────────────────────
  const [ruleModal, setRuleModal] = useState(null); // índice en preview o null
  const [newRule,   setNewRule]   = useState({ label:"", pattern:"", type:"gasto_variable", category:"Alimentación" });

  // Cargar cuentas activas desde la API si no vienen por props
  useEffect(() => {
    if (propsAccounts.length > 0) {
      setAccounts(propsAccounts);
      if (!sourceAccount) setSourceAccount(propsAccounts[0]);
      return;
    }
    setLoadingAccts(true);
    api.getSettings()
      .then(cfg => {
        const activas = (cfg.accounts || []).filter(a => a.active).map(a => a.name);
        setAccounts(activas);
        if (activas.length > 0) setSourceAccount(activas[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingAccts(false));
  }, [propsAccounts]);

  // Cuando cambia la cuenta seleccionada, actualizar el account en el preview
  useEffect(() => {
    if (preview.length > 0 && sourceAccount) {
      setPreview(p => p.map(t => ({ ...t, account: sourceAccount })));
    }
  }, [sourceAccount]);

  // ── Detección de duplicados ───────────────────────────────
  const descSimilar = (a, b) => {
    const na = a.toLowerCase().replace(/[^a-z0-9]/g, "");
    const nb = b.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!na || !nb) return false;
    const longer  = na.length > nb.length ? na : nb;
    const shorter = na.length > nb.length ? nb : na;
    const m = shorter.split("").filter(c => longer.includes(c)).length;
    return m / longer.length >= 0.5;
  };

  const markDups = txs => txs.map(tx => ({
    ...tx,
    isDup: existingTransactions.some(ex =>
      Math.round(ex.amount * 100) === Math.round(tx.amount * 100) &&
      Math.abs(new Date(ex.date) - new Date(tx.date)) / 86400000 <= 1 &&
      descSimilar(ex.description, tx.description)
    ),
  })).map(tx => ({ ...tx, excluded: tx.isDup }));

  // ── Enviar a Gemini ───────────────────────────────────────
  const handleSubmit = async () => {
    if (!sourceAccount) { alert("Selecciona una cuenta antes de procesar."); return; }
    if (!rawText.trim()) { alert("Pega el texto del extracto antes de procesar."); return; }

    setLoading(true);
    setAiResult(null);
    setPreview([]);
    setShowBandeja(false);
    setImportResult(null);
    setEditIdx(null);

    try {
      const res = await api.ingestarExtracto({
        asset_id: 1,
        period:   (rawText.match(/\d{4}-\d{2}/) || [new Date().toISOString().slice(0, 7)])[0],
        raw_text: `CUENTA: ${sourceAccount}\n\n${rawText}`,
      });
      setAiResult(res);

      // Construir preview desde clean_transactions de Gemini
      const txs = (res.clean_transactions || []).map(tx =>
        mapGeminiTx(tx, sourceAccount, categories, classify)
      );
      setPreview(markDups(txs));

      if (res.duplicates_pending > 0) setShowBandeja(true);
    } catch (err) {
      alert("Error al procesar con Gemini: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Acciones del preview ──────────────────────────────────
  const toggleExclude = idx =>
    setPreview(p => p.map((t, i) => i === idx ? { ...t, excluded: !t.excluded } : t));

  const updatePreview = (idx, field, val) =>
    setPreview(p => p.map((t, i) => i !== idx ? t : { ...t, [field]: val }));

  // ── Guardar carga → importar al backend ───────────────────
  const confirmImport = async () => {
    if (!onImport) { alert("Función de importación no disponible. Recarga la app."); return; }
    const toSend = preview
      .filter(t => !t.excluded)
      .map(({ isDup, excluded, confidence, ...tx }) => tx);
    if (!toSend.length) return;

    setImporting(true);
    try {
      const result = await onImport(toSend);
      setImportResult(result);
      setPreview([]);
      setRawText("");
      setAiResult(null);
    } catch (e) {
      alert("Error al guardar: " + e.message);
    } finally {
      setImporting(false);
    }
  };

  // ── Crear regla con IA ────────────────────────────────────
  const openRuleModal = idx => {
    const tx = preview[idx];
    // Generar patrón sugerido desde las primeras palabras significativas
    const words = tx.description.trim().split(/\s+/).slice(0, 3).join(".*");
    setNewRule({ label: tx.description, pattern: words, type: tx.type, category: tx.category });
    setRuleModal(idx);
  };

  const saveRule = async () => {
    if (!newRule.pattern.trim()) return;
    const rule = { ...newRule, label: newRule.label || newRule.pattern };
    if (onSaveRule) await onSaveRule(rule);

    // Reaplicar la nueva regla a todos los items del preview que coincidan
    const re = compilePattern(rule.pattern);
    if (re) {
      setPreview(p => p.map(t =>
        re.test(t.description)
          ? { ...t, type: rule.type, category: rule.category, confidence:"auto" }
          : t
      ));
    }
    setRuleModal(null);
  };

  // ── Métricas del preview ──────────────────────────────────
  const toImport   = preview.filter(t => !t.excluded);
  const dups       = preview.filter(t => t.isDup);
  const periodDist = {};
  toImport.forEach(t => { periodDist[t.period] = (periodDist[t.period] || 0) + 1; });

  const charColor  = rawText.length > 8000 ? "#f87171" : rawText.length > 4000 ? "#f59e0b" : "#444";
  const canSubmit  = !loading && !!sourceAccount && rawText.trim().length > 0;

  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* ── HEADER ──────────────────────────────────────────── */}
      <div style={{
        ...s.card,
        background:"linear-gradient(135deg,rgba(34,197,94,0.06),rgba(56,189,248,0.04))",
        border:"1px solid rgba(34,197,94,0.2)",
        display:"flex", alignItems:"center", gap:14,
      }}>
        <div style={{ background:"rgba(34,197,94,0.15)", borderRadius:10, padding:"10px 12px", fontSize:22, flexShrink:0 }}>📥</div>
        <div>
          <div style={{ fontWeight:700, fontSize:15, color:"#f0f0f2", display:"flex", alignItems:"center", gap:8 }}>
            Ingesta IA — Gemini
            <span style={{ background:"rgba(34,197,94,0.2)", color:"#22c55e", fontSize:9, padding:"1px 6px", borderRadius:3, fontWeight:700 }}>v3</span>
          </div>
          <div style={{ color:"#555", fontSize:12, marginTop:3 }}>
            Pega el texto de tu extracto · Gemini clasifica · Revisa, edita y guarda la carga · Crea reglas para comercios nuevos.
          </div>
        </div>
      </div>

      {/* ── FORMULARIO DE INGESTA ────────────────────────────── */}
      <div style={s.card}>

        {/* Selector de cuenta — mismo estilo que Importer */}
        <div style={{ background:"rgba(34,197,94,0.06)", border:"1px solid rgba(34,197,94,0.25)", borderRadius:10, padding:"12px 14px", marginBottom:14 }}>
          <label style={{ ...s.label, color:"#22c55e", marginBottom:6 }}>
            💳 CUENTA / TARJETA DE ORIGEN <span style={{ color:"#ef4444" }}>*</span>
          </label>
          <p style={{ color:"#555", fontSize:11, margin:"0 0 10px" }}>
            ¿De qué cuenta es este extracto? Todas las transacciones se asignarán a ella.
          </p>

          {loadingAccts && <div style={{ color:"#444", fontSize:12 }}>⏳ Cargando cuentas…</div>}

          {!loadingAccts && accounts.length === 0 && (
            <div style={{ background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:8, padding:"10px 14px" }}>
              <div style={{ color:"#f59e0b", fontSize:12, fontWeight:700, marginBottom:4 }}>⚠️ Sin cuentas configuradas</div>
              <div style={{ color:"#666", fontSize:11 }}>
                Ve a <strong style={{ color:"#f59e0b" }}>⚙️ Configuración → Cuentas</strong> y agrega tus cuentas activas (BBVA, BCP, YAPE, etc.)
              </div>
            </div>
          )}

          {!loadingAccts && accounts.length > 0 && (
            <>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
                {accounts.map(acc => (
                  <button key={acc} onClick={() => setSourceAccount(acc)}
                    style={{ ...s.btn, padding:"6px 14px", fontSize:12,
                      background: sourceAccount === acc ? "rgba(34,197,94,0.15)" : "#0a0a0c",
                      color:      sourceAccount === acc ? "#22c55e" : "#666",
                      border:     `1px solid ${sourceAccount === acc ? "rgba(34,197,94,0.4)" : "#2a2a30"}`,
                      fontWeight: sourceAccount === acc ? 700 : 400,
                    }}>
                    {acc}
                  </button>
                ))}
              </div>
              {sourceAccount && (
                <div style={{ background:"#0a0a0c", borderRadius:6, padding:"6px 12px", display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ color:"#22c55e", fontSize:12, fontWeight:700 }}>✓ Todas las tx → {sourceAccount}</span>
                  <span style={{ color:"#444", fontSize:11 }}>· Las reglas clasifican tipo y categoría</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Textarea */}
        <div style={{ marginBottom:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <label style={{ ...s.label, marginBottom:0 }}>📋 PEGA EL TEXTO DE TU EXTRACTO</label>
            <span style={{ color:charColor, fontSize:11 }}>{rawText.length.toLocaleString()} caracteres</span>
          </div>
          <textarea
            value={rawText}
            onChange={e => { setRawText(e.target.value); setPreview([]); setAiResult(null); setImportResult(null); }}
            placeholder={"Ejemplo BBVA:\n31/10/2025  *COLEGIO GRACIAS JESUS         -440.00\n17/11/2025  *A/PH4ta MINISTERIO DE EDUCACION  7,066.56\n03/11/2025  *MOVISTAR CUENTA FINANCIERA        -59.90\n\nGemini parsea el formato automáticamente."}
            style={{ ...s.input, minHeight:200, resize:"vertical", fontFamily:"'DM Mono','Courier New',monospace", fontSize:12, lineHeight:1.7 }}
          />
        </div>

        <div style={{ display:"flex", justifyContent:"flex-end" }}>
          <button onClick={handleSubmit} disabled={!canSubmit}
            style={{ ...s.btn,
              background: canSubmit ? "linear-gradient(135deg,#22c55e,#16a34a)" : "#1a1a20",
              color:      canSubmit ? "#fff" : "#444",
              display:"flex", alignItems:"center", gap:8, padding:"10px 22px",
            }}>
            {loading
              ? <><span style={{ display:"inline-block", animation:"spin 1s linear infinite" }}>⟳</span> Procesando con Gemini…</>
              : <><Zap size={14}/> Procesar extracto</>
            }
          </button>
        </div>
      </div>

      {/* ── RESULTADO IMPORTACIÓN EXITOSA ────────────────────── */}
      {importResult && (
        <div style={{ ...s.card, background:"rgba(34,197,94,0.06)", border:"1px solid rgba(34,197,94,0.25)" }}>
          <CheckCircle2 size={16} color="#22c55e" style={{ display:"inline", marginRight:8 }}/>
          <span style={{ color:"#22c55e", fontWeight:700 }}>{importResult.message}</span>
        </div>
      )}

      {/* ── PREVIEW (mismo diseño que Importer) ─────────────── */}
      {preview.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>

          {/* Resumen de Gemini */}
          {aiResult?.ai_summary && (
            <div style={{ ...s.card, background:"rgba(56,189,248,0.04)", border:"1px solid rgba(56,189,248,0.15)" }}>
              <p style={{ color:"#38bdf8", fontSize:11, fontWeight:600, margin:"0 0 10px", letterSpacing:"0.5px" }}>🤖 GEMINI PROCESÓ</p>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                {[
                  { l:"Parseadas",  v: aiResult.ai_summary.total_parsed,                                    c:"#888"    },
                  { l:"Ingresos",   v:`S/ ${Number(aiResult.ai_summary.total_ingresos_pen||0).toFixed(2)}`, c:"#22c55e" },
                  { l:"Gastos",     v:`S/ ${Number(aiResult.ai_summary.total_gastos_pen||0).toFixed(2)}`,   c:"#f87171" },
                  { l:"Moneda",     v: aiResult.ai_summary.currency_detected || "PEN",                      c:"#38bdf8" },
                ].map(({ l, v, c }) => (
                  <div key={l} style={{ background:"#0a0a0c", borderRadius:6, padding:"8px 14px", textAlign:"center", minWidth:90 }}>
                    <div style={{ color:"#444", fontSize:10, marginBottom:2 }}>{l.toUpperCase()}</div>
                    <div style={{ color:c, fontWeight:700, fontSize:13 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats — idénticas al Importer */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
            {[
              { l:"Detectadas", v: preview.length,                       c:"#f0f0f2", e:"📊" },
              { l:"Nuevas",     v: preview.filter(t=>!t.isDup).length,   c:"#22c55e", e:"✅" },
              { l:"Duplicadas", v: dups.length,                          c:"#f59e0b", e:"⚠️" },
              { l:"A importar", v: toImport.length,                      c:"#38bdf8", e:"⬆️" },
            ].map(({ l, v, c, e }) => (
              <div key={l} style={{ ...s.card, padding:"12px 14px", textAlign:"center" }}>
                <div style={{ fontSize:18, marginBottom:4 }}>{e}</div>
                <div style={{ color:c, fontSize:20, fontWeight:700 }}>{v}</div>
                <div style={{ color:"#444", fontSize:11 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Distribución por período */}
          {Object.keys(periodDist).length > 0 && (
            <div style={{ ...s.card, background:"rgba(34,197,94,0.05)", border:"1px solid rgba(34,197,94,0.15)" }}>
              <p style={{ color:"#22c55e", fontSize:12, fontWeight:700, margin:"0 0 10px" }}>📅 DISTRIBUCIÓN POR MES CALENDARIO</p>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {Object.entries(periodDist).sort().map(([p, cnt]) => (
                  <div key={p} style={{ background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:8, padding:"8px 14px", textAlign:"center" }}>
                    <div style={{ color:"#22c55e", fontWeight:700, fontSize:16 }}>{cnt}</div>
                    <div style={{ color:"#888", fontSize:11 }}>{lbl(p)}</div>
                  </div>
                ))}
              </div>
              {Object.keys(periodDist).length > 1 && (
                <p style={{ color:"#555", fontSize:11, margin:"8px 0 0" }}>✦ Este extracto abarca {Object.keys(periodDist).length} meses.</p>
              )}
            </div>
          )}

          {/* Lista de transacciones — igual que Importer */}
          <div style={s.card}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <span style={{ color:"#888", fontSize:13 }}>{toImport.length} de {preview.length} se importarán</span>
              <button onClick={confirmImport} disabled={toImport.length === 0 || importing}
                style={{ ...s.btn,
                  background: toImport.length > 0 ? "linear-gradient(135deg,#22c55e,#16a34a)" : "#1a1a20",
                  color:      toImport.length > 0 ? "#fff" : "#444",
                  display:"flex", alignItems:"center", gap:6,
                }}>
                {importing ? "Guardando…" : <><CheckCircle2 size={14}/> Guardar carga ({toImport.length})</>}
              </button>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:5, maxHeight:440, overflowY:"auto" }}>
              {preview.map((tx, i) => (
                <div key={i} style={{
                  background:"#0f0f12",
                  border:`1px solid ${tx.isDup ? "rgba(245,158,11,0.2)" : "#1a1a20"}`,
                  borderLeft:`3px solid ${
                    tx.excluded    ? "#2a2a30" :
                    tx.isDup       ? "#f59e0b" :
                    tx.confidence === "auto" ? "#22c55e" :
                    tx.confidence === "ia"   ? "#a855f7" :
                    "#444"
                  }`,
                  borderRadius:8, padding:"9px 12px",
                  opacity: tx.excluded ? 0.4 : 1, transition:"opacity .2s",
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    {/* Toggle incluir/excluir */}
                    <button onClick={() => toggleExclude(i)}
                      style={{ background:"none", border:"none", cursor:"pointer", fontSize:14, padding:0, color: tx.excluded ? "#444" : "#22c55e" }}>
                      {tx.excluded ? "○" : "●"}
                    </button>

                    {/* Período */}
                    <span style={{ color:"#38bdf8", fontSize:10, minWidth:56, textAlign:"center", background:"rgba(56,189,248,0.08)", borderRadius:4, padding:"1px 5px" }}>
                      {lbl(tx.period)}
                    </span>

                    {/* Fecha */}
                    <span style={{ color:"#444", fontSize:11, minWidth:78 }}>{tx.date}</span>

                    {/* Descripción */}
                    <span style={{ color: tx.excluded ? "#444" : "#d0d0d8", fontSize:12, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {tx.description}
                    </span>

                    {/* Chip tipo */}
                    <Chip type={tx.type}/>

                    {/* Monto */}
                    <span style={{ color: tx.amount > 0 ? "#22c55e" : "#f87171", fontWeight:700, fontSize:13, minWidth:80, textAlign:"right" }}>
                      {tx.amount > 0 ? "+" : "-"}{fmt(tx.amount)}
                    </span>

                    {/* Badge origen de clasificación */}
                    {tx.confidence === "ia" && (
                      <span style={{ background:"rgba(168,85,247,0.1)", color:"#a855f7", fontSize:9, padding:"1px 5px", borderRadius:3, border:"1px solid rgba(168,85,247,0.2)" }}>IA</span>
                    )}
                    {tx.isDup && (
                      <span style={{ background:"rgba(245,158,11,0.1)", color:"#f59e0b", fontSize:9, padding:"1px 5px", borderRadius:3, border:"1px solid rgba(245,158,11,0.2)" }}>DUP</span>
                    )}

                    {/* Botón crear regla con IA */}
                    {onSaveRule && !tx.excluded && (
                      <button onClick={() => openRuleModal(i)} title="Crear regla para este comercio"
                        style={{ ...s.btn, padding:"2px 7px", fontSize:10,
                          background:"rgba(168,85,247,0.1)", color:"#a855f7",
                          border:"1px solid rgba(168,85,247,0.25)",
                        }}>
                        + Regla
                      </button>
                    )}

                    {/* Botón editar */}
                    <button onClick={() => setEditIdx(editIdx === i ? null : i)}
                      style={{ background:"none", border:"none", color:"#333", cursor:"pointer", padding:3 }}>
                      <Settings size={13}/>
                    </button>
                  </div>

                  {/* Panel de edición inline — tipo / categoría / cuenta */}
                  {editIdx === i && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginTop:10 }}>
                      <div>
                        <label style={{ ...s.label, color:"#555", marginBottom:3 }}>TIPO</label>
                        <select style={s.select} value={tx.type}
                          onChange={e => {
                            updatePreview(i, "type", e.target.value);
                            updatePreview(i, "category", (categories[e.target.value] || [])[0] || "");
                          }}>
                          {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ ...s.label, color:"#555", marginBottom:3 }}>CATEGORÍA</label>
                        <select style={s.select} value={tx.category}
                          onChange={e => updatePreview(i, "category", e.target.value)}>
                          {(categories[tx.type] || []).map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ ...s.label, color:"#555", marginBottom:3 }}>CUENTA</label>
                        <select style={s.select} value={tx.account}
                          onChange={e => updatePreview(i, "account", e.target.value)}>
                          {accounts.map(a => <option key={a}>{a}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Botón guardar al pie si la lista es larga */}
            {preview.length > 5 && (
              <div style={{ display:"flex", justifyContent:"flex-end", marginTop:12, paddingTop:12, borderTop:"1px solid #1a1a20" }}>
                <button onClick={confirmImport} disabled={toImport.length === 0 || importing}
                  style={{ ...s.btn,
                    background: toImport.length > 0 ? "linear-gradient(135deg,#22c55e,#16a34a)" : "#1a1a20",
                    color:      toImport.length > 0 ? "#fff" : "#444",
                    display:"flex", alignItems:"center", gap:6,
                  }}>
                  {importing ? "Guardando…" : <><CheckCircle2 size={14}/> Guardar carga ({toImport.length})</>}
                </button>
              </div>
            )}
          </div>

          {/* Leyenda de colores de la barra lateral */}
          <div style={{ display:"flex", gap:12, flexWrap:"wrap", padding:"4px 2px" }}>
            {[
              { c:"#22c55e", l:"Clasificado por regla" },
              { c:"#a855f7", l:"Clasificado por IA" },
              { c:"#f59e0b", l:"Posible duplicado" },
              { c:"#2a2a30", l:"Excluido de la carga" },
            ].map(({ c, l }) => (
              <div key={l} style={{ display:"flex", alignItems:"center", gap:5 }}>
                <div style={{ width:10, height:10, borderRadius:2, background:c }}/>
                <span style={{ color:"#444", fontSize:10 }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL CREAR REGLA CON IA ──────────────────────────── */}
      {ruleModal !== null && preview[ruleModal] && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ ...s.card, width:"100%", maxWidth:540, border:"1px solid rgba(168,85,247,0.35)" }}>

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div>
                <span style={{ color:"#a855f7", fontWeight:700, fontSize:14 }}>⚡ Nueva regla de clasificación</span>
                <p style={{ color:"#555", fontSize:11, margin:"4px 0 0" }}>
                  Comercio detectado por IA: <strong style={{ color:"#d0d0d8" }}>{preview[ruleModal]?.description}</strong>
                </p>
              </div>
              <button onClick={() => setRuleModal(null)} style={{ background:"none", border:"none", color:"#444", cursor:"pointer" }}>
                <X size={15}/>
              </button>
            </div>

            <div style={{ background:"rgba(168,85,247,0.05)", border:"1px solid rgba(168,85,247,0.15)", borderRadius:8, padding:"10px 14px", marginBottom:14 }}>
              <p style={{ color:"#a855f7", fontSize:11, fontWeight:700, margin:"0 0 4px" }}>💡 SUGERENCIA DE LA IA</p>
              <p style={{ color:"#666", fontSize:11, margin:0 }}>
                El patrón se generó automáticamente desde las primeras palabras del comercio.
                Puedes ajustarlo antes de guardar. Usa <code style={{ color:"#38bdf8" }}>.*</code> como comodín entre palabras.
              </p>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
              <div>
                <label style={s.label}>ETIQUETA (nombre amigable)</label>
                <input style={s.input} value={newRule.label}
                  onChange={e => setNewRule(x => ({ ...x, label: e.target.value }))}
                  placeholder="Ej. Colegio Gracias Jesús"/>
              </div>
              <div>
                <label style={s.label}>PATRÓN (texto o regex)</label>
                <input style={s.input} value={newRule.pattern}
                  onChange={e => setNewRule(x => ({ ...x, pattern: e.target.value }))}
                  placeholder="Ej. COLEGIO.*GRACIAS|GRACIAS JESUS"/>
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              <div>
                <label style={s.label}>TIPO</label>
                <select style={s.select} value={newRule.type}
                  onChange={e => setNewRule(x => ({ ...x, type: e.target.value, category: (categories[e.target.value]||[])[0]||"" }))}>
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>CATEGORÍA</label>
                <select style={s.select} value={newRule.category}
                  onChange={e => setNewRule(x => ({ ...x, category: e.target.value }))}>
                  {(categories[newRule.type] || []).map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display:"flex", gap:8 }}>
              <button onClick={saveRule}
                style={{ ...s.btn, flex:1, background:"linear-gradient(135deg,#a855f7,#7c3aed)", color:"#fff" }}>
                💾 Guardar regla y aplicar al preview
              </button>
              <button onClick={() => setRuleModal(null)}
                style={{ ...s.btn, background:"#1a1a20", color:"#555", border:"1px solid #2a2a30" }}>
                Cancelar
              </button>
            </div>

            <p style={{ color:"#333", fontSize:10, margin:"10px 0 0" }}>
              La regla se guardará en ⚙️ Configuración → Reglas y se aplicará en futuros extractos.
            </p>
          </div>
        </div>
      )}

      {/* ── BANDEJA DUPLICADOS ────────────────────────────────── */}
      {showBandeja && (
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <div style={{ flex:1, height:1, background:"#1a1a20" }}/>
            <span style={{ color:"#f59e0b", fontSize:11, fontWeight:700, letterSpacing:"0.5px" }}>⚠️ BANDEJA DE DUPLICADOS</span>
            <div style={{ flex:1, height:1, background:"#1a1a20" }}/>
          </div>
          <BandejaDuplicados onReviewComplete={() => setShowBandeja(false)}/>
        </div>
      )}
    </div>
  );
}
