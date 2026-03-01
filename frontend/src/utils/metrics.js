/**
 * FinanzasVH — utils/metrics.js
 * Cálculo de indicadores de salud financiera.
 */

export function calcMetrics(txs, fallbackIncome = 0) {
  // Excluir movimientos internos (transferencias entre cuentas propias)
  const active         = txs.filter(t => !t.excluir_del_analisis);
  const ingresos       = active.filter(t => t.type === "ingreso").reduce((s, t) => s + t.amount, 0) || fallbackIncome;
  const gastosFijos    = active.filter(t => t.type === "gasto_fijo").reduce((s, t) => s + Math.abs(t.amount), 0);
  const gastosVariables= active.filter(t => t.type === "gasto_variable").reduce((s, t) => s + Math.abs(t.amount), 0);
  const deudas         = active.filter(t => t.type === "deuda").reduce((s, t) => s + Math.abs(t.amount), 0);
  const ahorros        = active.filter(t => t.type === "ahorro").reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalGastos    = gastosFijos + gastosVariables + deudas + ahorros;
  const saldoNeto      = ingresos - totalGastos;
  return {
    ingresos, gastosFijos, gastosVariables, deudas, ahorros, totalGastos, saldoNeto,
    tasaAhorro: (ahorros / ingresos) * 100,
    ratioDeuda: (deudas / ingresos) * 100,
  };
}

export function getHealth(m) {
  const score =
    (m.tasaAhorro >= 10 ? 2 : m.tasaAhorro >= 5 ? 1 : 0) +
    (m.ratioDeuda <= 25 ? 2 : m.ratioDeuda <= 35 ? 1 : 0) +
    (m.saldoNeto >= 0 ? 2 : 0);
  return score >= 5 ? "green" : score >= 3 ? "yellow" : "red";
}

export const HEALTH = {
  green:  { icon: "🟢", label: "Saludable",      color: "#22c55e" },
  yellow: { icon: "🟡", label: "Observación",    color: "#f59e0b" },
  red:    { icon: "🔴", label: "Acción urgente", color: "#ef4444" },
};
