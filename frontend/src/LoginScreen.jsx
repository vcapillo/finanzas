/**
 * FinanzasVH — LoginScreen.jsx
 * Login con credenciales en duro · Estilo dark theme consistente con App.jsx
 */
import { useState, useEffect, useRef } from "react";

// ── Credenciales (cambiar aquí cuando se implemente auth real) ──
const CREDENTIALS = [
  { username: "vcapillo",   password: "1Ej*32$h6am2fX" },
  { username: "jennifer", password: "finanzasjvh"  },
];

const SESSION_KEY = "finanzas_vh_auth";

// ── Estilos reutilizables (mismo sistema que App.jsx) ────────────
const s = {
  input: {
    width: "100%",
    background: "#0a0a0c",
    border: "1px solid #2a2a30",
    color: "#f0f0f2",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 14,
    boxSizing: "border-box",
    outline: "none",
    fontFamily: "'DM Mono','Courier New',monospace",
    transition: "border-color .2s",
  },
  label: {
    color: "#666670",
    fontSize: 11,
    fontWeight: 600,
    display: "block",
    marginBottom: 6,
    letterSpacing: "0.6px",
  },
  btn: {
    border: "none",
    borderRadius: 8,
    padding: "11px 20px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'DM Mono','Courier New',monospace",
    transition: "opacity .15s, transform .1s",
  },
};

// ── Hook de sesión ───────────────────────────────────────────────
export function useAuth() {
  const [authed, setAuthed] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });

  const login = (user, pass) => {
    const match = CREDENTIALS.find(
      (c) => c.username === user.trim().toLowerCase() && c.password === pass
    );
    if (match) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setAuthed(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setAuthed(false);
  };

  return { authed, login, logout };
}

// ── Componente LoginScreen ───────────────────────────────────────
export default function LoginScreen({ onLogin }) {
  const [user,    setUser]    = useState("");
  const [pass,    setPass]    = useState("");
  const [showPw,  setShowPw]  = useState(false);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [dots,    setDots]    = useState(0);          // animación "..."
  const userRef = useRef(null);

  // Foco automático al campo usuario
  useEffect(() => { userRef.current?.focus(); }, []);

  // Animación de puntos en el botón mientras carga
  useEffect(() => {
    if (!loading) return;
    const iv = setInterval(() => setDots(d => (d + 1) % 4), 350);
    return () => clearInterval(iv);
  }, [loading]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!user.trim() || !pass) {
      setError("Completa usuario y contraseña.");
      return;
    }
    setLoading(true);
    setError("");

    // Pequeño delay para que se vea el estado de carga
    await new Promise(r => setTimeout(r, 480));

    const ok = onLogin(user, pass);
    if (!ok) {
      setError("Usuario o contraseña incorrectos.");
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div
      style={{
        background: "#080809",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Mono','Courier New',monospace",
        padding: 20,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Fondo decorativo — grid sutil */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(34,197,94,0.03) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(34,197,94,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          pointerEvents: "none",
        }}
      />

      {/* Glows decorativos */}
      <div
        style={{
          position: "absolute",
          top: "15%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 400,
          height: 400,
          background: "radial-gradient(circle, rgba(34,197,94,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "10%",
          right: "10%",
          width: 280,
          height: 280,
          background: "radial-gradient(circle, rgba(56,189,248,0.04) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Card de login */}
      <div
        style={{
          background: "#0d0d10",
          border: "1px solid #1e1e26",
          borderRadius: 16,
          padding: "40px 36px",
          width: "100%",
          maxWidth: 400,
          position: "relative",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Línea de acento superior */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "60%",
            height: 2,
            background: "linear-gradient(90deg, transparent, #22c55e, transparent)",
            borderRadius: "0 0 4px 4px",
          }}
        />

        {/* Logo / Brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg,#22c55e,#16a34a)",
              borderRadius: 14,
              width: 52,
              height: 52,
              fontSize: 26,
              marginBottom: 14,
              boxShadow: "0 4px 20px rgba(34,197,94,0.3)",
            }}
          >
            💼
          </div>
          <div style={{ color: "#f0f0f2", fontWeight: 700, fontSize: 18, letterSpacing: "-0.3px" }}>
            FinanzasVH{" "}
            <span
              style={{
                background: "rgba(34,197,94,0.15)",
                color: "#22c55e",
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 4,
                fontWeight: 700,
                letterSpacing: "0.5px",
                verticalAlign: "middle",
              }}
            >
              v3.0
            </span>
          </div>
          <p style={{ color: "#444", fontSize: 12, margin: "6px 0 0", letterSpacing: "0.3px" }}>
            Sistema de gestión financiera personal
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} autoComplete="off" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Usuario */}
          <div>
            <label style={s.label}>USUARIO</label>
            <input
              ref={userRef}
              type="text"
              autoComplete="username"
              placeholder="Ingresa tu usuario"
              value={user}
              onChange={e => { setUser(e.target.value); setError(""); }}
              onKeyDown={handleKeyDown}
              style={{
                ...s.input,
                borderColor: error && !user ? "#ef4444" : user ? "rgba(34,197,94,0.4)" : "#2a2a30",
              }}
            />
          </div>

          {/* Contraseña */}
          <div>
            <label style={s.label}>CONTRASEÑA</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={pass}
                onChange={e => { setPass(e.target.value); setError(""); }}
                onKeyDown={handleKeyDown}
                style={{
                  ...s.input,
                  paddingRight: 44,
                  borderColor: error && !pass ? "#ef4444" : pass ? "rgba(34,197,94,0.4)" : "#2a2a30",
                }}
              />
              {/* Toggle mostrar/ocultar contraseña */}
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#444",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                  padding: 4,
                }}
                title={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: 8,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 14 }}>⚠️</span>
              <span style={{ color: "#f87171", fontSize: 12, fontWeight: 500 }}>{error}</span>
            </div>
          )}

          {/* Botón ingresar */}
          <button
            type="submit"
            disabled={loading}
            style={{
              ...s.btn,
              background: loading
                ? "rgba(34,197,94,0.3)"
                : "linear-gradient(135deg,#22c55e,#16a34a)",
              color: "#fff",
              width: "100%",
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: loading ? 0.8 : 1,
              boxShadow: loading ? "none" : "0 4px 16px rgba(34,197,94,0.25)",
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = "0.9"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
          >
            {loading ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    width: 14,
                    height: 14,
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
                Verificando{"·".repeat(dots)}
              </>
            ) : (
              <>🔐 Ingresar al sistema</>
            )}
          </button>
        </form>

        {/* Footer */}
        <p
          style={{
            color: "#2a2a30",
            fontSize: 10,
            textAlign: "center",
            marginTop: 28,
            letterSpacing: "0.3px",
          }}
        >
          Acceso restringido · Solo uso personal
        </p>
      </div>

      {/* Animación CSS inline para el spinner */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
