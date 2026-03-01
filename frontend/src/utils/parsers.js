/**
 * FinanzasVH — utils/parsers.js
 * Parsers de extractos bancarios: texto plano y CSV.
 */
import { autoClassify } from "./classify.js";

export function parseStatementText(rawText, bankHint = "auto") {
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
        if (pat === datePatterns[2]) { y = d; mo = mo; d = y.slice(-2); }
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
      const d2 = parseFloat(deb.replace(/,/g,"")), h = parseFloat(hab.replace(/,/g,""));
      description = desc.trim(); amount = h > 0 ? h : -d2;
    } else {
      const s = rest.match(/^(.+?)\s+S?\/?\s*(-?[\d,\.]+)\s*$/);
      if (s) {
        const [, desc, amtStr] = s;
        description = desc.trim(); amount = parseFloat(amtStr.replace(/,/g,""));
        if (bankHint === "BBVA" && !/(INGRESO|CREDITO|ABONO|SUELDO|REMUNER)/i.test(description)) amount = -Math.abs(amount);
      }
    }
    if (!amount || isNaN(amount) || description.length < 3) continue;
    const period = isoDate.substring(0, 7);
    results.push({ date: isoDate, period, description, amount, ...autoClassify(description, amount), source: "import_text" });
  }
  return results;
}

export function parseCSV(text, bankHint = "auto") {
  const lines = text.split(/\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/"/g,""));
  const colMap = {};
  headers.forEach((h, i) => {
    if (/fecha|date/i.test(h))                             colMap.date   = i;
    if (/descripci|operaci|concepto|detail|desc/i.test(h)) colMap.desc   = i;
    if (/monto|importe|amount|valor/i.test(h) && !colMap.amount) colMap.amount = i;
    if (/cargo|debito|debe|debit/i.test(h))                colMap.debit  = i;
    if (/abono|credito|haber|credit/i.test(h))             colMap.credit = i;
  });
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/"/g,""));
    const dateRaw = colMap.date !== undefined ? cols[colMap.date] : "";
    const desc    = colMap.desc !== undefined ? cols[colMap.desc] : cols[1] || "";
    let amount = 0;
    if (colMap.debit !== undefined || colMap.credit !== undefined) {
      const deb  = parseFloat((cols[colMap.debit]  || "0").replace(/[,\s]/g,"")) || 0;
      const cred = parseFloat((cols[colMap.credit] || "0").replace(/[,\s]/g,"")) || 0;
      amount = cred > 0 ? cred : -deb;
    } else if (colMap.amount !== undefined) {
      amount = parseFloat((cols[colMap.amount] || "0").replace(/[,\s]/g,"")) || 0;
      if (bankHint === "BBVA" && !/(INGRESO|CREDITO|ABONO|SUELDO)/i.test(desc)) amount = -Math.abs(amount);
    }
    if (!dateRaw || isNaN(amount) || !desc) continue;
    let isoDate = dateRaw;
    const dm = dateRaw.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})/);
    if (dm) { const [,d,m,y] = dm; isoDate = `${y.length===2?"20"+y:y}-${m}-${d}`; }
    results.push({ date:isoDate, period:isoDate.substring(0,7), description:desc, amount, ...autoClassify(desc,amount), source:"import_csv" });
  }
  return results;
}
