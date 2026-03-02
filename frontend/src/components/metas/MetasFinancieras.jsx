/**
 * MetasFinancieras.jsx — F-04: Módulo de Metas Financieras
 * Permite crear metas de ahorro con seguimiento visual y registro de abonos.
 */
import { useState, useEffect, useCallback } from "react";
import { Plus, X, Trash2, ChevronDown, ChevronUp, Archive, CheckCircle2, Target, TrendingUp } from "lucide-react";
import { api } from "../../api.js";
import { fmt, fmtN } from "../../utils/format.js";
import { s } from "../../components/ui/shared.jsx";

// ── Paleta de colores e íconos disponibles ─────────────────────
const ICON_OPTIONS  = ["🎯","🏠","🏖️","🚗","📚","💊","🧳","💍","💻","🎓","🏋️","🏦","🌱","✈️","👶"];
const COLOR_OPTIONS = [
  "#22c55e","#38bdf8","#f59e0b","#a78bfa","#f87171",
  "#fb923c","#34d399","#60a5fa","#e879f9","#facc15",
];

// ── Helpers ────────────────────────────────────────────────────
const today = () => new Date().toISOString().split("T")[0];

function pluralMes(n) {
  if (!n || n <= 0) return "plazo vencido";
  if (n < 1) return "menos de 1 mes";
  const rounded = Math.round(n);
  return `${rounded} mes${rounded !== 1 ? "es" : ""}`;
}

function fmtDeadline(str) {
  if (!str) return "Sin fecha límite";
  const [y, m] = str.split("-");
  const meses = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${meses[parseInt(m)]} ${y}`;
}

// ── Formulario crear/editar meta ───────────────────────────────
function MetaForm({ initial, accounts = [], onSave, onCancel }) {
  const [form, setForm] = useState(initial || {
    name: "", description: "", target_amount: "",
    current_amount: 0, deadline: "", account: "",
    currency: "PEN", icon: "🎯", color: "#22c55e",
  });

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const isEdit = !!initial?.id;

  return (
    <div style={{ ...s.card, border: "1px solid rgba(34,197,94,0.3)", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 13 }}>
          {isEdit ? "✏️ Editar meta" : "🎯 Nueva meta financiera"}
        </span>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: "#444", cursor: "pointer" }}>
          <X size={15} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
        {/* Ícono y color */}
        <div style={{ gridColumn: "span 2" }}>
          <label style={s.label}>ÍCONO</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ICON_OPTIONS.map(ic => (
              <button key={ic} onClick={() => setForm(p => ({ ...p, icon: ic }))}
                style={{ fontSize: 18, padding: "4px 8px", borderRadius: 6, cursor: "pointer",
                  background: form.icon === ic ? "rgba(34,197,94,0.15)" : "#0a0a0c",
                  border: `1px solid ${form.icon === ic ? "#22c55e" : "#1a1a20"}` }}>
                {ic}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={s.label}>COLOR</label>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {COLOR_OPTIONS.map(c => (
              <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                style={{ width: 24, height: 24, borderRadius: "50%", background: c, cursor: "pointer",
                  border: form.color === c ? "3px solid #fff" : "2px solid transparent" }} />
            ))}
          </div>
        </div>

        {/* Nombre */}
        <div style={{ gridColumn: "span 2" }}>
          <label style={s.label}>NOMBRE DE LA META</label>
          <input style={s.input} placeholder="Ej. Fondo de emergencia" value={form.name} onChange={f("name")} />
        </div>

        {/* Descripción */}
        <div style={{ gridColumn: "span 2" }}>
          <label style={s.label}>DESCRIPCIÓN (opcional)</label>
          <input style={s.input} placeholder="Notas adicionales" value={form.description || ""} onChange={f("description")} />
        </div>

        {/* Monto objetivo */}
        <div>
          <label style={s.label}>MONTO OBJETIVO (S/)</label>
          <input type="number" min="1" style={s.input} placeholder="10000"
            value={form.target_amount} onChange={f("target_amount")} />
        </div>

        {/* Progreso inicial (solo al crear) */}
        {!isEdit && (
          <div>
            <label style={s.label}>PROGRESO INICIAL (S/)</label>
            <input type="number" min="0" style={s.input} placeholder="0"
              value={form.current_amount} onChange={f("current_amount")} />
          </div>
        )}

        {/* Fecha límite */}
        <div>
          <label style={s.label}>FECHA LÍMITE</label>
          <input type="date" style={s.input} value={form.deadline || ""}
            onChange={f("deadline")} min={today()} />
        </div>

        {/* Cuenta destino */}
        <div>
          <label style={s.label}>CUENTA DESTINO</label>
          {accounts.length > 0 ? (
            <select style={s.select} value={form.account || ""} onChange={f("account")}>
              <option value="">— Sin cuenta —</option>
              {accounts.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          ) : (
            <input style={s.input} placeholder="Ej. Financiera Efectiva"
              value={form.account || ""} onChange={f("account")} />
          )}
        </div>
      </div>

      <button
        onClick={() => {
          if (!form.name || !form.target_amount) return;
          onSave({
            ...form,
            target_amount:  parseFloat(form.target_amount)  || 0,
            current_amount: parseFloat(form.current_amount) || 0,
          });
        }}
        style={{ ...s.btn, background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", marginTop: 14 }}>
        {isEdit ? "Guardar cambios" : "Crear meta"}
      </button>
    </div>
  );
}

// ── Formulario de abono ────────────────────────────────────────
function AbonoForm({ goalId, color, onSave, onCancel }) {
  const [amount, setAmount] = useState("");
  const [date,   setDate]   = useState(today());
  const [note,   setNote]   = useState("");

  return (
    <div style={{ background: "#0a0a0c", border: `1px solid ${color}30`, borderRadius: 8, padding: "12px 14px", marginTop: 10 }}>
      <p style={{ color, fontSize: 12, fontWeight: 700, margin: "0 0 10px" }}>+ Registrar abono</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "0 0 110px" }}>
          <label style={s.label}>MONTO (S/)</label>
          <input type="number" min="0.01" style={s.input} placeholder="500"
            value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div style={{ flex: "0 0 140px" }}>
          <label style={s.label}>FECHA</label>
          <input type="date" style={s.input} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <label style={s.label}>NOTA (opcional)</label>
          <input style={s.input} placeholder="Ej. Ahorro de marzo" value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => {
            if (!amount || parseFloat(amount) <= 0) return;
            onSave({ amount: parseFloat(amount), date, note });
            setAmount(""); setNote("");
          }}
            style={{ ...s.btn, background: `${color}22`, color, border: `1px solid ${color}44`, fontSize: 12 }}>
            Registrar
          </button>
          <button onClick={onCancel}
            style={{ ...s.btn, background: "#111", color: "#555", border: "1px solid #1a1a20", fontSize: 12 }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tarjeta de meta individual ─────────────────────────────────
function MetaCard({ meta, accounts, onDelete, onAbono, onDeleteAbono, onEdit, onArchive, showToast }) {
  const [expanded,   setExpanded]   = useState(false);
  const [showAbono,  setShowAbono]  = useState(false);
  const [showEdit,   setShowEdit]   = useState(false);

  const { color, icon, pct_progress, remaining, monthly_needed, months_left, is_achieved, abonos } = meta;

  const barColor = is_achieved ? "#22c55e"
    : pct_progress >= 85 ? "#f59e0b"
    : color;

  return (
    <div style={{
      background: "#0f0f12",
      border: `1px solid ${is_achieved ? "#22c55e44" : "#1a1a20"}`,
      borderLeft: `4px solid ${is_achieved ? "#22c55e" : color}`,
      borderRadius: 12,
      padding: "16px 18px",
      opacity: meta.is_active ? 1 : 0.5,
    }}>
      {/* Cabecera */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 26 }}>{icon}</span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: "#d0d0d8" }}>{meta.name}</span>
              {is_achieved && (
                <span style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>
                  ✅ LOGRADA
                </span>
              )}
              {!meta.is_active && (
                <span style={{ background: "#1a1a20", color: "#555", fontSize: 10, padding: "2px 7px", borderRadius: 4 }}>
                  ARCHIVADA
                </span>
              )}
            </div>
            {meta.description && <div style={{ color: "#444", fontSize: 11, marginTop: 2 }}>{meta.description}</div>}
            {meta.account && <div style={{ color: "#333", fontSize: 11, marginTop: 1 }}>📍 {meta.account}</div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={() => setShowEdit(v => !v)} title="Editar"
            style={{ background: "none", border: "none", color: "#333", cursor: "pointer", padding: 4 }}>✏️</button>
          <button onClick={() => onArchive(meta.id)} title={meta.is_active ? "Archivar" : "Reactivar"}
            style={{ background: "none", border: "none", color: "#333", cursor: "pointer", padding: 4 }}>
            <Archive size={14} />
          </button>
          <button onClick={() => { if (window.confirm(`¿Eliminar la meta "${meta.name}"?`)) onDelete(meta.id); }}
            title="Eliminar" style={{ background: "none", border: "none", color: "#2a2a30", cursor: "pointer", padding: 4 }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Progreso */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ color: "#555", fontSize: 11 }}>Progreso</span>
          <span style={{ color: "#888", fontSize: 11 }}>
            <b style={{ color: barColor }}>{fmtN(meta.current_amount)}</b>
            <span style={{ color: "#333" }}> / {fmtN(meta.target_amount)}</span>
          </span>
        </div>
        <div style={{ background: "#0a0a0c", borderRadius: 6, height: 10, overflow: "hidden" }}>
          <div style={{
            background: is_achieved
              ? "linear-gradient(90deg,#22c55e,#16a34a)"
              : `linear-gradient(90deg,${barColor},${barColor}88)`,
            width: `${Math.min(pct_progress, 100)}%`,
            height: "100%", borderRadius: 6,
            transition: "width 0.4s ease",
            boxShadow: pct_progress >= 100 ? `0 0 10px ${barColor}60` : "none",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ color: barColor, fontSize: 12, fontWeight: 700 }}>{pct_progress.toFixed(1)}%</span>
          {!is_achieved && remaining > 0 && (
            <span style={{ color: "#444", fontSize: 11 }}>Faltan {fmtN(remaining)}</span>
          )}
        </div>
      </div>

      {/* Métricas clave */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {meta.deadline && (
          <div style={{ background: "#0a0a0c", border: "1px solid #1a1a20", borderRadius: 6, padding: "6px 10px" }}>
            <div style={{ color: "#333", fontSize: 9 }}>FECHA LÍMITE</div>
            <div style={{ color: months_left === 0 ? "#ef4444" : "#888", fontWeight: 600, fontSize: 12 }}>
              {fmtDeadline(meta.deadline)}
              {months_left !== null && <span style={{ color: "#444", fontSize: 10 }}> · {pluralMes(months_left)}</span>}
            </div>
          </div>
        )}
        {monthly_needed !== null && !is_achieved && (
          <div style={{ background: "#0a0a0c", border: "1px solid #1a1a20", borderRadius: 6, padding: "6px 10px" }}>
            <div style={{ color: "#333", fontSize: 9 }}>AHORRO MENSUAL NECESARIO</div>
            <div style={{ color, fontWeight: 700, fontSize: 13 }}>{fmtN(monthly_needed)}/mes</div>
          </div>
        )}
        {abonos && abonos.length > 0 && (
          <div style={{ background: "#0a0a0c", border: "1px solid #1a1a20", borderRadius: 6, padding: "6px 10px" }}>
            <div style={{ color: "#333", fontSize: 9 }}>ABONOS REGISTRADOS</div>
            <div style={{ color: "#888", fontWeight: 600, fontSize: 12 }}>{abonos.length} aporte{abonos.length !== 1 ? "s" : ""}</div>
          </div>
        )}
      </div>

      {/* Botón registrar abono */}
      {meta.is_active && !is_achieved && (
        <button onClick={() => setShowAbono(v => !v)}
          style={{ ...s.btn, background: `${color}15`, color, border: `1px solid ${color}33`,
            display: "flex", alignItems: "center", gap: 5, fontSize: 12, marginBottom: showAbono ? 0 : 0 }}>
          <Plus size={13} /> Registrar abono
        </button>
      )}

      {showAbono && (
        <AbonoForm goalId={meta.id} color={color}
          onSave={(data) => { onAbono(meta.id, data); setShowAbono(false); }}
          onCancel={() => setShowAbono(false)} />
      )}

      {/* Formulario edición inline */}
      {showEdit && (
        <div style={{ marginTop: 14 }}>
          <MetaForm
            initial={{ ...meta, id: meta.id }}
            accounts={accounts}
            onSave={(data) => { onEdit(meta.id, data); setShowEdit(false); }}
            onCancel={() => setShowEdit(false)}
          />
        </div>
      )}

      {/* Historial de abonos */}
      {abonos && abonos.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setExpanded(v => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#444", fontSize: 11,
              display: "flex", alignItems: "center", gap: 4 }}>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? "Ocultar" : "Ver"} historial de abonos ({abonos.length})
          </button>
          {expanded && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
              {abonos.map(ab => (
                <div key={ab.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "#0a0a0c", borderRadius: 6, padding: "7px 12px", border: "1px solid #1a1a20" }}>
                  <div>
                    <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 13 }}>+{fmtN(ab.amount)}</span>
                    {ab.note && <span style={{ color: "#444", fontSize: 11, marginLeft: 8 }}>{ab.note}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#333", fontSize: 11 }}>{ab.date}</span>
                    <button onClick={() => onDeleteAbono(meta.id, ab.id)}
                      style={{ background: "none", border: "none", color: "#2a2a30", cursor: "pointer", padding: 2 }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────
export default function MetasFinancieras({ accounts = [], income = 0 }) {
  const [metas,       setMetas]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [showArchived,setShowArchived]= useState(false);
  const [toast,       setToast]       = useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2800); };

  const loadMetas = useCallback(async () => {
    try {
      const data = await api.getMetas(true);   // incluye archivadas para el toggle
      setMetas(data);
    } catch (e) {
      showToast("Error cargando metas: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMetas(); }, [loadMetas]);

  const handleCreate = async (data) => {
    try {
      await api.createMeta(data);
      await loadMetas();
      setShowForm(false);
      showToast("✓ Meta creada");
    } catch (e) { showToast("Error: " + e.message); }
  };

  const handleEdit = async (id, data) => {
    try {
      await api.updateMeta(id, data);
      await loadMetas();
      showToast("✓ Meta actualizada");
    } catch (e) { showToast("Error: " + e.message); }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteMeta(id);
      await loadMetas();
      showToast("Meta eliminada");
    } catch (e) { showToast("Error: " + e.message); }
  };

  const handleArchive = async (id) => {
    try {
      const res = await api.archivarMeta(id);
      await loadMetas();
      showToast(res.is_active ? "✓ Meta reactivada" : "Meta archivada");
    } catch (e) { showToast("Error: " + e.message); }
  };

  const handleAbono = async (goalId, data) => {
    try {
      await api.addAbono(goalId, data);
      await loadMetas();
      showToast("✓ Abono registrado");
    } catch (e) { showToast("Error: " + e.message); }
  };

  const handleDeleteAbono = async (goalId, abonoId) => {
    try {
      await api.deleteAbono(goalId, abonoId);
      await loadMetas();
      showToast("Abono eliminado");
    } catch (e) { showToast("Error: " + e.message); }
  };

  const activeMetas   = metas.filter(m => m.is_active);
  const archivedMetas = metas.filter(m => !m.is_active);
  const achievedCount = activeMetas.filter(m => m.is_achieved).length;
  const inProgressMetas = activeMetas.filter(m => !m.is_achieved);

  // Resumen total
  const totalTarget  = activeMetas.reduce((s, m) => s + m.target_amount, 0);
  const totalCurrent = activeMetas.reduce((s, m) => s + m.current_amount, 0);
  const totalPct     = totalTarget > 0 ? (totalCurrent / totalTarget * 100) : 0;

  if (loading) return (
    <div style={{ textAlign: "center", padding: 40, color: "#444" }}>Cargando metas...</div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 20, right: 20, background: "#111113",
          border: "1px solid #22c55e", color: "#22c55e", borderRadius: 8,
          padding: "10px 18px", fontSize: 13, fontWeight: 600, zIndex: 999 }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ color: "#d0d0d8", fontSize: 16, fontWeight: 700, margin: 0 }}>
            🎯 Metas Financieras
          </h2>
          <p style={{ color: "#444", fontSize: 12, margin: "4px 0 0" }}>
            Seguimiento de objetivos de ahorro con proyección automática
          </p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          style={{ ...s.btn, background: "rgba(34,197,94,0.12)", color: "#22c55e",
            border: "1px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", gap: 5 }}>
          <Plus size={13} /> Nueva meta
        </button>
      </div>

      {/* Formulario crear */}
      {showForm && (
        <MetaForm
          accounts={accounts}
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* KPIs de resumen */}
      {activeMetas.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
          {[
            { label: "Metas activas",   value: inProgressMetas.length,    color: "#38bdf8", icon: <Target size={14} /> },
            { label: "Logradas",         value: achievedCount,             color: "#22c55e", icon: <CheckCircle2 size={14} /> },
            { label: "Total comprometido", value: fmtN(totalTarget),       color: "#f59e0b", icon: "🏆" },
            { label: "Progreso global",  value: `${totalPct.toFixed(1)}%`, color: "#a78bfa", icon: <TrendingUp size={14} /> },
          ].map(k => (
            <div key={k.label} style={{ ...s.card, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#444", fontSize: 11 }}>{k.label}</span>
                <span style={{ color: k.color }}>{k.icon}</span>
              </div>
              <div style={{ color: k.color, fontWeight: 700, fontSize: 20, marginTop: 4 }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Lista de metas activas */}
      {activeMetas.length === 0 && !showForm && (
        <div style={{ ...s.card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🎯</div>
          <p style={{ color: "#555", fontSize: 14, margin: "0 0 6px" }}>No tienes metas configuradas aún.</p>
          <p style={{ color: "#333", fontSize: 12, margin: 0 }}>
            Crea tu primera meta: fondo de emergencia, viaje, educación...
          </p>
          <button onClick={() => setShowForm(true)}
            style={{ ...s.btn, background: "rgba(34,197,94,0.12)", color: "#22c55e",
              border: "1px solid rgba(34,197,94,0.3)", marginTop: 14, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Plus size={13} /> Crear primera meta
          </button>
        </div>
      )}

      {/* Metas en progreso */}
      {inProgressMetas.map(meta => (
        <MetaCard key={meta.id} meta={meta} accounts={accounts}
          onDelete={handleDelete} onAbono={handleAbono}
          onDeleteAbono={handleDeleteAbono} onEdit={handleEdit}
          onArchive={handleArchive} showToast={showToast} />
      ))}

      {/* Metas logradas */}
      {achievedCount > 0 && (
        <div>
          <div style={{ color: "#22c55e44", fontSize: 11, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.06em", padding: "8px 0 6px", borderTop: "1px solid #1a1a20", marginTop: 4 }}>
            ✅ Logradas ({achievedCount})
          </div>
          {activeMetas.filter(m => m.is_achieved).map(meta => (
            <MetaCard key={meta.id} meta={meta} accounts={accounts}
              onDelete={handleDelete} onAbono={handleAbono}
              onDeleteAbono={handleDeleteAbono} onEdit={handleEdit}
              onArchive={handleArchive} showToast={showToast} />
          ))}
        </div>
      )}

      {/* Metas archivadas (toggle) */}
      {archivedMetas.length > 0 && (
        <div>
          <button onClick={() => setShowArchived(v => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#333",
              fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            {showArchived ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Archivadas ({archivedMetas.length})
          </button>
          {showArchived && archivedMetas.map(meta => (
            <MetaCard key={meta.id} meta={meta} accounts={accounts}
              onDelete={handleDelete} onAbono={handleAbono}
              onDeleteAbono={handleDeleteAbono} onEdit={handleEdit}
              onArchive={handleArchive} showToast={showToast} />
          ))}
        </div>
      )}
    </div>
  );
}
