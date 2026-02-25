/**
 * api.js — Capa de comunicación con el backend FastAPI
 * Todas las llamadas HTTP del frontend pasan por aquí.
 */

// ?? solo cubre null/undefined — usar || para cubrir string vacío también
const BASE = import.meta.env.VITE_API_URL || "/api";

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== null) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ─── Transactions ─────────────────────────────────────────────
export const api = {
  // GET /transactions?period=YYYY-MM
  getTransactions: (period) =>
    request("GET", `/transactions${period ? `?period=${period}` : ""}`),

  // GET /transactions/periods
  getPeriods: () =>
    request("GET", "/transactions/periods"),

  // POST /transactions
  createTransaction: (tx) =>
    request("POST", "/transactions", tx),

  // POST /transactions/import  (batch con deduplicación)
  importTransactions: (transactions) =>
    request("POST", "/transactions/import", { transactions }),

  // DELETE /transactions/:id
  deleteTransaction: (id) =>
    request("DELETE", `/transactions/${id}`),

  // DELETE /transactions/period/:period
  deletePeriod: (period) =>
    request("DELETE", `/transactions/period/${period}`),

  // ─── Budgets ─────────────────────────────────────────────────
  // GET /budgets/YYYY-MM  → { category: amount }
  getBudgets: (period) =>
    request("GET", `/budgets/${period}`),

  // PUT /budgets  { period, budgets: {cat: amount} }
  saveBudgets: (period, budgets) =>
    request("PUT", "/budgets", { period, budgets }),

  // ─── Profile ─────────────────────────────────────────────────
  getProfile: () =>
    request("GET", "/profile"),

  saveProfile: (profile) =>
    request("PUT", "/profile", profile),

  // ─── Settings ────────────────────────────────────────────────
  getSettings: () =>
    request("GET", "/settings"),

  saveSettings: (settings) =>
    request("PUT", "/settings", settings),

  // ─── Export / Backup ─────────────────────────────────────────
  exportAll: () =>
    request("GET", "/export"),

  // ─── Investments ─────────────────────────────────────────────
  getInvestments: () =>
    request("GET", "/investments"),

  createInvestment: (inv) =>
    request("POST", "/investments", inv),

  updateInvestment: (id, inv) =>
    request("PUT", `/investments/${id}`, inv),

  deleteInvestment: (id) =>
    request("DELETE", `/investments/${id}`),

  // ─── Portfolio snapshots ──────────────────────────────────────
  getSnapshots: () =>
    request("GET", "/investments/snapshots"),

  saveSnapshot: (snapshot) =>
    request("POST", "/investments/snapshots", snapshot),

  deleteSnapshot: (id) =>
    request("DELETE", `/investments/snapshots/${id}`),

  // ═══════════════════════════════════════════════════════════════
  // v3.0 — Patrimonio Consolidado
  // ═══════════════════════════════════════════════════════════════

  // GET /v3/patrimonio/consolidado
  getPatrimonioConsolidado: () =>
    request("GET", "/v3/patrimonio/consolidado"),

  // GET /v3/patrimonio/historial
  getHistorialPatrimonio: () =>
    request("GET", "/v3/patrimonio/historial"),

  // GET /v3/patrimonio/tasa-cambio
  getTasaCambio: () =>
    request("GET", "/v3/patrimonio/tasa-cambio"),

  // POST /v3/patrimonio/snapshot?asset_id=X&balance=Y&source=Z
  saveAssetSnapshot: (assetId, balance, source = "MANUAL") =>
    request("POST", `/v3/patrimonio/snapshot?asset_id=${assetId}&balance=${balance}&source=${source}`),

  // ─── v3.0: Ingesta IA ────────────────────────────────────────

  // POST /v3/ingesta/extracto  { asset_id, period, raw_text }
  ingestarExtracto: (payload) =>
    request("POST", "/v3/ingesta/extracto", payload),

  // GET /v3/ingesta/duplicados?status=PENDING
  getDuplicados: (status = "PENDING") =>
    request("GET", `/v3/ingesta/duplicados?status=${status}`),

  // POST /v3/ingesta/duplicados/:id/revisar  { action: "APPROVE"|"REJECT" }
  revisarDuplicado: (id, action) =>
    request("POST", `/v3/ingesta/duplicados/${id}/revisar`, { action }),

  // POST /v3/ingesta/duplicados/revisar-todos  { action }
  revisarTodosDuplicados: (action) =>
    request("POST", "/v3/ingesta/duplicados/revisar-todos", { action }),

  // ═══════════════════════════════════════════════════════════════
  // Métodos genéricos — compatibilidad con componentes v3
  // Permiten llamadas estilo: api.get("/v3/...") y api.post("/v3/...", body)
  // ═══════════════════════════════════════════════════════════════

  get: (path) =>
    request("GET", path),

  post: (path, body = null, opts = {}) => {
    // Soporte para params tipo axios: api.post("/ruta", null, { params: { key: val } })
    if (opts.params) {
      const qs = new URLSearchParams(opts.params).toString();
      return request("POST", `${path}?${qs}`, body);
    }
    return request("POST", path, body);
  },
};
