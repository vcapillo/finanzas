/**
 * FinanzasVH v3.0 — AssetCard.jsx
 * Estilo coherente con App.jsx (mismo sistema inline s.*)
 */
import { useState } from "react";
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

export default function AssetCard({ asset, onSnapshotSaved }) {
  const [editing,    setEditing]    = useState(false);
  const [newBalance, setNewBalance] = useState(asset.balance);
  const [saving,     setSaving]     = useState(false);

  const color = COLORS[asset.asset_type] || "#888";

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.saveAssetSnapshot(asset.asset_id, newBalance);
      setEditing(false);
      if (onSnapshotSaved) onSnapshotSaved();
    } catch {
      alert("Error al guardar el saldo. Intenta de nuevo.");
    } finally {
      setSaving(false);
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

      {/* Footer */}
      <div style={{ borderTop:"1px solid #1a1a20", paddingTop:10 }}>
        <div style={{ color:"#333", fontSize:10, marginBottom:8 }}>
          Actualizado: {new Date(asset.last_updated).toLocaleDateString("es-PE")} · {asset.source}
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)}
            style={{
              ...s.btn, width:"100%", fontSize:11,
              background:"rgba(56,189,248,0.08)", color:"#38bdf8",
              border:"1px solid rgba(56,189,248,0.2)",
            }}>
            ✏️ Actualizar saldo
          </button>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            <input type="number" step="0.01" value={newBalance}
              onChange={(e) => setNewBalance(parseFloat(e.target.value))}
              style={s.input} placeholder="Nuevo saldo"/>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
              <button onClick={() => setEditing(false)}
                style={{ ...s.btn, background:"#0a0a0c", color:"#555", border:"1px solid #2a2a30" }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ ...s.btn, background:"linear-gradient(135deg,#22c55e,#16a34a)", color:"#fff" }}>
                {saving ? "Guardando…" : "💾 Guardar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
