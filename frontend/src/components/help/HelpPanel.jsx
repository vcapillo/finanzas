/**
 * FinanzasVH — HelpPanel.jsx (OBS-03)
 * Panel lateral de ayuda e documentación integrada.
 * Se abre desde el botón "?" en la barra de navegación superior.
 */

import { useState } from "react";
import { X, HelpCircle } from "lucide-react";

const s = {
  overlay: {
    position:"fixed", inset:0, background:"rgba(0,0,0,0.55)",
    zIndex:9998, backdropFilter:"blur(2px)",
  },
  drawer: {
    position:"fixed", top:0, right:0, bottom:0, width:420,
    background:"#0e0e14", borderLeft:"1px solid #1e1e28",
    zIndex:9999, display:"flex", flexDirection:"column",
    boxShadow:"-8px 0 32px rgba(0,0,0,0.5)",
  },
  header: {
    padding:"18px 20px 14px",
    borderBottom:"1px solid #1a1a22",
    display:"flex", justifyContent:"space-between", alignItems:"center",
    flexShrink:0,
  },
  tab: (active) => ({
    padding:"7px 12px", fontSize:11, fontWeight:active?700:400,
    color:active?"#22c55e":"#555",
    background:"transparent", border:"none",
    borderBottom:active?"2px solid #22c55e":"2px solid transparent",
    cursor:"pointer", whiteSpace:"nowrap",
  }),
  section: {
    padding:"14px 20px",
    borderBottom:"1px solid #111116",
  },
  h2: { color:"#f0f0f2", fontSize:13, fontWeight:700, marginBottom:7, marginTop:0 },
  h3: { color:"#a0a0b0", fontSize:11, fontWeight:700, marginBottom:5, marginTop:0, textTransform:"uppercase", letterSpacing:"0.05em" },
  p: { color:"#888", fontSize:12, lineHeight:1.65, margin:0 },
  badge: (color) => ({
    display:"inline-block", padding:"2px 7px", borderRadius:4,
    background:`rgba(${color},0.12)`, color:`rgb(${color})`,
    fontSize:10, fontWeight:700, marginRight:4,
  }),
  table: { width:"100%", borderCollapse:"collapse", fontSize:11 },
  th: { color:"#555", fontWeight:600, textAlign:"left", padding:"5px 6px", borderBottom:"1px solid #1a1a22" },
  td: { color:"#888", padding:"5px 6px", borderBottom:"1px solid #0d0d11", verticalAlign:"top" },
};

// ── Datos ────────────────────────────────────────────────────

const TIPOS_MOV = [
  { key:"\uD83D\uDCB0 Ingreso",       color:"34,197,94",   def:"Entrada de dinero: sueldo MINEDU, honorarios, transferencias recibidas desde fuera del sistema.", ej:"Haberes MINEDU, reintegros, pagos de clientes." },
  { key:"\uD83C\uDFE0 Gasto Fijo",    color:"245,158,11",  def:"Gasto de monto estable y recurrente que se paga cada mes sin importar el uso. Difícil de reducir a corto plazo.", ej:"Luz del Sur, Movistar Internet, colegio Camila, Apple iCloud." },
  { key:"\uD83D\uDED2 Gasto Variable",color:"248,113,113", def:"Gasto que cambia de monto período a período según el consumo o decisión. Área de mayor control y ahorro potencial.", ej:"Supermercado, restaurantes, farmacia, transporte Uber, ropa." },
  { key:"\uD83D\uDCB3 Deuda/Cuota",   color:"167,139,250", def:"Pago de obligación de crédito ya contraída. El bien o servicio fue consumido antes; ahora se devuelve el crédito. Se excluye del gasto real y se usa para calcular el ratio deuda/ingreso.", ej:"Pago tarjeta BBVA (BM. PAGO TARJETA D...), cuota préstamo, pago mínimo iO Crédito." },
  { key:"\uD83C\uDFE6 Ahorro",        color:"56,189,248",  def:"Dinero apartado o invertido para crecimiento o reserva. Se registra cuando el dinero sale de la cuenta operativa hacia ahorro o inversión.", ej:"Transferencia a Financiera Efectiva, depósito a Binance." },
];

const MODULOS = [
  { icon:"\uD83D\uDCCA", name:"Dashboard",              desc:"Panel principal. Resumen mensual con indicadores clave: ingresos, gastos, saldo neto, tasa de ahorro y ratio deuda/ingreso. El semáforo 🟢🟡🔴 refleja la salud financiera del período activo seleccionado en la parte superior derecha." },
  { icon:"\uD83D\uDCCB", name:"Movimientos",            desc:"Registro central de todas las transacciones. Permite agregar movimientos manuales, buscar por descripción o monto, filtrar por tipo y eliminar registros individuales. El sub-tab 'Transferencias' gestiona movimientos entre cuentas propias." },
  { icon:"\uD83D\uDCE5", name:"Importar / Ingesta IA",  desc:"Carga masiva desde extractos bancarios en texto pegado, CSV, PDF o Excel. Toggle 'Usar IA' para clasificación automática con Gemini. Revisa, ajusta y confirma cada transacción antes de guardar." },
  { icon:"\uD83C\uDFAF", name:"Presupuesto",            desc:"Define metas de gasto por categoría y hace seguimiento mensual. La barra de progreso muestra el % ejecutado vs. planificado. Alerta visual en rojo al superar el umbral configurado." },
  { icon:"\uD83D\uDCC5", name:"Calendario",             desc:"Eventos financieros del mes: cortes de tarjeta, vencimientos, servicios recurrentes y cobro de sueldo. Codificado por color según tipo. Resumen de próximos vencimientos en la parte superior." },
  { icon:"\uD83D\uDCC8", name:"Inversiones",            desc:"Portfolio crypto (CoinGecko) y acciones US (Yahoo Finance). Muestra P&L por activo, posiciones consolidadas por ticker con PPP (precio promedio ponderado) y snapshots históricos para graficar evolución." },
  { icon:"\uD83C\uDFE6", name:"Patrimonio",             desc:"Patrimonio neto = Activos (cuentas + ahorro + inversiones) − Pasivos (tarjetas de crédito). Vista consolidada de toda tu riqueza neta con evolución histórica mes a mes." },
  { icon:"\u2699\uFE0F", name:"Configuración",          desc:"Perfil de usuario (sueldo, día de cobro, servicios recurrentes), cuentas, reglas de clasificación (29 personales + 31 sistema), ciclos de facturación de tarjetas y categorías personalizadas." },
];

const TRANSFERENCIAS = [
  { escenario:"BBVA → BCP (cuenta propia)",    accion:"Usa el sub-tab 🔁 Transferencias dentro de Movimientos. Genera automáticamente el par de movimientos espejo excluidos del análisis de gastos." },
  { escenario:"YAPE → Jennifer (hogar)",        accion:"Registrar como Gasto Variable, categoría 'Hogar (Jennifer)'. No es transferencia interna: el dinero sale del sistema hacia un tercero." },
  { escenario:"Depósito a ahorro",              accion:"Registrar como tipo Ahorro desde la cuenta origen (BBVA). El saldo en Financiera Efectiva se refleja en el módulo Patrimonio." },
  { escenario:"Ingreso desde cuenta propia",    accion:"Al crear la transferencia interna, el sistema genera automáticamente el Ingreso en la cuenta destino. No registrar manualmente." },
];

const INDICADORES = [
  { ind:"Tasa de ahorro",         formula:"(Ahorro / Ingreso) × 100",           meta:"≥ 20%",    semaforo:"🟢 ≥20 | 🟡 10-20 | 🔴 <10" },
  { ind:"Ratio deuda/ingreso",    formula:"(Deuda mensual / Ingreso) × 100",    meta:"< 30%",    semaforo:"🟢 <20 | 🟡 20-30 | 🔴 >30" },
  { ind:"Saldo neto mensual",     formula:"Ingresos − Gastos totales",           meta:"> 0",      semaforo:"🟢 positivo | 🔴 negativo" },
  { ind:"Cobertura emergencia",   formula:"Ahorro total / Gasto mensual prom.", meta:"≥ 3 meses",semaforo:"🟢 ≥3 | 🟡 1-3 | 🔴 <1" },
  { ind:"Rendimiento portafolio", formula:"(Valor actual − Costo) / Costo",     meta:"> 0%",     semaforo:"🟢 >5% | 🟡 0-5 | 🔴 negativo" },
  { ind:"Cumplimiento presupuesto",formula:"Categ. dentro / Total categ.",      meta:"≥ 80%",    semaforo:"🟢 ≥80 | 🟡 60-80 | 🔴 <60" },
];

const GLOSARIO = [
  { t:"Saldo Neto",              d:"Resultado de restar todos los egresos del total de ingresos del período. Si es negativo: gastas más de lo que ingresas." },
  { t:"Tasa de Ahorro",          d:"Porcentaje del ingreso mensual destinado a ahorro o inversión. Meta óptima ≥ 20%." },
  { t:"Ratio Deuda/Ingreso",     d:"Proporción de los ingresos comprometidos en pagos de deuda. Debe mantenerse por debajo del 30%." },
  { t:"PPP",                     d:"Precio Promedio Ponderado. Fórmula: ∑(cantidad × precio_compra) / ∑cantidad. Se usa en Inversiones para consolidar múltiples compras del mismo activo." },
  { t:"Snapshot",                d:"Fotografía del estado del portafolio de inversiones en una fecha específica. Permite graficar la evolución histórica." },
  { t:"Ingesta IA",              d:"Proceso de carga y clasificación automática de transacciones vía Google Gemini. Las reglas existentes tienen prioridad; la IA solo clasifica lo que no tiene regla." },
  { t:"Regla de clasificación",  d:"Patrón de texto (simple o regex) que identifica automáticamente el tipo y categoría de una transacción por su descripción en el extracto bancario." },
  { t:"Ciclo de facturación",    d:"Período entre la fecha de corte y el vencimiento de pago de una tarjeta. VISA BBVA: corte 10, vence 5. VISA iO: corte 25, vence 12." },
  { t:"Patrimonio Neto",         d:"Total de activos (cuentas operativas + ahorro + inversiones) menos total de pasivos (saldo deudor tarjetas de crédito)." },
  { t:"Transferencia interna",   d:"Movimiento de dinero entre dos cuentas propias. Se excluye del análisis de gastos para evitar doble contabilización." },
  { t:"Gasto Variable",          d:"Gasto que varía período a período. Representa el área de mayor potencial de optimización y ahorro." },
  { t:"Gasto Fijo",              d:"Gasto de monto estable y recurrente. Generalmente difícil de reducir a corto plazo (servicios, suscripciones, cuotas fijas)." },
];

// ── Componente ───────────────────────────────────────────────

export default function HelpPanel({ onClose }) {
  const [activeTab, setActiveTab] = useState("guia");

  const TABS = [
    {id:"guia",     label:"📖 Guía"},
    {id:"tipos",    label:"🏷️ Tipos"},
    {id:"trans",    label:"🔁 Transf."},
    {id:"ind",      label:"📊 Indicadores"},
    {id:"glosario", label:"📚 Glosario"},
  ];

  return (
    <>
      <div style={s.overlay} onClick={onClose}/>
      <div style={s.drawer}>

        {/* Header */}
        <div style={s.header}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <HelpCircle size={16} color="#22c55e"/>
            <span style={{color:"#f0f0f2",fontWeight:700,fontSize:14}}>Centro de Ayuda</span>
            <span style={{fontSize:10,color:"#333",background:"#1a1a22",padding:"2px 6px",borderRadius:4}}>FinanzasVH v3.0</span>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#555",cursor:"pointer",padding:2,display:"flex"}}>
            <X size={16}/>
          </button>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",borderBottom:"1px solid #1a1a22",padding:"0 8px",overflowX:"auto",flexShrink:0,background:"#0c0c0f"}}>
          {TABS.map(t=>(
            <button key={t.id} style={s.tab(activeTab===t.id)} onClick={()=>setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body scrollable */}
        <div style={{flex:1,overflowY:"auto"}}>

          {/* ── GUÍA RÁPIDA ── */}
          {activeTab==="guia" && (
            <div>
              {MODULOS.map(m=>(
                <div key={m.name} style={s.section}>
                  <h2 style={{...s.h2,display:"flex",alignItems:"center",gap:7}}>
                    <span style={{fontSize:15}}>{m.icon}</span>{m.name}
                  </h2>
                  <p style={s.p}>{m.desc}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── TIPOS DE MOVIMIENTO ── */}
          {activeTab==="tipos" && (
            <div>
              <div style={{...s.section,background:"rgba(34,197,94,0.03)"}}>
                <p style={{...s.p,color:"#444",fontSize:11}}>El tipo determina cómo se clasifica el movimiento en los indicadores y qué se incluye o excluye del cálculo de gastos reales.</p>
              </div>
              {TIPOS_MOV.map(t=>(
                <div key={t.key} style={s.section}>
                  <h2 style={s.h2}><span style={s.badge(t.color)}>{t.key}</span></h2>
                  <p style={{...s.p,marginBottom:6}}>{t.def}</p>
                  <p style={{...s.p,color:"#555",fontSize:11}}><strong style={{color:"#444"}}>Ej:</strong> {t.ej}</p>
                </div>
              ))}
              <div style={{...s.section,background:"rgba(167,139,250,0.04)"}}>
                <h3 style={s.h3}>⚡ Regla clave: Deuda ≠ Gasto Fijo</h3>
                <p style={s.p}>
                  <strong style={{color:"#c4b5fd"}}>Gasto Fijo</strong> = pagas por un servicio activo este mes (luz, internet, colegio).<br/>
                  <strong style={{color:"#c4b5fd"}}>Deuda/Cuota</strong> = pagas algo que ya consumiste antes (tarjeta de crédito, préstamo).<br/>
                  <span style={{color:"#555",fontSize:11}}>Separar ambos permite calcular correctamente el ratio deuda/ingreso del Dashboard.</span>
                </p>
              </div>
            </div>
          )}

          {/* ── TRANSFERENCIAS ── */}
          {activeTab==="trans" && (
            <div>
              <div style={{...s.section,background:"rgba(56,189,248,0.04)"}}>
                <h2 style={s.h2}>Cómo registrar transferencias</h2>
                <p style={s.p}>Las transferencias entre cuentas propias deben gestionarse con el módulo de Transferencias (🔁) para que se genere el movimiento espejo y queden excluidas del análisis de gastos.</p>
              </div>
              {TRANSFERENCIAS.map((t,i)=>(
                <div key={i} style={s.section}>
                  <h3 style={{...s.h3,color:"#38bdf8",textTransform:"none",fontSize:12,letterSpacing:0}}>{t.escenario}</h3>
                  <p style={s.p}>{t.accion}</p>
                </div>
              ))}
              <div style={{...s.section,background:"rgba(239,68,68,0.04)"}}>
                <h3 style={{...s.h3,color:"#f87171"}}>⚠️ Error frecuente</h3>
                <p style={s.p}>Registrar una transferencia interna como "Gasto Variable" <strong style={{color:"#f87171"}}>infla artificialmente</strong> los gastos del mes y distorsiona la tasa de ahorro. Usa siempre el módulo de Transferencias (🔁) para movimientos entre tus cuentas propias.</p>
              </div>
            </div>
          )}

          {/* ── INDICADORES ── */}
          {activeTab==="ind" && (
            <div>
              <div style={s.section}>
                <h2 style={s.h2}>Indicadores clave del sistema</h2>
                <p style={s.p}>El semáforo del Dashboard combina estos indicadores para el diagnóstico mensual. Puedes ver cada uno en las tarjetas de resumen del panel principal.</p>
              </div>
              <div style={{padding:"0 20px 16px"}}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Indicador</th>
                      <th style={s.th}>Meta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {INDICADORES.map(ind=>(
                      <tr key={ind.ind}>
                        <td style={{...s.td,color:"#c4b5fd",fontWeight:600}}>{ind.ind}</td>
                        <td style={{...s.td,color:"#22c55e"}}>{ind.meta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {INDICADORES.map(ind=>(
                <div key={ind.ind} style={s.section}>
                  <h3 style={{...s.h3,color:"#a0a0b0"}}>{ind.ind}</h3>
                  <p style={{...s.p,fontSize:11,color:"#555",fontFamily:"monospace"}}>{ind.formula}</p>
                  <p style={{...s.p,fontSize:11,marginTop:4}}>{ind.semaforo}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── GLOSARIO ── */}
          {activeTab==="glosario" && (
            <div>
              {GLOSARIO.map(item=>(
                <div key={item.t} style={s.section}>
                  <h3 style={{...s.h3,color:"#e0e0f0",textTransform:"none",letterSpacing:0,fontSize:12,fontWeight:700}}>{item.t}</h3>
                  <p style={s.p}>{item.d}</p>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{padding:"10px 20px",borderTop:"1px solid #111118",flexShrink:0,background:"#0c0c0f"}}>
          <p style={{...s.p,fontSize:10,textAlign:"center",color:"#2a2a32",margin:0}}>
            FinanzasVH v3.0 · Victor Hugo Capillo · 2026
          </p>
        </div>

      </div>
    </>
  );
}
