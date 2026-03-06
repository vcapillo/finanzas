/**
 * FinanzasOS v3.1 — AssetCard.jsx
 * Tarjeta de activo con historial de snapshots visible y eliminable.
 */
import { useState, useEffect, useCallback } from "react";
import { Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../../api.js";

const s = {
  input: { width:"100%", background:"#0a0a0c", border:"1px solid #2a2a30", color:"#f0f0f2", borderRadius:8, padding:"7px 10px", fontSize:12, boxSizing:"border-box", outline:"none" },
  btn:   { border:"none", borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:600, cursor:"pointer" },
};

const COLORS = {
  CUENTA_OPERATIVA:"#22c55e", AHORRO:"#38bdf8", FONDO_MUTUO:"#a78bfa",
  BOLSA_USA:"#f59e0b",        CRYPTO:"#fb923c", CREDITO:"#f87171",
};
const ICONS = {
  CUENTA_OPERATIVA:"🏦", AHORRO:"🏛️", FONDO_MUTUO:"📈",
  BOLSA_USA:"🇺🇸", CRYPTO:"₿", CREDITO:"💳",
};

const fmt = (amount, currency) => {
  const prefix = currency === "USD" ? "$" : "S/";
  return `${prefix} ${Number(amount).toLocaleString("es-PE", { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
};
const barColor = (pct) => pct >= 100 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#38bdf8";

const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("es-PE", { day:"2-digit", month:"2-digit", year:"numeric" })
    + " " + dt.toLocaleTimeString("es-PE", { hour:"2-digit", minute:"2-digit" });
};

export default function AssetCard({ asset, onSnapshotSaved }) {
  const [editing,       setEditing]       = useState(false);
  const [newBalance,    setNewBalance]     = useState(asset.balance);
  const [saving,        setSaving]         = useState(false);
  const [showHistory,   setShowHistory]    = useState(false);
  const [snapshots,     setSnapshots]      = useState([]);
  const [loadingSnaps,  setLoadingSnaps]   = useState(false);
  const [deletingId,    setDeletingId]     = useState(null);

  const color = COLORS[asset.asset_type] || "#888";

  // ── Cargar historial cuando se expande ──────────────────────
  const loadSnapshots = useCallback(async () => {
    setLoadingSnaps(true);
    try {
      const data = await api.getAssetSnapshots(asset.asset_id);
      setSnapshots(data);
    } catch {
      setSnapshots([]);
    } finally {
      setLoadingSnaps(false);
    }
  }, [asset.asset_id]);

  useEffect(() => {
    if (showHistory) loadSnapshots();
  }, [showHistory, loadSnapshots]);

  // ── Guardar nuevo saldo ──────────────────────────────────────
  const handleSave = async () => {
    try {
      setSaving(true);
      await api.saveAssetSnapshot(asset.asset_id, newBalance);
      setEditing(false);
      if (onSnapshotSaved) onSnapshotSaved();
      if (showHistory) loadSnapshots();
    } catch {
      alert("Error al guardar el saldo. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  // ── Eliminar snapshot ────────────────────────────────────────
  const handleDelete = async (snapId) => {
    if (!window.confirm("¿Eliminar este registro de saldo?")) return;
    setDeletingId(snapId);
    try {
      await api.deleteAssetSnapshot(snapId);
      setSnapshots(prev => prev.filter(s => s.id !== snapId));
      if (onSnapshotSaved) onSnapshotSaved(); // recalcula patrimonio
    } catch {
      alert("Error al eliminar el snapshot.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{
      background:"#0f0f12",
      border:"1px solid #1a1a20",
      borderLeft:`3px solid ${color}`,
      borderRadius:10, padding:"14px 16px",
      display:"flex", flexDirection:"column", gap:10,
    }}>

      {/* Cabecera */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ color:"#d0d0d8", fontWeight:700, fontSize:13 }}>{asset.name}</div>
          <div style={{ color:"#444", fontSize:11, marginTop:2 }}>{asset.institution}</div>
        </div>
        <span style={{
          background:`${color}1a`, color,
          border:`1px solid ${color}33`,
          borderRadius:5, padding:"2px 7px", fontSize:10, fontWeight:700,
        }}>
          {ICONS[asset.asset_type]} {asset.currency}
        </span>
      </div>

      {/* Saldo */}
      <div>
        {asset.source === "PENDIENTE" ? (
          <div style={{ color:"#f59e0b", fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
            ⚠️ Sin saldo registrado
          </div>
        ) : (
          <div style={{ color, fontSize:20, fontWeight:700 }}>
            {fmt(asset.balance, asset.currency)}
          </div>
        )}
        {asset.currency === "USD" && asset.source !== "PENDIENTE" && (
          <div style={{ color:"#555", fontSize:11, marginTop:2 }}>
            ≈ S/ {Number(asset.balance_pen).toLocaleString("es-PE", { minimumFractionDigits:2 })}
          </div>
        )}
      </div>

      {/* Meta de ahorro */}
      {asset.goal?.progress_pct != null && (
        <div style={{ background:"#0a0a0c", border:"1px solid #1a1a20", borderRadius:8, padding:"10px 12px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <span style={{ color:"#888", fontSize:11 }}>🎯 {asset.goal.label}</span>
            <span style={{ color:barColor(asset.goal.progress_pct), fontWeight:700, fontSize:12 }}>
              {asset.goal.progress_pct}%
            </span>
          </div>
          <div style={{ background:"#1a1a20", borderRadius:4, height:5, overflow:"hidden" }}>
            <div style={{
              width:`${Math.min(asset.goal.progress_pct, 100)}%`, height:"100%",
              background:barColor(asset.goal.progress_pct),
              borderRadius:4, transition:"width .3s",
            }}/>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:5 }}>
            <span style={{ color:"#444", fontSize:10 }}>
              Meta: S/ {Number(asset.goal.goal_amount).toLocaleString("es-PE")}
            </span>
            {asset.goal.deadline && (
              <span style={{ color:"#333", fontSize:10 }}>
                Plazo: {new Date(asset.goal.deadline).toLocaleDateString("es-PE")}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer: actualizar saldo + historial */}
      <div style={{ borderTop:"1px solid #1a1a20", paddingTop:10, display:"flex", flexDirection:"column", gap:8 }}>
        <div style={{ color:"#333", fontSize:10 }}>
          Actualizado: {new Date(asset.last_updated).toLocaleDateString("es-PE")} · {asset.source}
        </div>

        {/* Botones acción */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          <button onClick={() => setEditing(v => !v)}
            style={{
              ...s.btn, fontSize:11,
              background: editing ? "rgba(56,189,248,0.15)" : "rgba(56,189,248,0.08)",
              color:"#38bdf8",
              border:"1px solid rgba(56,189,248,0.2)",
            }}>
            ✏️ {editing ? "Cancelar" : "Actualizar saldo"}
          </button>
          <button
            onClick={() => setShowHistory(v => !v)}
            style={{
              ...s.btn, fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", gap:4,
              background: showHistory ? "rgba(167,139,250,0.15)" : "rgba(167,139,250,0.06)",
              color:"#a78bfa",
              border:"1px solid rgba(167,139,250,0.2)",
            }}>
            {showHistory ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
            Historial
          </button>
        </div>

        {/* Formulario nuevo saldo */}
        {editing && (
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            <input type="number" step="0.01" value={newBalance}
              onChange={(e) => setNewBalance(parseFloat(e.target.value))}
              style={s.input} placeholder="Nuevo saldo"/>
            <button onClick={handleSave} disabled={saving}
              style={{ ...s.btn, background:"linear-gradient(135deg,#22c55e,#16a34a)", color:"#fff", width:"100%" }}>
              {saving ? "Guardando…" : "💾 Guardar"}
            </button>
          </div>
        )}

        {/* Historial de snapshots */}
        {showHistory && (
          <div style={{ background:"#0a0a0c", border:"1px solid #1a1a20", borderRadius:8, overflow:"hidden" }}>
            <div style={{ padding:"8px 12px", borderBottom:"1px solid #1a1a20", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ color:"#a78bfa", fontSize:11, fontWeight:700, letterSpacing:"0.5px" }}>
                📋 HISTORIAL DE SALDOS
              </span>
              {loadingSnaps && <span style={{ color:"#444", fontSize:10 }}>cargando…</span>}
              {!loadingSnaps && <span style={{ color:"#333", fontSize:10 }}>{snapshots.length} registros</span>}
            </div>

            {snapshots.length === 0 && !loadingSnaps && (
              <div style={{ padding:"16px 12px", textAlign:"center", color:"#333", fontSize:11 }}>
                Sin registros de saldo aún.
              </div>
            )}

            <div style={{ maxHeight:220, overflowY:"auto" }}>
              {snapshots.map((snap, i) => (
                <div key={snap.id} style={{
                  display:"grid", gridTemplateColumns:"1fr auto auto", gap:8,
                  alignItems:"center", padding:"7px 12px",
                  borderBottom: i < snapshots.length - 1 ? "1px solid #111115" : "none",
                  background: i === 0 ? `${color}08` : "transparent",
                }}>
                  {/* Fecha + fuente */}
                  <div>
                    <div style={{ color: i === 0 ? color : "#888", fontSize:11, fontWeight: i === 0 ? 700 : 400 }}>
                      {fmt(snap.balance, asset.currency)}
                      {i === 0 && <span style={{ color:"#333", fontSize:9, marginLeft:5 }}>● actual</span>}
                    </div>
                    <div style={{ color:"#333", fontSize:10, marginTop:1 }}>
                      {fmtDate(snap.snapshot_date)} · {snap.source}
                    </div>
                  </div>

                  {/* Equivalente PEN si es USD */}
                  {asset.currency === "USD" ? (
                    <span style={{ color:"#444", fontSize:10 }}>
                      ≈ S/ {Number(snap.balance_pen).toLocaleString("es-PE", { minimumFractionDigits:2 })}
                    </span>
                  ) : <span/>}

                  {/* Botón eliminar */}
                  <button
                    onClick={() => handleDelete(snap.id)}
                    disabled={deletingId === snap.id}
                    title="Eliminar este registro"
                    style={{
                      background:"none", border:"none", cursor:"pointer",
                      color: deletingId === snap.id ? "#333" : "#2a2a30",
                      padding:"3px", borderRadius:4,
                      transition:"color .15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                    onMouseLeave={e => e.currentTarget.style.color = "#2a2a30"}
                  >
                    <Trash2 size={12}/>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
