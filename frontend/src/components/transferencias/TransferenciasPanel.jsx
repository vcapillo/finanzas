// ═══════════════════════════════════════════════════════════════
// FinanzasVH v3.1 — TransferenciasPanel.jsx
// OBS-02: Registro de transferencias internas entre cuentas
//         con movimiento espejo automático (excluido del análisis)
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, RefreshCw, ArrowRight, Info, X } from "lucide-react";
import { api } from "../../api.js";

// ── Estilos compartidos ──────────────────────────────────────
const s = {
  card: {
    background: "#0f0f12",
    border: "1px solid #1a1a20",
    borderRadius: 10,
    padding: 16,
  },
  label: {
    display: "block",
    color: "#444",
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 5,
  },
  input: {
    width: "100%",
    background: "#0a0a0c",
    border: "1px solid #1a1a20",
    borderRadius: 6,
    color: "#d0d0d8",
    fontSize: 13,
    padding: "8px 10px",
    boxSizing: "border-box",
    outline: "none",
  },
  select: {
    width: "100%",
    background: "#0a0a0c",
    border: "1px solid #1a1a20",
    borderRadius: 6,
    color: "#d0d0d8",
    fontSize: 13,
    padding: "8px 10px",
    boxSizing: "border-box",
    outline: "none",
  },
  btn: {
    border: "1px solid #1a1a20",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
    padding: "7px 14px",
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  },
};

const fmt = (n) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Math.abs(n));

// ── Componente principal ─────────────────────────────────────
// Props: currentPeriod (YYYY-MM) para filtrar historial, onTransferCreated para refresh
export default function TransferenciasPanel({ currentPeriod, onTransferCreated }) {
  const [assets, setAssets]           = useState([]);   // cuentas disponibles
  const [transfers, setTransfers]     = useState([]);   // historial
  const [loading, setLoading]         = useState(false);
  const [loadingTx, setLoadingTx]     = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [toast, setToast]             = useState(null);
  const [error, setError]             = useState(null);

  // Formulario nueva transferencia
  const FORM_INIT = {
    source_asset_id: "",
    dest_asset_id:   "",
    amount:          "",
    currency:        "PEN",
    transfer_date:   new Date().toISOString().slice(0, 10),
    notes:           "",
  };
  const [form, setForm] = useState(FORM_INIT);

  // ── Carga inicial ─────────────────────────────────────────
  const loadAssets = useCallback(async () => {
    try {
      const data = await api.getAssets();
      // Filtrar solo activos tipo cuenta/billetera/ahorro (no inversiones externas)
      setAssets(data || []);
    } catch (e) {
      console.error("Error cargando activos:", e);
      setAssets([]);
    }
  }, []);

  const loadTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTransferencias();
      const all = Array.isArray(data) ? data : [];
      // FIX: filtrar por período activo si se recibió currentPeriod
      const filtered = currentPeriod
        ? all.filter(t => t.transfer_date && t.transfer_date.startsWith(currentPeriod))
        : all;
      setTransfers(filtered);
    } catch (e) {
      console.error("Error cargando transferencias:", e);
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, [currentPeriod]);

  useEffect(() => {
    loadAssets();
    loadTransfers();
  }, [loadAssets, loadTransfers]);

  // ── Toast helper ──────────────────────────────────────────
  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Crear transferencia ───────────────────────────────────
  const handleSubmit = async () => {
    setError(null);
    if (!form.source_asset_id) return setError("Selecciona la cuenta origen.");
    if (!form.dest_asset_id)   return setError("Selecciona la cuenta destino.");
    if (form.source_asset_id === form.dest_asset_id)
      return setError("Origen y destino deben ser distintos.");
    if (!form.amount || parseFloat(form.amount) <= 0)
      return setError("Ingresa un monto válido mayor a 0.");
    if (!form.transfer_date)   return setError("Selecciona la fecha.");

    setLoadingTx(true);
    try {
      await api.crearTransferencia({
        source_asset_id: parseInt(form.source_asset_id),
        dest_asset_id:   parseInt(form.dest_asset_id),
        amount:          parseFloat(form.amount),
        currency:        form.currency,
        transfer_date:   form.transfer_date,
        notes:           form.notes,
      });
      showToast("✅ Transferencia registrada. Ambos movimientos excluidos del análisis.");
      setForm(FORM_INIT);
      setShowForm(false);
      loadTransfers();
      // FIX: notificar a App.jsx para refrescar Lista de movimientos
      if (onTransferCreated) onTransferCreated();
    } catch (e) {
      const msg = e?.detail || e?.message || "Error al registrar la transferencia.";
      showToast(`❌ ${msg}`, false);
    } finally {
      setLoadingTx(false);
    }
  };

  // ── Eliminar transferencia ────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar esta transferencia y sus movimientos asociados?")) return;
    try {
      await api.eliminarTransferencia(id);
      showToast("🗑️ Transferencia eliminada.");
      loadTransfers();
      // FIX: refrescar Lista de movimientos en App.jsx
      if (onTransferCreated) onTransferCreated();
    } catch (e) {
      showToast("❌ No se pudo eliminar.", false);
    }
  };

  // ── Nombre de activo por ID ───────────────────────────────
  const assetName = (id) => {
    const a = assets.find((x) => x.id === parseInt(id));
    return a ? a.name : `Cuenta #${id}`;
  };

  // ═════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ color: "#f0f0f2", margin: 0, fontSize: 15, fontWeight: 700 }}>
            🔁 Transferencias Internas
          </h3>
          <p style={{ color: "#444", fontSize: 11, margin: "3px 0 0" }}>
            Movimientos entre tus propias cuentas — no afectan el análisis financiero
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={loadTransfers}
            style={{ ...s.btn, background: "#0a0a0c", color: "#555" }}
            title="Actualizar"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setError(null); }}
            style={{
              ...s.btn,
              background: showForm ? "rgba(248,113,113,0.12)" : "rgba(34,197,94,0.12)",
              color: showForm ? "#f87171" : "#22c55e",
              border: `1px solid ${showForm ? "rgba(248,113,113,0.3)" : "rgba(34,197,94,0.3)"}`,
            }}
          >
            {showForm ? <><X size={13} /> Cancelar</> : <><Plus size={13} /> Nueva transferencia</>}
          </button>
        </div>
      </div>

      {/* ── Aviso informativo ── */}
      <div style={{
        background: "rgba(56,189,248,0.05)",
        border: "1px solid rgba(56,189,248,0.15)",
        borderRadius: 8,
        padding: "10px 14px",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}>
        <Info size={14} color="#38bdf8" style={{ marginTop: 1, flexShrink: 0 }} />
        <div>
          <p style={{ color: "#38bdf8", fontSize: 12, fontWeight: 600, margin: "0 0 2px" }}>
            ¿Cómo funciona?
          </p>
          <p style={{ color: "#555", fontSize: 11, margin: 0, lineHeight: 1.5 }}>
            Al registrar una transferencia, el sistema crea automáticamente <strong style={{ color: "#888" }}>dos movimientos espejo</strong>:
            un egreso en la cuenta origen y un ingreso en la cuenta destino, ambos marcados como
            <strong style={{ color: "#888" }}> "Movimiento interno"</strong> y excluidos del cálculo de
            ingresos, gastos y saldo neto del Dashboard.
          </p>
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          background: toast.ok ? "rgba(34,197,94,0.12)" : "rgba(248,113,113,0.12)",
          border: `1px solid ${toast.ok ? "rgba(34,197,94,0.3)" : "rgba(248,113,113,0.3)"}`,
          borderRadius: 8,
          padding: "10px 14px",
          color: toast.ok ? "#22c55e" : "#f87171",
          fontSize: 12,
          fontWeight: 600,
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── Formulario nueva transferencia ── */}
      {showForm && (
        <div style={{ ...s.card, border: "1px solid rgba(34,197,94,0.25)" }}>
          <p style={{ color: "#22c55e", fontWeight: 700, fontSize: 13, margin: "0 0 14px" }}>
            + Registrar transferencia interna
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            {/* Cuenta origen */}
            <div>
              <label style={s.label}>Cuenta origen</label>
              <select
                style={s.select}
                value={form.source_asset_id}
                onChange={(e) => setForm((f) => ({ ...f, source_asset_id: e.target.value }))}
              >
                <option value="">— Selecciona cuenta —</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            {/* Cuenta destino */}
            <div>
              <label style={s.label}>Cuenta destino</label>
              <select
                style={s.select}
                value={form.dest_asset_id}
                onChange={(e) => setForm((f) => ({ ...f, dest_asset_id: e.target.value }))}
              >
                <option value="">— Selecciona cuenta —</option>
                {assets
                  .filter((a) => a.id !== parseInt(form.source_asset_id))
                  .map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
              </select>
            </div>

            {/* Monto */}
            <div>
              <label style={s.label}>Monto</label>
              <div style={{ display: "flex", gap: 6 }}>
                <select
                  style={{ ...s.select, width: 75, flexShrink: 0 }}
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                >
                  <option value="PEN">S/</option>
                  <option value="USD">USD</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  style={s.input}
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
            </div>

            {/* Fecha */}
            <div>
              <label style={s.label}>Fecha</label>
              <input
                type="date"
                style={s.input}
                value={form.transfer_date}
                onChange={(e) => setForm((f) => ({ ...f, transfer_date: e.target.value }))}
              />
            </div>

            {/* Notas (full width) */}
            <div style={{ gridColumn: "span 2" }}>
              <label style={s.label}>Notas (opcional)</label>
              <input
                placeholder="Ej. Fondos para pago de servicios"
                style={s.input}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          {/* Preview del movimiento espejo */}
          {form.source_asset_id && form.dest_asset_id && parseFloat(form.amount) > 0 && (
            <div style={{
              background: "#0a0a0c",
              border: "1px solid #1a1a20",
              borderRadius: 8,
              padding: 12,
              marginBottom: 12,
            }}>
              <p style={{ color: "#444", fontSize: 10, fontWeight: 700, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Vista previa — movimientos que se crearán
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{
                  background: "#0f0f12",
                  borderLeft: "3px solid #f87171",
                  borderRadius: 6,
                  padding: "7px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <div>
                    <span style={{ color: "#888", fontSize: 11 }}>Egreso</span>
                    <span style={{ color: "#555", fontSize: 11 }}> · {assetName(form.source_asset_id)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>
                      Movimiento interno
                    </span>
                    <span style={{ color: "#f87171", fontWeight: 700, fontSize: 13 }}>
                      -{form.currency === "PEN" ? "S/" : "$"} {parseFloat(form.amount || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <ArrowRight size={13} color="#333" />
                </div>
                <div style={{
                  background: "#0f0f12",
                  borderLeft: "3px solid #22c55e",
                  borderRadius: 6,
                  padding: "7px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <div>
                    <span style={{ color: "#888", fontSize: 11 }}>Ingreso</span>
                    <span style={{ color: "#555", fontSize: 11 }}> · {assetName(form.dest_asset_id)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>
                      Movimiento interno
                    </span>
                    <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 13 }}>
                      +{form.currency === "PEN" ? "S/" : "$"} {parseFloat(form.amount || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              <p style={{ color: "#333", fontSize: 10, margin: "8px 0 0", textAlign: "center" }}>
                ✓ Ambos movimientos quedarán excluidos del análisis — el saldo neto no se verá afectado
              </p>
            </div>
          )}

          {error && (
            <p style={{ color: "#f87171", fontSize: 12, margin: "0 0 10px" }}>⚠️ {error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loadingTx}
            style={{
              ...s.btn,
              background: loadingTx ? "#1a1a20" : "linear-gradient(135deg,#22c55e,#16a34a)",
              color: loadingTx ? "#555" : "#fff",
              border: "none",
              padding: "9px 20px",
              fontSize: 13,
            }}
          >
            {loadingTx ? "Registrando..." : "✓ Registrar transferencia"}
          </button>
        </div>
      )}

      {/* ── Historial de transferencias ── */}
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <p style={{ color: "#888", fontSize: 12, fontWeight: 600, margin: 0 }}>
            Historial de transferencias internas
          </p>
          <span style={{ color: "#333", fontSize: 11 }}>
            {transfers.length} registro{transfers.length !== 1 ? "s" : ""}
            {currentPeriod && <span style={{ color: "#222", marginLeft: 6 }}>· {currentPeriod}</span>}
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: "#333", padding: 24, fontSize: 12 }}>
            Cargando...
          </div>
        ) : transfers.length === 0 ? (
          <div style={{
            textAlign: "center",
            color: "#2a2a30",
            padding: 32,
            border: "1px dashed #1a1a20",
            borderRadius: 8,
          }}>
            <p style={{ margin: 0, fontSize: 12 }}>No hay transferencias registradas</p>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#222" }}>
              Usa "Nueva transferencia" para registrar un movimiento entre cuentas
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Cabecera */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "90px 1fr 40px 1fr 90px 80px 36px",
              gap: 8,
              padding: "4px 10px",
              alignItems: "center",
            }}>
              {["Fecha", "Origen", "", "Destino", "Monto", "Divisa", ""].map((h, i) => (
                <span key={i} style={{ color: "#333", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {h}
                </span>
              ))}
            </div>

            {transfers.map((t) => (
              <div
                key={t.id}
                style={{
                  background: "#0a0a0c",
                  border: "1px solid #1a1a20",
                  borderRadius: 8,
                  padding: "10px 10px",
                  display: "grid",
                  gridTemplateColumns: "90px 1fr 40px 1fr 90px 80px 36px",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                {/* Fecha */}
                <span style={{ color: "#555", fontSize: 11 }}>
                  {t.transfer_date}
                </span>

                {/* Origen */}
                <div>
                  <span style={{ color: "#d0d0d8", fontSize: 12, fontWeight: 600 }}>{t.source_name}</span>
                  {t.notes && (
                    <span style={{ color: "#333", fontSize: 10, display: "block" }}>{t.notes}</span>
                  )}
                </div>

                {/* Flecha */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <ArrowRight size={14} color="#444" />
                </div>

                {/* Destino */}
                <span style={{ color: "#d0d0d8", fontSize: 12, fontWeight: 600 }}>{t.dest_name}</span>

                {/* Monto */}
                <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 13 }}>
                  {t.currency === "PEN" ? "S/" : "$"} {parseFloat(t.amount).toFixed(2)}
                </span>

                {/* Badge excluido */}
                <span style={{
                  background: "rgba(56,189,248,0.08)",
                  color: "#38bdf8",
                  fontSize: 9,
                  padding: "2px 7px",
                  borderRadius: 4,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                }}>
                  interno ✓
                </span>

                {/* Eliminar */}
                <button
                  onClick={() => handleDelete(t.id)}
                  style={{ background: "none", border: "none", color: "#2a2a30", cursor: "pointer", padding: 4 }}
                  title="Eliminar transferencia"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
