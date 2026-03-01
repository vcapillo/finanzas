/**
 * FinanzasVH — utils/classify.js
 * Clasificación automática de transacciones por reglas.
 */
import { SYSTEM_RULES } from "../constants/rules.js";

export function compilePattern(p) {
  try { return new RegExp(p, "i"); } catch { return null; }
}

/**
 * autoClassify — retorna { type, category, confidence, ruleName, isInternal }
 * Primero evalúa reglas personales (customRules), luego las del sistema.
 * El account lo determina el selector de cuenta en el importador.
 */
export function autoClassify(description, amount, customRules = []) {
  for (const rule of customRules) {
    const re = compilePattern(rule.pattern);
    if (re && re.test(description)) {
      return { type: amount > 0 ? "ingreso" : rule.type, category: rule.category, confidence: "auto", ruleName: rule.label || "", isInternal: rule.isInternal || false };
    }
  }
  for (const rule of SYSTEM_RULES) {
    const re = compilePattern(rule.pattern);
    if (re && re.test(description)) {
      return { type: amount > 0 ? "ingreso" : rule.type, category: rule.category, confidence: "auto", ruleName: rule.label || "", isInternal: rule.isInternal || false };
    }
  }
  if (amount > 0)            return { type: "ingreso",        category: "Otro ingreso",  confidence: "manual", ruleName: "", isInternal: false };
  if (Math.abs(amount) >= 500) return { type: "gasto_fijo",   category: "Otro fijo",     confidence: "manual", ruleName: "", isInternal: false };
  return                          { type: "gasto_variable",   category: "Otro variable", confidence: "manual", ruleName: "", isInternal: false };
}
