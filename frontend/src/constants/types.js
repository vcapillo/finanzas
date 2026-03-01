/**
 * FinanzasVH — constants/types.js
 * Tipos de movimiento, cuentas y categorías por defecto.
 */

export const TYPE_CONFIG = {
  ingreso:        { label:"💰 Ingreso",        color:"#22c55e", bg:"rgba(34,197,94,0.1)",   border:"rgba(34,197,94,0.25)"  },
  gasto_fijo:     { label:"🏠 Gasto Fijo",     color:"#f59e0b", bg:"rgba(245,158,11,0.1)",  border:"rgba(245,158,11,0.25)" },
  gasto_variable: { label:"🛒 Gasto Variable",  color:"#f87171", bg:"rgba(248,113,113,0.1)", border:"rgba(248,113,113,0.25)"},
  deuda:          { label:"💳 Deuda/Cuota",    color:"#a78bfa", bg:"rgba(167,139,250,0.1)", border:"rgba(167,139,250,0.25)"},
  ahorro:         { label:"🏦 Ahorro",         color:"#38bdf8", bg:"rgba(56,189,248,0.1)",  border:"rgba(56,189,248,0.25)" },
};

// Paleta extendida — colores distintos por categoría individual
export const CAT_PALETTE = [
  "#22c55e","#f59e0b","#f87171","#38bdf8","#a78bfa",
  "#fb923c","#34d399","#e879f9","#facc15","#60a5fa",
  "#f472b6","#4ade80","#fbbf24","#a3e635","#c084fc",
  "#2dd4bf","#fb7185","#818cf8","#fdba74","#86efac",
];
const _catColorCache = {};
let   _catColorIdx   = 0;
export const getCatColor = (cat, type) => {
  if (_catColorCache[cat]) return _catColorCache[cat];
  if (type==="ingreso") return (_catColorCache[cat]="#22c55e");
  if (type==="ahorro")  return (_catColorCache[cat]="#38bdf8");
  const color = CAT_PALETTE[_catColorIdx % CAT_PALETTE.length];
  _catColorIdx++;
  _catColorCache[cat] = color;
  return color;
};

export const ACCOUNT_TYPES = {
  banco:     { label:"Banco",      icon:"🏦" },
  billetera: { label:"Billetera",  icon:"📱" },
  tarjeta:   { label:"Tarjeta",    icon:"💳" },
  ahorro:    { label:"Ahorro",     icon:"💰" },
  efectivo:  { label:"Efectivo",   icon:"💵" },
  inversion: { label:"Inversión",  icon:"📈" },
};

export const DEFAULT_ACCOUNTS = [];

export const DEFAULT_CATEGORIES = {
  ingreso:        ["Sueldo","Honorarios","Transferencia recibida","Gratificación","CTS","Otro ingreso"],
  gasto_fijo:     ["Alquiler","Luz","Agua","Gas","Internet/Cable","Seguros","Suscripciones","Educación","Otro fijo"],
  gasto_variable: ["Alimentación","Transporte/Gasolina","Salud/Farmacia","Ropa","Ocio","Compras online","Restaurante","Otro variable"],
  deuda:          ["Préstamo","Cuota diferida","Tarjeta de crédito","Otra deuda"],
  ahorro:         ["Ahorro programado","Inversión","Fondo emergencia","Otro ahorro"],
};
