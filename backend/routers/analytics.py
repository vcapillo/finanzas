# ============================================================
# FinanzasVH v3.1 — routers/analytics.py
# Métricas financieras reales respetando excluir_del_analisis
# ============================================================

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from database import get_db
from models import Transaction, Budget

router = APIRouter(prefix="/v3/analytics", tags=["Analytics v3"])


# ── HELPERS ──────────────────────────────────────────────────

def _txs_activas(db: Session, period: str):
    """Transacciones del período que SÍ afectan el análisis."""
    return (
        db.query(Transaction)
        .filter(
            Transaction.period == period,
            Transaction.excluir_del_analisis == False,
        )
        .all()
    )


def _semaforo(tasa_ahorro: float, ratio_deuda: float) -> dict:
    """
    Calcula el semáforo de salud financiera.
    🟢 Saludable  🟡 En observación  🔴 Requiere acción
    """
    if tasa_ahorro >= 15 and ratio_deuda <= 30:
        color = "🟢"
        estado = "Saludable"
        mensaje = "Tus finanzas están en buen rumbo. Mantén la disciplina."
    elif tasa_ahorro >= 5 and ratio_deuda <= 50:
        color = "🟡"
        estado = "En observación"
        mensaje = "Hay margen de mejora. Revisa gastos variables y acelera el ahorro."
    else:
        color = "🔴"
        estado = "Requiere acción"
        mensaje = "Atención: bajo ahorro o alta deuda. Prioriza reordenar el flujo de caja."
    return {"color": color, "estado": estado, "mensaje": mensaje}


# ── GET: Resumen del período ──────────────────────────────────

@router.get("/resumen/{period}")
def resumen_periodo(
    period: str,
    db: Session = Depends(get_db),
):
    """
    Métricas completas de un período YYYY-MM.
    Excluye automáticamente movimientos internos del cálculo.
    """
    txs = _txs_activas(db, period)

    if not txs:
        return {
            "period": period,
            "sin_datos": True,
            "mensaje": f"No hay transacciones activas para {period}.",
        }

    # ── Totales por tipo ─────────────────────────────────────
    total_ingresos    = sum(t.amount for t in txs if t.type == "ingreso" and t.amount > 0)
    total_gasto_fijo  = sum(abs(t.amount) for t in txs if t.type == "gasto_fijo")
    total_gasto_var   = sum(abs(t.amount) for t in txs if t.type == "gasto_variable")
    total_deuda       = sum(abs(t.amount) for t in txs if t.type == "deuda")
    total_ahorro      = sum(abs(t.amount) for t in txs if t.type == "ahorro")
    total_gastos      = total_gasto_fijo + total_gasto_var + total_deuda

    saldo_neto        = total_ingresos - total_gastos - total_ahorro

    # ── Indicadores clave ────────────────────────────────────
    tasa_ahorro  = round((total_ahorro / total_ingresos * 100), 1) if total_ingresos > 0 else 0.0
    ratio_deuda  = round((total_deuda  / total_ingresos * 100), 1) if total_ingresos > 0 else 0.0

    # ── Desglose por categoría ───────────────────────────────
    categorias: dict = {}
    for t in txs:
        if t.type in ("gasto_fijo", "gasto_variable", "deuda"):
            cat = t.category or "Sin categoría"
            categorias[cat] = round(categorias.get(cat, 0) + abs(t.amount), 2)

    categorias_ordenadas = sorted(categorias.items(), key=lambda x: x[1], reverse=True)

    # ── Presupuesto vs real ──────────────────────────────────
    budgets = db.query(Budget).filter(Budget.period == period).all()
    budget_map = {b.category: b.amount for b in budgets}
    presupuesto_vs_real = []
    for cat, gastado in categorias_ordenadas:
        presupuestado = budget_map.get(cat)
        presupuesto_vs_real.append({
            "categoria":     cat,
            "gastado":       gastado,
            "presupuestado": presupuestado,
            "diferencia":    round(presupuestado - gastado, 2) if presupuestado else None,
            "estado":        (
                "🔴 Excedido"   if presupuestado and gastado > presupuestado else
                "🟡 Al límite"  if presupuestado and gastado > presupuestado * 0.85 else
                "🟢 OK"         if presupuestado else
                "⚪ Sin presupuesto"
            ),
        })

    # ── Semáforo ─────────────────────────────────────────────
    semaforo = _semaforo(tasa_ahorro, ratio_deuda)

    # ── Recomendaciones ──────────────────────────────────────
    recomendaciones = []

    if tasa_ahorro < 10:
        recomendaciones.append({
            "prioridad": 1,
            "accion": "Aumenta tu tasa de ahorro",
            "detalle": f"Actualmente ahorras el {tasa_ahorro}% de tus ingresos. Lo ideal es superar el 15%. Considera automatizar S/{round(total_ingresos * 0.15 - total_ahorro, 0):.0f} adicionales a Agora.",
        })

    if ratio_deuda > 30:
        recomendaciones.append({
            "prioridad": 2,
            "accion": "Reduce el ratio de deuda",
            "detalle": f"Tu deuda representa el {ratio_deuda}% de tus ingresos. Lo recomendable es estar por debajo del 30%.",
        })

    excedidos = [p for p in presupuesto_vs_real if p["estado"] == "🔴 Excedido"]
    if excedidos:
        cats_excedidas = ", ".join(e["categoria"] for e in excedidos[:3])
        recomendaciones.append({
            "prioridad": 3,
            "accion": "Categorías con presupuesto excedido",
            "detalle": f"Revisita tus gastos en: {cats_excedidas}.",
        })

    if not recomendaciones:
        recomendaciones.append({
            "prioridad": 1,
            "accion": "Mantén el rumbo",
            "detalle": "Tus métricas están dentro de rangos saludables. Sigue registrando tus movimientos para mantener visibilidad.",
        })

    # ── Conteo de transacciones ──────────────────────────────
    total_txs = len(txs)
    txs_excluidas = (
        db.query(func.count(Transaction.id))
        .filter(Transaction.period == period, Transaction.excluir_del_analisis == True)
        .scalar()
    ) or 0

    return {
        "period":              period,
        "sin_datos":           False,
        "resumen": {
            "total_ingresos":   round(total_ingresos, 2),
            "total_gasto_fijo": round(total_gasto_fijo, 2),
            "total_gasto_var":  round(total_gasto_var, 2),
            "total_deuda":      round(total_deuda, 2),
            "total_ahorro":     round(total_ahorro, 2),
            "total_gastos":     round(total_gastos, 2),
            "saldo_neto":       round(saldo_neto, 2),
        },
        "indicadores": {
            "tasa_ahorro_pct":  tasa_ahorro,
            "ratio_deuda_pct":  ratio_deuda,
            "gasto_fijo_pct":   round(total_gasto_fijo / total_ingresos * 100, 1) if total_ingresos > 0 else 0,
            "gasto_var_pct":    round(total_gasto_var  / total_ingresos * 100, 1) if total_ingresos > 0 else 0,
        },
        "semaforo":            semaforo,
        "categorias":          presupuesto_vs_real,
        "recomendaciones":     sorted(recomendaciones, key=lambda x: x["prioridad"]),
        "meta": {
            "txs_analizadas":  total_txs,
            "txs_excluidas":   txs_excluidas,
            "nota":            f"{txs_excluidas} movimientos internos excluidos del cálculo.",
        },
    }


# ── GET: Comparativa entre períodos ──────────────────────────

@router.get("/comparativa")
def comparativa_periodos(
    periodo_actual:   str = Query(..., description="Ej: 2025-12"),
    periodo_anterior: str = Query(..., description="Ej: 2025-11"),
    db: Session = Depends(get_db),
):
    """Compara ingresos, gastos y ahorro entre dos períodos."""

    def _totales(period: str):
        txs = _txs_activas(db, period)
        return {
            "ingresos": round(sum(t.amount for t in txs if t.type == "ingreso" and t.amount > 0), 2),
            "gastos":   round(sum(abs(t.amount) for t in txs if t.type in ("gasto_fijo","gasto_variable","deuda")), 2),
            "ahorro":   round(sum(abs(t.amount) for t in txs if t.type == "ahorro"), 2),
        }

    actual   = _totales(periodo_actual)
    anterior = _totales(periodo_anterior)

    def _variacion(nuevo, viejo):
        if viejo == 0:
            return None
        return round(((nuevo - viejo) / viejo) * 100, 1)

    return {
        "periodo_actual":   {"period": periodo_actual,   **actual},
        "periodo_anterior": {"period": periodo_anterior, **anterior},
        "variaciones": {
            "ingresos_pct": _variacion(actual["ingresos"], anterior["ingresos"]),
            "gastos_pct":   _variacion(actual["gastos"],   anterior["gastos"]),
            "ahorro_pct":   _variacion(actual["ahorro"],   anterior["ahorro"]),
        },
    }
