/**
 * FinanzasVH v3.0 — NetWorthChart.jsx
 * Estilo coherente con App.jsx — mismo tooltip TTip y colores
 */
import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { api } from "../../api.js";

// Mismo tooltip que TTip en App.jsx pero adaptado para este chart
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background:"#ffffff", border:"1px solid #e2e8f0",
      borderRadius:10, padding:"10px 16px",
      boxShadow:"0 4px 20px rgba(0,0,0,0.35)", minWidth:150,
    }}>
      {label && (
        <p style={{ color:"#475569", fontSize:11, fontWeight:600, margin:"0 0 6px", letterSpacing:"0.3px" }}>
          {label}
        </p>
      )}
      {payload.map((p, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:7, marginTop: i > 0 ? 4 : 0 }}>
          <span style={{ width:10, height:10, borderRadius:3, background:p.color || "#64748b", display:"inline-block", flexShrink:0 }}/>
          <span style={{ color:"#334155", fontSize:12 }}>{p.name}:</span>
          <span style={{ color:"#0f172a", fontSize:13, fontWeight:700, marginLeft:"auto", paddingLeft:8 }}>
            S/ {Number(p.value).toLocaleString("es-PE", { minimumFractionDigits:2, maximumFractionDigits:2 })}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function NetWorthChart() {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getHistorialPatrimonio()
      .then((res) => {
        const formatted = (Array.isArray(res) ? res : []).map((d) => ({
          ...d,
          fecha: new Date(d.fecha).toLocaleDateString("es-PE", {
            month:"short", year:"2-digit",
          }),
        }));
        setData(formatted);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ textAlign:"center", padding:"24px 0", color:"#444", fontSize:12 }}>
      Cargando historial…
    </div>
  );

  if (!data.length) return (
    <div style={{
      background:"#0a0a0c", border:"1px dashed #1a1a20",
      borderRadius:10, padding:24, textAlign:"center",
    }}>
      <p style={{ color:"#444", fontSize:13, margin:"0 0 6px" }}>📭 Sin datos históricos aún</p>
      <p style={{ color:"#333", fontSize:11, margin:0 }}>
        Actualiza el saldo de cada cuenta desde las tarjetas para comenzar a ver la evolución.
      </p>
    </div>
  );

  const initialValue = data[0]?.patrimonio_pen;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top:4, right:8, left:0, bottom:0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a20"/>
        <XAxis
          dataKey="fecha"
          tick={{ fill:"#555", fontSize:10 }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`}
          tick={{ fill:"#444", fontSize:10 }}
          axisLine={false} tickLine={false} width={52}
        />
        <Tooltip content={<CustomTooltip/>}/>
        {initialValue && (
          <ReferenceLine y={initialValue} stroke="#2a2a30" strokeDasharray="4 4"/>
        )}
        <Line
          type="monotone" dataKey="patrimonio_pen" name="Patrimonio S/"
          stroke="#22c55e" strokeWidth={2}
          dot={{ fill:"#22c55e", r:3 }} activeDot={{ r:5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
