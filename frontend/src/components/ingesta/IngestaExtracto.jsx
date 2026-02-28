/**
 * FinanzasVH v3.1 — IngestaExtracto.jsx  (Módulo Unificado: Importar + Ingesta IA)
 * OBS-05: Unificación de módulos Importar e Ingesta IA
 * - Modo texto (PDF pegado) + Modo CSV
 * - Toggle "Usar IA" on/off: OFF = clasificación por reglas; ON = Gemini para sin match
 * - Panel de ciclos de facturación integrado
 * - Detección automática de transferencias internas
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { Zap, CheckCircle2, AlertTriangle, Settings, Plus, X, ArrowRight, Upload, FileSpreadsheet, FileText } from "lucide-react";
import { api } from "../../api.js";
import BandejaDuplicados from "./BandejaDuplicados.jsx";
import * as XLSX from "xlsx";

// ── Extractor de texto PDF vía pdfjs CDN (lazy load) ─────────
let _pdfjsLoaded = false;
async function loadPdfJs() {
  if (_pdfjsLoaded) return window.pdfjsLib;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  _pdfjsLoaded = true;
  return window.pdfjsLib;
}

async function extractTextFromPDF(arrayBuffer) {
  const pdfjs = await loadPdfJs();
  const pdf   = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Reconstruir líneas aproximadas agrupando por Y
    const byY = {};
    content.items.forEach(item => {
      const y = Math.round(item.transform[5]);
      if (!byY[y]) byY[y] = [];
      byY[y].push({ x: item.transform[4], str: item.str });
    });
    const lines = Object.keys(byY)
      .sort((a, b) => b - a)  // orden descendente Y = top→bottom
      .map(y => byY[y].sort((a, b) => a.x - b.x).map(i => i.str).join("  "));
    pages.push(lines.join("\n"));
  }
  return pages.join("\n");
}

// ── Parser Excel (xlsx) → texto CSV simulado → parseCSVRaw ───
function parseXLSXBuffer(arrayBuffer, bankHint) {
  const wb  = XLSX.read(new Uint8Array(arrayBuffer), { type:"array", cellDates:true });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  // Convertir a CSV con delimitador punto y coma
  const csv = XLSX.utils.sheet_to_csv(ws, { FS:";", blankrows:false });
  return parseCSVRaw(csv, bankHint);
}

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

// ── Parsers locales (sin llamada a IA) ───────────────────────
// Parsea texto de extracto bancario (PDF copiado) → array de {date,period,description,amount,source}
function parseTextRaw(rawText, bankHint="auto") {
  const lines = rawText.split(/\n/).map(l => l.trim()).filter(Boolean);
  const results = [];
  const datePatterns = [
    /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/,
    /^(\d{2})[\/\-](\d{2})[\/\-](\d{2})\b/,
    /^(\d{4})[\/\-](\d{2})[\/\-](\d{2})/,
  ];
  for (const line of lines) {
    let isoDate = null, rest = line;
    for (const pat of datePatterns) {
      const m = line.match(pat);
      if (m) {
        let [, d, mo, y] = m;
        if (pat === datePatterns[2]) { y = d; d = m[3]; }
        if (y.length === 2) y = "20" + y;
        isoDate = `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
        rest = line.slice(m[0].length).trim();
        break;
      }
    }
    if (!isoDate) continue;
    let amount = null, description = rest;
    const twoAmt = rest.match(/^(.+?)\s+(-?[\d,\.]+)\s+(-?[\d,\.]+)\s*$/);
    if (twoAmt) {
      const [, desc, deb, hab] = twoAmt;
      const d2 = parseFloat(deb.replace(/,/g, "")), h = parseFloat(hab.replace(/,/g, ""));
      description = desc.trim(); amount = h > 0 ? h : -d2;
    } else {
      const s = rest.match(/^(.+?)\s+S?\/? ?(-?[\d,\.]+)\s*$/);
      if (s) {
        const [, desc, amtStr] = s;
        description = desc.trim(); amount = parseFloat(amtStr.replace(/,/g, ""));
        if (bankHint === "BBVA" && !/(INGRESO|CREDITO|ABONO|SUELDO|REMUNER)/i.test(description)) amount = -Math.abs(amount);
      }
    }
    if (!amount || isNaN(amount) || description.length < 3) continue;
    results.push({ date: isoDate, period: isoDate.substring(0, 7), description, amount, source: "import_text" });
  }
  return results;
}

// Parsea CSV bancario → array de {date,period,description,amount,source}
function parseCSVRaw(text, bankHint="auto") {
  const lines = text.split(/\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/"/g, ""));
  const colMap = {};
  headers.forEach((h, i) => {
    if (/fecha|date/i.test(h))                                     colMap.date   = i;
    if (/descripci|operaci|concepto|detail|desc/i.test(h))         colMap.desc   = i;
    if (/monto|importe|amount|valor/i.test(h) && !colMap.amount)   colMap.amount = i;
    if (/cargo|debito|debe|debit/i.test(h))                        colMap.debit  = i;
    if (/abono|credito|haber|credit/i.test(h))                     colMap.credit = i;
  });
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/"/g, ""));
    const dateRaw = colMap.date !== undefined ? cols[colMap.date] : "";
    const desc    = colMap.desc !== undefined ? cols[colMap.desc] : cols[1] || "";
    let amount = 0;
    if (colMap.debit !== undefined || colMap.credit !== undefined) {
      const deb  = parseFloat((cols[colMap.debit]  || "0").replace(/[,\s]/g, "")) || 0;
      const cred = parseFloat((cols[colMap.credit] || "0").replace(/[,\s]/g, "")) || 0;
      amount = cred > 0 ? cred : -deb;
    } else if (colMap.amount !== undefined) {
      amount = parseFloat((cols[colMap.amount] || "0").replace(/[,\s]/g, "")) || 0;
      if (bankHint === "BBVA" && !/(INGRESO|CREDITO|ABONO|SUELDO)/i.test(desc)) amount = -Math.abs(amount);
    }
    if (!dateRaw || isNaN(amount) || !desc) continue;
    let isoDate = dateRaw;
    const dm = dateRaw.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})/);
    if (dm) { const [, d, m2, y] = dm; isoDate = `${y.length === 2 ? "20" + y : y}-${m2}-${d}`; }
    results.push({ date: isoDate, period: isoDate.substring(0, 7), description: desc, amount, source: "import_csv" });
  }
  return results;
}

// Convierte una tx de Gemini al formato interno del Importer
function mapGeminiTx(tx, sourceAccount, categories, classify) {
  const geminiType = tx.type || "GASTO";
  let   appType    = GEMINI_TYPE_MAP[geminiType] || "gasto_variable";
  let   amount     = Number(tx.amount || 0);

  if (appType !== "ingreso" && amount > 0) amount = -amount;
  if (appType === "ingreso"  && amount < 0) amount = Math.abs(amount);

  const rawBankText   = tx.description || "";
  const merchantClean = tx.merchant_clean || rawBankText;
  const date          = tx.date || "";
  const period        = date.substring(0, 7);

  let finalType     = appType;
  let finalCategory = tx.category_suggestion || (categories[appType] || DEFAULT_CATEGORIES[appType] || [])[0] || "Otro";
  let confidence    = "ia";
  let ruleName      = "";
  let isInternal    = false; // ← true si la regla matched es un movimiento interno

  if (classify) {
    const classifiedRaw = classify(rawBankText, amount);
    if (classifiedRaw.confidence === "auto") {
      finalType     = classifiedRaw.type;
      finalCategory = classifiedRaw.category;
      confidence    = "auto";
      ruleName      = classifiedRaw.ruleName || "";
      isInternal    = classifiedRaw.isInternal || false;
    } else {
      const classifiedClean = classify(merchantClean, amount);
      finalType     = classifiedClean.type;
      finalCategory = classifiedClean.category;
      confidence    = classifiedClean.confidence;
      ruleName      = classifiedClean.ruleName || "";
      isInternal    = classifiedClean.isInternal || false;
    }
  }

  const displayDescription = ruleName || merchantClean || rawBankText;

  return {
    date,
    period,
    description:    displayDescription,
    rawDescription: rawBankText,
    amount,
    type:     finalType,
    category: finalCategory,
    account:  sourceAccount,
    confidence,
    ruleName,
    isInternal,           // ← true = transferencia entre cuentas propias
    destAssetId: null,    // ← se asigna en UI si isInternal=true
    excluded: isInternal, // ← pre-excluir del flujo normal (se procesa aparte)
    isDup:    false,
  };
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
  billingCycles        = [],      // ← OBS-05: ciclos de facturación para mostrar en panel
}) {
  const categories = Object.keys(propsCats).length > 0 ? propsCats : DEFAULT_CATEGORIES;

  const [accounts,      setAccounts]      = useState(propsAccounts);
  const [loadingAccts,  setLoadingAccts]  = useState(false);
  const [sourceAccount, setSourceAccount] = useState(propsAccounts[0] || "");
  const [rawText,       setRawText]       = useState("");
  const [loading,       setLoading]       = useState(false);
  const [aiResult,      setAiResult]      = useState(null);
  const [showBandeja,   setShowBandeja]   = useState(false);

  const [preview,      setPreview]      = useState([]);
  const [editIdx,      setEditIdx]      = useState(null);
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState(null);

  const [ruleModal, setRuleModal] = useState(null);
  const [newRule,   setNewRule]   = useState({ label:"", pattern:"", type:"gasto_variable", category:"Alimentación" });

  // ── Assets (cuentas) para transferencias internas ─────────
  const [assets, setAssets] = useState([]);
  const loadAssets = useCallback(async () => {
    try { setAssets(await api.getAssets() || []); } catch { setAssets([]); }
  }, []);
  useEffect(() => { loadAssets(); }, [loadAssets]);

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

  useEffect(() => {
    if (preview.length > 0 && sourceAccount) {
      setPreview(p => p.map(t => ({ ...t, account: sourceAccount })));
    }
  }, [sourceAccount]);

  const [editingDescIdx, setEditingDescIdx] = useState(null);

  // ── OBS-05: estados para modo unificado ───────────────────────
  const [inputMode,   setInputMode]   = useState("text");  // "text" | "csv" | "pdf" | "xlsx"
  const [useAI,       setUseAI]       = useState(true);    // true = Gemini; false = solo reglas
  const [bankHint,    setBankHint]    = useState("auto");  // "auto" | "BBVA" | "BCP" | "YAPE"
  const [fileLoading, setFileLoading] = useState(false);   // spinner mientras extrae texto PDF/xlsx
  const [fileInfo,    setFileInfo]    = useState(null);    // { name, rows? }
  const csvRef  = useRef();
  const pdfRef  = useRef();
  const xlsxRef = useRef();

  // ── Función auxiliar: clasificar array de rawItems ──────────
  const classifyItems = useCallback((rawItems, srcAccount) => {
    return rawItems.map(tx => {
      const cl = classify
        ? classify(tx.description, tx.amount)
        : { type:"gasto_variable", category:"Otro variable", confidence:"manual", ruleName:"", isInternal:false };
      return {
        ...tx,
        description:    cl.ruleName || tx.description,
        rawDescription: tx.description,
        type:      cl.type, category:  cl.category, confidence: cl.confidence,
        ruleName:  cl.ruleName || "", isInternal: cl.isInternal || false,
        account:   srcAccount, destAssetId: null,
        excluded:  cl.isInternal || false, isDup: false,
      };
    });
  }, [classify]);

  // ── Handler PDF upload ─────────────────────────────────────
  const handlePDFFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!sourceAccount) { alert("Selecciona una cuenta antes de procesar."); if (e.target) e.target.value=""; return; }
    setFileLoading(true);
    setPreview([]); setAiResult(null); setImportResult(null); setEditIdx(null); setFileInfo(null);
    try {
      const buf  = await file.arrayBuffer();
      const text = await extractTextFromPDF(buf);
      if (!text || text.trim().length < 20) {
        alert("⚠️ El PDF no contiene texto extraíble (puede ser escaneado). Usa \"Pegar texto\" en su lugar.");
        return;
      }
      const rawItems = parseTextRaw(text, bankHint);
      if (rawItems.length === 0) {
        setRawText(text);
        setInputMode("text");
        alert("⚠️ Texto extraído pero no se detectaron transacciones automáticamente. Revisa el texto en modo \"Pegar texto\".");
        return;
      }
      setPreview(markDups(classifyItems(rawItems, sourceAccount)));
      setFileInfo({ name: file.name, rows: rawItems.length });
    } catch (err) {
      alert("❌ Error al leer el PDF: " + err.message + ". Intenta con \"Pegar texto\".");
    } finally {
      setFileLoading(false);
      if (e.target) e.target.value = "";
    }
  };

  // ── Handler Excel upload ──────────────────────────────────
  const handleXLSXFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!sourceAccount) { alert("Selecciona una cuenta antes de procesar."); if (e.target) e.target.value=""; return; }
    setFileLoading(true);
    setPreview([]); setAiResult(null); setImportResult(null); setEditIdx(null); setFileInfo(null);
    try {
      const buf   = await file.arrayBuffer();
      const items = parseXLSXBuffer(buf, bankHint);
      if (items.length === 0) {
        alert("⚠️ No se detectaron transacciones en el Excel. Verifica que la primera hoja tenga columnas: Fecha, Descripción, Monto.");
        return;
      }
      setPreview(markDups(classifyItems(items, sourceAccount)));
      setFileInfo({ name: file.name, rows: items.length });
    } catch (err) {
      alert("❌ Error al leer el Excel: " + err.message);
    } finally {
      setFileLoading(false);
      if (e.target) e.target.value = "";
    }
  };

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
  })).map(tx => ({ ...tx, excluded: tx.excluded || tx.isDup }));

  // ── Flujo SIN IA: parseo local + clasificación por reglas ───────────
  const handleParseLocal = (csvContent = null) => {
    if (!sourceAccount) { alert("Selecciona una cuenta antes de procesar."); return; }
    const rawItems = csvContent
      ? parseCSVRaw(csvContent, bankHint)
      : parseTextRaw(rawText, bankHint);
    if (rawItems.length === 0) {
      alert("No se pudieron detectar transacciones. Verifica el formato del extracto.");
      return;
    }
    const classified = rawItems.map(tx => {
      const cl = classify ? classify(tx.description, tx.amount) : { type:"gasto_variable", category:"Otro variable", confidence:"manual", ruleName:"", isInternal:false };
      const displayDescription = cl.ruleName || tx.description;
      return {
        ...tx,
        description:    displayDescription,
        rawDescription: tx.description,
        type:      cl.type,
        category:  cl.category,
        confidence: cl.confidence,
        ruleName:   cl.ruleName || "",
        isInternal: cl.isInternal || false,
        account:    sourceAccount,
        destAssetId: null,
        excluded:   cl.isInternal || false,
        isDup:      false,
      };
    });
    setPreview(markDups(classified));
    setAiResult(null);
    setImportResult(null);
    setEditIdx(null);
    setShowBandeja(false);
  };

  // Manejador CSV para modo local
  const handleCSVFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleParseLocal(ev.target.result);
    reader.readAsText(file, "latin1");
  };

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

  const toggleExclude = idx =>
    setPreview(p => p.map((t, i) => i === idx ? { ...t, excluded: !t.excluded } : t));

  const updatePreview = (idx, field, val) =>
    setPreview(p => p.map((t, i) => i !== idx ? t : { ...t, [field]: val }));

  // ── Guardar carga bifurcado: normales + transferencias internas ──
  const confirmImport = async () => {
    if (!onImport) { alert("Función de importación no disponible. Recarga la app."); return; }

    // Validar transferencias internas sin cuenta destino
    const sinDestino = preview.filter(t => t.isInternal && !t.excluded && !t.destAssetId);
    if (sinDestino.length > 0) {
      alert(`⚠️ ${sinDestino.length} transferencia(s) interna(s) sin cuenta destino asignada. Completa el campo antes de guardar.`);
      return;
    }

    // Grupo 1: transferencias internas con cuenta destino asignada
    const internals = preview.filter(t => t.isInternal && t.destAssetId);
    // Grupo 2: movimientos normales (no internos, no excluidos)
    const normales  = preview
      .filter(t => !t.isInternal && !t.excluded)
      .map(({ isDup, excluded, confidence, isInternal, destAssetId, ...tx }) => tx);

    if (!internals.length && !normales.length) return;

    setImporting(true);
    const msgs = [];

    try {
      // Importar movimientos normales
      if (normales.length > 0) {
        const result = await onImport(normales);
        msgs.push(`${result?.imported ?? normales.length} movimiento(s) importado(s)`);
        setImportResult(result);
      }

      // Registrar transferencias internas como InternalTransfer (con espejo automático)
      let txOk = 0; const txErr = [];
      for (const tx of internals) {
        const srcAsset = assets.find(a =>
          a.name.toLowerCase() === sourceAccount.toLowerCase() ||
          sourceAccount.toLowerCase().includes(a.name.toLowerCase()) ||
          a.name.toLowerCase().includes(sourceAccount.toLowerCase())
        );
        if (!srcAsset) { txErr.push(`Sin activo para "${sourceAccount}"`); continue; }
        try {
          await api.crearTransferencia({
            source_asset_id: srcAsset.id,
            dest_asset_id:   parseInt(tx.destAssetId),
            amount:          Math.abs(tx.amount),
            currency:        "PEN",
            transfer_date:   tx.date,
            notes:           `[Ingesta IA] ${tx.rawDescription || tx.description}`,
          });
          txOk++;
        } catch (e) { txErr.push(`${tx.description}: ${e?.detail || e?.message || "error"}`); }
      }
      if (txOk)         msgs.push(`${txOk} transferencia(s) interna(s) con espejo ✅`);
      if (txErr.length) msgs.push(`⚠️ Errores: ${txErr.join(" | ")}`);

      setImportResult({ message: msgs.join(" · ") || "Carga completada." });
      setPreview([]);
      setRawText("");
      setAiResult(null);
    } catch (e) {
      alert("Error al guardar: " + e.message);
    } finally {
      setImporting(false);
    }
  };

  const openRuleModal = idx => {
    const tx = preview[idx];
    const words = tx.description.trim().split(/\s+/).slice(0, 3).join(".*");
    setNewRule({ label: tx.description, pattern: words, type: tx.type, category: tx.category });
    setRuleModal(idx);
  };

  const saveRule = async () => {
    if (!newRule.pattern.trim()) return;
    const rule = { ...newRule, label: newRule.label || newRule.pattern };
    if (onSaveRule) await onSaveRule(rule);
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
  // internalsInPreview = todos los detectados como internos (para leyenda total)
  // internalsSelected   = internos que el usuario activó (excluded=false)
  // internalsReady      = internos activados Y con cuenta destino elegida
  // toImport            = solo normales activos (sin internos)
  const internalsInPreview = preview.filter(t => t.isInternal);
  const internalsSelected  = internalsInPreview.filter(t => !t.excluded);
  const internalsReady     = internalsSelected.filter(t => t.destAssetId);
  const toImport   = preview.filter(t => !t.excluded && !t.isInternal);
  const dups       = preview.filter(t => t.isDup);
  const periodDist = {};
  toImport.forEach(t => { periodDist[t.period] = (periodDist[t.period] || 0) + 1; });
  const totalToSave = toImport.length + internalsReady.length;

  const charColor  = rawText.length > 8000 ? "#f87171" : rawText.length > 4000 ? "#f59e0b" : "#444";
  // Solo "text" requiere rawText; csv/pdf/xlsx procesan el archivo directamente
  const canSubmit  = !loading && !fileLoading && !!sourceAccount && (inputMode !== "text" || rawText.trim().length > 0);

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
            📥 Importar / Ingestar
            <span style={{ background:"rgba(34,197,94,0.2)", color:"#22c55e", fontSize:9, padding:"1px 6px", borderRadius:3, fontWeight:700 }}>v3.1</span>
          </div>
          <div style={{ color:"#555", fontSize:12, marginTop:3 }}>
            Texto · CSV · PDF · Excel · Clasificación por reglas · Opcional: Gemini para sin match · Revisa y guarda.
          </div>
        </div>
      </div>

      {/* ── OBS-05: PANEL DE CICLOS DE FACTURACIÓN ──────────── */}
      {billingCycles.length > 0 && (
        <div style={{
          background:"rgba(167,139,250,0.04)",
          border:"1px solid rgba(167,139,250,0.2)",
          borderRadius:12,
          padding:"14px 18px",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <span style={{ fontSize:15 }}>📅</span>
            <span style={{ color:"#a78bfa", fontWeight:700, fontSize:12, letterSpacing:"0.5px" }}>CICLOS DE FACTURACIÓN</span>
            <span style={{ color:"#444", fontSize:11, marginLeft:4 }}>— referencia al importar extractos de tarjetas</span>
          </div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            {billingCycles.map((c, i) => {
              const now     = new Date();
              const today   = now.getDate();
              const daysToVence = c.dueDay >= today
                ? c.dueDay - today
                : (new Date(now.getFullYear(), now.getMonth() + 1, c.dueDay) - now) / 86400000;
              const urgente = daysToVence <= 5;
              return (
                <div key={i} style={{
                  background:"#0a0a0c",
                  border:`1px solid ${urgente ? "rgba(239,68,68,0.35)" : "rgba(167,139,250,0.2)"}`,
                  borderLeft:`3px solid ${urgente ? "#ef4444" : "#a78bfa"}`,
                  borderRadius:8,
                  padding:"10px 14px",
                  minWidth:200,
                  flex:"1 1 auto",
                }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ color:"#d0d0d8", fontWeight:700, fontSize:13 }}>💳 {c.name}</span>
                    {urgente && (
                      <span style={{ background:"rgba(239,68,68,0.12)", color:"#ef4444", fontSize:10, padding:"2px 7px", borderRadius:4, fontWeight:700 }}>
                        ⚡ Vence en {Math.ceil(daysToVence)}d
                      </span>
                    )}
                  </div>
                  <div style={{ display:"flex", gap:14 }}>
                    <div>
                      <div style={{ color:"#555", fontSize:10, marginBottom:2 }}>CORTE</div>
                      <div style={{ color:"#a78bfa", fontWeight:700, fontSize:15 }}>día {c.cutDay}</div>
                    </div>
                    <div style={{ width:1, background:"#1e1e26", alignSelf:"stretch" }}/>
                    <div>
                      <div style={{ color:"#555", fontSize:10, marginBottom:2 }}>VENCIMIENTO</div>
                      <div style={{ color: urgente ? "#ef4444" : "#f87171", fontWeight:700, fontSize:15 }}>día {c.dueDay}</div>
                    </div>
                    {c.account && (
                      <>
                        <div style={{ width:1, background:"#1e1e26", alignSelf:"stretch" }}/>
                        <div>
                          <div style={{ color:"#555", fontSize:10, marginBottom:2 }}>CUENTA</div>
                          <div style={{ color:"#888", fontSize:12 }}>{c.account}</div>
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{ marginTop:8, padding:"5px 8px", background:"rgba(167,139,250,0.06)", borderRadius:5 }}>
                    <span style={{ color:"#444", fontSize:10 }}>
                      Ciclo de compras: del día {c.cutDay + 1} al {c.cutDay} del mes siguiente
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop:10, color:"#333", fontSize:11 }}>
            💡 Las transacciones del extracto se asignan al mes real de la compra, no al mes del extracto.
          </div>
        </div>
      )}

      {/* ── FORMULARIO ───────────────────────────────────────── */}
      <div style={s.card}>

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
                Ve a <strong style={{ color:"#f59e0b" }}>⚙️ Configuración → Cuentas</strong> y agrega tus cuentas activas.
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

        {/* ── OBS-05: Toggle modo entrada + toggle IA ──────────────── */}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, flexWrap:"wrap" }}>
          {/* Modo de entrada */}
          {[
            ["text",  "📋 Pegar texto"],
            ["csv",   "📊 CSV"],
            ["pdf",   "📄 PDF"],
            ["xlsx",  "📊 Excel"],
          ].map(([m, etq]) => (
            <button key={m} onClick={() => { setInputMode(m); setPreview([]); setImportResult(null); setFileInfo(null); }}
              style={{ ...s.btn, padding:"6px 14px", fontSize:12,
                background: inputMode === m ? "rgba(34,197,94,0.12)" : "#0a0a0c",
                color:      inputMode === m ? "#22c55e" : "#666",
                border:     `1px solid ${inputMode === m ? "rgba(34,197,94,0.35)" : "#2a2a30"}`
              }}>{etq}</button>
          ))}
          <div style={{ width:1, height:22, background:"#2a2a30", marginInline:4 }}/>
          {/* Toggle IA */}
          <button onClick={() => setUseAI(u => !u)}
            title={useAI ? "Gemini clasifica los sin match de regla" : "Solo reglas: más rápido, sin API"}
            style={{ ...s.btn, padding:"6px 14px", fontSize:12, display:"flex", alignItems:"center", gap:5,
              background: useAI ? "rgba(167,139,250,0.12)" : "#0a0a0c",
              color:      useAI ? "#a78bfa" : "#555",
              border:     `1px solid ${useAI ? "rgba(167,139,250,0.35)" : "#2a2a30"}`
            }}>
            <Zap size={12}/>
            {useAI ? "IA activa" : "Solo reglas"}
          </button>
          {/* Hint banco */}
          <select value={bankHint} onChange={e => setBankHint(e.target.value)}
            title="Ayuda a interpretar el signo de los montos"
            style={{ ...s.select, width:"auto", padding:"6px 10px", fontSize:11, color:"#666" }}>
            <option value="auto">Banco: Auto</option>
            <option value="BBVA">BBVA</option>
            <option value="BCP">BCP</option>
            <option value="YAPE">YAPE</option>
          </select>
        </div>

        {/* Nota del modo activo */}
        {!useAI && (
          <div style={{ background:"rgba(56,189,248,0.05)", border:"1px solid rgba(56,189,248,0.2)", borderRadius:8, padding:"8px 12px", marginBottom:12, fontSize:11, color:"#38bdf8" }}>
            💡 <strong>Modo Reglas:</strong> Clasificación instantánea con tus reglas personales y del sistema. Sin consumo de API.
          </div>
        )}
        {useAI && (
          <div style={{ background:"rgba(167,139,250,0.05)", border:"1px solid rgba(167,139,250,0.2)", borderRadius:8, padding:"8px 12px", marginBottom:12, fontSize:11, color:"#a78bfa" }}>
            ✨ <strong>Modo IA:</strong> Las transacciones con match de regla se clasifican automáticamente. Las sin match van a Gemini.
          </div>
        )}

        {/* Área de entrada: texto o CSV */}
        {inputMode === "text" && (
          <div style={{ marginBottom:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <label style={{ ...s.label, marginBottom:0 }}>📋 PEGA EL TEXTO DE TU EXTRACTO</label>
              <span style={{ color:charColor, fontSize:11 }}>{rawText.length.toLocaleString()} caracteres</span>
            </div>
            <textarea
              value={rawText}
              onChange={e => { setRawText(e.target.value); setPreview([]); setAiResult(null); setImportResult(null); }}
              placeholder={"Ejemplo BBVA:\n31/10/2025  *COLEGIO GRACIAS JESUS         -440.00\n17/11/2025  *A/PH4ta MINISTERIO DE EDUCACION  7,066.56\n03/11/2025  *MOVISTAR CUENTA FINANCIERA        -59.90"}
              style={{ ...s.input, minHeight:200, resize:"vertical", fontFamily:"'DM Mono','Courier New',monospace", fontSize:12, lineHeight:1.7 }}
            />
          </div>
        )}

        {inputMode === "csv" && (
          <div style={{ marginBottom:14 }}>
            <label style={s.label}>📊 IMPORTAR ARCHIVO CSV</label>
            <div
              onClick={() => csvRef.current && csvRef.current.click()}
              style={{ border:"2px dashed #2a2a30", borderRadius:8, padding:"32px 20px", textAlign:"center", cursor:"pointer",
                background:"#0a0a0c"
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor="rgba(34,197,94,0.5)"}
              onMouseLeave={e => e.currentTarget.style.borderColor="#2a2a30"}
            >
              <Upload size={28} color="#444" style={{ marginBottom:10, display:"block", margin:"0 auto 10px" }}/>
              <div style={{ color:"#555", fontSize:13 }}>Haz clic para seleccionar archivo CSV</div>
              <div style={{ color:"#333", fontSize:11, marginTop:6 }}>Separador coma o punto y coma · Encoding latin1/UTF-8</div>
            </div>
            <input ref={csvRef} type="file" accept=".csv,.txt" style={{ display:"none" }}
              onChange={e => { handleCSVFile(e); e.target.value=""; }}/>
          </div>
        )}

        {/* PDF upload */}
        {inputMode === "pdf" && (
          <div style={{ marginBottom:14 }}>
            <label style={s.label}>📄 IMPORTAR PDF BANCARIO</label>
            {fileInfo && (
              <div style={{ background:"rgba(34,197,94,0.07)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:6, padding:"6px 12px", marginBottom:8, fontSize:11, color:"#22c55e" }}>
                ✅ <strong>{fileInfo.name}</strong> — {fileInfo.rows} transacciones detectadas
              </div>
            )}
            <div
              onClick={() => !fileLoading && pdfRef.current && pdfRef.current.click()}
              style={{ border:"2px dashed #2a2a30", borderRadius:8, padding:"32px 20px", textAlign:"center",
                cursor: fileLoading ? "wait" : "pointer", background:"#0a0a0c",
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor="rgba(239,68,68,0.5)"}
              onMouseLeave={e => e.currentTarget.style.borderColor="#2a2a30"}
            >
              {fileLoading
                ? <><div style={{ color:"#f87171", fontSize:22, marginBottom:8 }}>⏳</div><div style={{ color:"#f87171", fontSize:13 }}>Extrayendo texto del PDF…</div></>
                : <><div style={{ color:"#f87171", fontSize:28, marginBottom:8 }}>📄</div>
                   <div style={{ color:"#555", fontSize:13 }}>Haz clic para seleccionar archivo PDF</div>
                   <div style={{ color:"#333", fontSize:11, marginTop:6 }}>El sistema extrae el texto automáticamente · PDF nativo (no escaneado)</div>
                  </>
              }
            </div>
            <input ref={pdfRef} type="file" accept=".pdf" style={{ display:"none" }} onChange={handlePDFFile}/>
            <div style={{ marginTop:8, color:"#444", fontSize:10 }}>
              💡 Si el PDF es escaneado (imagen), usa el modo <strong style={{color:"#888"}}>📋 Pegar texto</strong> copiando el contenido manualmente.
            </div>
          </div>
        )}

        {/* Excel upload */}
        {inputMode === "xlsx" && (
          <div style={{ marginBottom:14 }}>
            <label style={s.label}>📊 IMPORTAR EXCEL (.xlsx / .xls)</label>
            {fileInfo && (
              <div style={{ background:"rgba(34,197,94,0.07)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:6, padding:"6px 12px", marginBottom:8, fontSize:11, color:"#22c55e" }}>
                ✅ <strong>{fileInfo.name}</strong> — {fileInfo.rows} transacciones detectadas
              </div>
            )}
            <div
              onClick={() => !fileLoading && xlsxRef.current && xlsxRef.current.click()}
              style={{ border:"2px dashed #2a2a30", borderRadius:8, padding:"32px 20px", textAlign:"center",
                cursor: fileLoading ? "wait" : "pointer", background:"#0a0a0c",
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor="rgba(34,197,94,0.5)"}
              onMouseLeave={e => e.currentTarget.style.borderColor="#2a2a30"}
            >
              {fileLoading
                ? <><div style={{ color:"#22c55e", fontSize:22, marginBottom:8 }}>⏳</div><div style={{ color:"#22c55e", fontSize:13 }}>Procesando Excel…</div></>
                : <><div style={{ color:"#22c55e", fontSize:28, marginBottom:8 }}>📊</div>
                   <div style={{ color:"#555", fontSize:13 }}>Haz clic para seleccionar archivo Excel</div>
                   <div style={{ color:"#333", fontSize:11, marginTop:6 }}>.xlsx · .xls · Primera hoja activa · Columnas: Fecha, Descripción, Monto</div>
                  </>
              }
            </div>
            <input ref={xlsxRef} type="file" accept=".xlsx,.xls" style={{ display:"none" }} onChange={handleXLSXFile}/>
          </div>
        )}

        {/* Botón de acción: solo visible en modo texto (CSV/PDF/XLSX procesan al seleccionar archivo) */}
        {inputMode === "text" && (
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <button
              onClick={() => useAI ? handleSubmit() : handleParseLocal()}
              disabled={!canSubmit}
              style={{ ...s.btn,
                background: canSubmit ? (useAI ? "linear-gradient(135deg,#a78bfa,#7c3aed)" : "linear-gradient(135deg,#22c55e,#16a34a)") : "#1a1a20",
                color: canSubmit ? "#fff" : "#444",
                display:"flex", alignItems:"center", gap:8, padding:"10px 22px",
              }}>
              {loading
                ? <><span style={{ display:"inline-block" }}>⟳</span> Procesando con Gemini…</>
                : useAI
                  ? <><Zap size={14}/> Analizar con IA</>
                  : <><Upload size={14}/> Analizar extracto</>
              }
            </button>
          </div>
        )}
      </div>

      {/* ── RESULTADO ────────────────────────────────────────── */}
      {importResult && (
        <div style={{ ...s.card, background:"rgba(34,197,94,0.06)", border:"1px solid rgba(34,197,94,0.25)" }}>
          <CheckCircle2 size={16} color="#22c55e" style={{ display:"inline", marginRight:8 }}/>
          <span style={{ color:"#22c55e", fontWeight:700 }}>{importResult.message}</span>
        </div>
      )}

      {/* ── PREVIEW ──────────────────────────────────────────── */}
      {preview.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>

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

          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
            {[
              { l:"Detectadas", v: preview.length,                       c:"#f0f0f2", e:"📊" },
              { l:"Nuevas",     v: preview.filter(t=>!t.isDup&&!t.isInternal).length,   c:"#22c55e", e:"✅" },
              { l:"Duplicadas", v: dups.length,                          c:"#f59e0b", e:"⚠️" },
              { l:"Internas",   v: internalsSelected.length,             c:"#38bdf8", e:"🔁" },
            ].map(({ l, v, c, e }) => (
              <div key={l} style={{ ...s.card, padding:"12px 14px", textAlign:"center" }}>
                <div style={{ fontSize:18, marginBottom:4 }}>{e}</div>
                <div style={{ color:c, fontSize:20, fontWeight:700 }}>{v}</div>
                <div style={{ color:"#444", fontSize:11 }}>{l}</div>
              </div>
            ))}
          </div>

          {Object.keys(periodDist).length > 0 && (
            <div style={{ ...s.card, background:"rgba(34,197,94,0.05)", border:"1px solid rgba(34,197,94,0.15)" }}>
              <p style={{ color:"#22c55e", fontSize:12, fontWeight:700, margin:"0 0 10px" }}>📅 DISTRIBUCIÓN POR MES</p>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {Object.entries(periodDist).sort().map(([p, cnt]) => (
                  <div key={p} style={{ background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:8, padding:"8px 14px", textAlign:"center" }}>
                    <div style={{ color:"#22c55e", fontWeight:700, fontSize:16 }}>{cnt}</div>
                    <div style={{ color:"#888", fontSize:11 }}>{lbl(p)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={s.card}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <span style={{ color:"#888", fontSize:13 }}>
                {toImport.length} normales
                {internalsSelected.length > 0 && ` · ${internalsSelected.length} internas`}
                {internalsInPreview.length > 0 && internalsSelected.length === 0 && (
                  <span style={{ color:"#38bdf8", marginLeft:6, fontSize:11 }}>
                    ({internalsInPreview.length} interna{internalsInPreview.length > 1 ? "s" : ""} detectada{internalsInPreview.length > 1 ? "s" : ""} — selecciónalas para incluir)
                  </span>
                )}
              </span>
              <button onClick={confirmImport} disabled={totalToSave === 0 || importing}
                style={{ ...s.btn,
                  background: totalToSave > 0 ? "linear-gradient(135deg,#22c55e,#16a34a)" : "#1a1a20",
                  color:      totalToSave > 0 ? "#fff" : "#444",
                  display:"flex", alignItems:"center", gap:6,
                }}>
                {importing ? "Guardando…" : <><CheckCircle2 size={14}/> Guardar carga ({totalToSave})</>}
              </button>
            </div>

            {/* ── ENCABEZADOS ── */}
            <div style={{
              display:"flex", alignItems:"center", gap:8,
              padding:"6px 12px", background:"#0a0a0c", borderRadius:6,
              border:"1px solid #1a1a20", marginBottom:4,
              position:"sticky", top:0, zIndex:10,
            }}>
              <span style={{ minWidth:18 }}/>
              <span style={{ color:"#333", fontSize:10, fontWeight:700, letterSpacing:"0.5px", minWidth:56, textAlign:"center" }}>PERÍODO</span>
              <span style={{ color:"#333", fontSize:10, fontWeight:700, letterSpacing:"0.5px", minWidth:78 }}>FECHA</span>
              <span style={{ color:"#333", fontSize:10, fontWeight:700, letterSpacing:"0.5px", flex:1 }}>DESCRIPCIÓN / COMERCIO</span>
              <span style={{ color:"#333", fontSize:10, fontWeight:700, letterSpacing:"0.5px", minWidth:120 }}>CATEGORÍA</span>
              <span style={{ color:"#333", fontSize:10, fontWeight:700, letterSpacing:"0.5px", minWidth:110 }}>TIPO</span>
              <span style={{ color:"#333", fontSize:10, fontWeight:700, letterSpacing:"0.5px", minWidth:80, textAlign:"right" }}>MONTO</span>
              <span style={{ color:"#333", fontSize:10, fontWeight:700, letterSpacing:"0.5px", minWidth:28 }}/>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:5, maxHeight:440, overflowY:"auto" }}>
              {preview.map((tx, i) => (
                <div key={i} style={{
                  background:"#0f0f12",
                  border:`1px solid ${tx.isInternal ? "rgba(56,189,248,0.2)" : tx.isDup ? "rgba(245,158,11,0.2)" : "#1a1a20"}`,
                  borderLeft:`3px solid ${
                    tx.excluded && !tx.isInternal ? "#2a2a30" :
                    tx.isInternal  ? "#38bdf8" :
                    tx.isDup       ? "#f59e0b" :
                    tx.confidence === "auto" ? "#22c55e" :
                    tx.confidence === "ia"   ? "#a855f7" :
                    "#444"
                  }`,
                  borderRadius:8, padding:"9px 12px",
                  opacity: tx.excluded ? 0.4 : 1, transition:"opacity .2s",
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    {/* Toggle incluir/excluir — habilitado para todos, internos inician deseleccionados */}
                    <button onClick={() => toggleExclude(i)}
                      title={tx.isInternal && tx.excluded ? "Seleccionar: requiere elegir cuenta destino" : tx.isInternal ? "Deseleccionar transferencia interna" : ""}
                      style={{ background:"none", border:"none", cursor:"pointer", fontSize:14, padding:0, color: tx.excluded ? "#444" : tx.isInternal ? "#38bdf8" : "#22c55e" }}>
                      {tx.excluded ? "○" : "●"}
                    </button>

                    {/* Período */}
                    <span style={{ color:"#38bdf8", fontSize:10, minWidth:56, textAlign:"center", background:"rgba(56,189,248,0.08)", borderRadius:4, padding:"1px 5px" }}>
                      {lbl(tx.period)}
                    </span>

                    {/* Fecha */}
                    <span style={{ color:"#444", fontSize:11, minWidth:78 }}>{tx.date}</span>

                    {/* Descripción editable inline */}
                    <div style={{ flex:1, minWidth:0, position:"relative" }}>
                      {editingDescIdx === i ? (
                        <input
                          autoFocus
                          value={tx.description}
                          onChange={e => updatePreview(i, "description", e.target.value)}
                          onBlur={() => setEditingDescIdx(null)}
                          onKeyDown={e => e.key === "Enter" && setEditingDescIdx(null)}
                          style={{
                            ...s.input,
                            padding:"2px 6px", fontSize:12, height:22,
                            background:"rgba(56,189,248,0.08)",
                            border:"1px solid rgba(56,189,248,0.35)",
                            color:"#f0f0f2",
                          }}
                        />
                      ) : (
                        <span
                          onClick={() => !tx.excluded && setEditingDescIdx(i)}
                          title={tx.rawDescription ? `Original: ${tx.rawDescription}` : tx.description}
                          style={{
                            display:"block",
                            color: tx.excluded ? "#444" : "#d0d0d8",
                            fontSize:12,
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                            cursor: tx.excluded ? "default" : "text",
                            borderBottom: tx.excluded ? "none" : "1px dashed #2a2a30",
                          }}>
                          {tx.description}
                          {tx.ruleName && tx.ruleName !== tx.description && (
                            <span style={{ color:"#22c55e", fontSize:9, marginLeft:5, opacity:0.7 }}>✓ regla</span>
                          )}
                        </span>
                      )}
                    </div>

                    {/* Categoría */}
                    <span style={{
                      color: tx.excluded ? "#333" : "#555", fontSize:11, minWidth:120,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                      background: tx.excluded ? "transparent" : "rgba(255,255,255,0.03)",
                      border: tx.excluded ? "none" : "1px solid #1e1e26",
                      borderRadius:4, padding:"1px 6px",
                    }} title={tx.category}>
                      {tx.category || "—"}
                    </span>

                    {/* Chip tipo */}
                    <Chip type={tx.type}/>

                    {/* Monto */}
                    <span style={{ color: tx.amount > 0 ? "#22c55e" : "#f87171", fontWeight:700, fontSize:13, minWidth:80, textAlign:"right" }}>
                      {tx.amount > 0 ? "+" : "-"}{fmt(tx.amount)}
                    </span>

                    {/* Badges */}
                    {tx.confidence === "ia" && (
                      <span style={{ background:"rgba(168,85,247,0.1)", color:"#a855f7", fontSize:9, padding:"1px 5px", borderRadius:3, border:"1px solid rgba(168,85,247,0.2)" }}>IA</span>
                    )}
                    {tx.isInternal && (
                      <span style={{ background:"rgba(56,189,248,0.12)", color:"#38bdf8", fontSize:9,
                        padding:"2px 6px", borderRadius:3, border:"1px solid rgba(56,189,248,0.25)",
                        fontWeight:700, letterSpacing:"0.04em" }}>
                        🔁 INTERNO
                      </span>
                    )}
                    {tx.isDup && (
                      <span style={{ background:"rgba(245,158,11,0.1)", color:"#f59e0b", fontSize:9, padding:"1px 5px", borderRadius:3, border:"1px solid rgba(245,158,11,0.2)" }}>DUP</span>
                    )}

                    {/* Selector cuenta destino (solo para transferencias internas) */}
                    {tx.isInternal && !tx.excluded && (
                      <div style={{ display:"flex", alignItems:"center", gap:5,
                        background:"rgba(56,189,248,0.08)", border:"1px solid rgba(56,189,248,0.2)",
                        borderRadius:6, padding:"3px 8px",
                      }}>
                        <ArrowRight size={11} color="#38bdf8"/>
                        <select
                          value={tx.destAssetId || ""}
                          onChange={e => setPreview(p => p.map((t,idx) => idx===i ? {...t, destAssetId: e.target.value} : t))}
                          style={{ background:"transparent", border:"none", color: tx.destAssetId ? "#38bdf8" : "#f87171",
                            fontSize:11, fontWeight:600, cursor:"pointer", outline:"none", maxWidth:120 }}
                        >
                          <option value="">destino…</option>
                          {assets
                            .filter(a => a.name !== sourceAccount)
                            .map(a => <option key={a.id} value={a.id}>{a.name}</option>)
                          }
                        </select>
                      </div>
                    )}

                    {/* Botón crear regla con IA */}
                    {onSaveRule && !tx.excluded && !tx.isInternal && (
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

                  {/* Panel de edición inline */}
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

            {preview.length > 5 && (
              <div style={{ display:"flex", justifyContent:"flex-end", marginTop:12, paddingTop:12, borderTop:"1px solid #1a1a20" }}>
                <button onClick={confirmImport} disabled={totalToSave === 0 || importing}
                  style={{ ...s.btn,
                    background: totalToSave > 0 ? "linear-gradient(135deg,#22c55e,#16a34a)" : "#1a1a20",
                    color:      totalToSave > 0 ? "#fff" : "#444",
                    display:"flex", alignItems:"center", gap:6,
                  }}>
                  {importing ? "Guardando…" : <><CheckCircle2 size={14}/> Guardar carga ({totalToSave})</>}
                </button>
              </div>
            )}
          </div>

          <div style={{ display:"flex", gap:12, flexWrap:"wrap", padding:"4px 2px" }}>
            {[
              { c:"#22c55e", l:"Clasificado por regla" },
              { c:"#a855f7", l:"Clasificado por IA" },
              { c:"#38bdf8", l:"Transferencia interna" },
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

      {/* ── MODAL CREAR REGLA ─────────────────────────────────── */}
      {ruleModal !== null && preview[ruleModal] && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ ...s.card, width:"100%", maxWidth:540, border:"1px solid rgba(168,85,247,0.35)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div>
                <span style={{ color:"#a855f7", fontWeight:700, fontSize:14 }}>⚡ Nueva regla de clasificación</span>
                <p style={{ color:"#555", fontSize:11, margin:"4px 0 0" }}>
                  Comercio: <strong style={{ color:"#d0d0d8" }}>{preview[ruleModal]?.description}</strong>
                </p>
              </div>
              <button onClick={() => setRuleModal(null)} style={{ background:"none", border:"none", color:"#444", cursor:"pointer" }}>
                <X size={15}/>
              </button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
              <div>
                <label style={s.label}>ETIQUETA</label>
                <input style={s.input} value={newRule.label}
                  onChange={e => setNewRule(x => ({ ...x, label: e.target.value }))}
                  placeholder="Ej. Colegio Gracias Jesús"/>
              </div>
              <div>
                <label style={s.label}>PATRÓN (texto o regex)</label>
                <input style={s.input} value={newRule.pattern}
                  onChange={e => setNewRule(x => ({ ...x, pattern: e.target.value }))}
                  placeholder="Ej. COLEGIO.*GRACIAS"/>
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
