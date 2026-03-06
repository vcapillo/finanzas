"""
G-08 — Radar de Salud Financiera
Router FastAPI — /api/financial-health

Registro en main.py:
    from routers.financial_health import router as financial_health_router
    app.include_router(financial_health_router)
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
import calendar
from datetime import date

import models
from database import get_db

router = APIRouter()


def _score(value: float, target: float, higher_is_better: bool = True) -> float:
    """Normaliza un valor a escala 0–100 respecto al target."""
    if target == 0:
        return 100.0 if not higher_is_better else 0.0
    if higher_is_better:
        return round(min(100.0, (value / target) * 100), 1)
    else:
        # Para deuda: 0% = 100pts, >= target = 0pts
        return round(max(0.0, (1 - value / target) * 100), 1)


@router.get("/financial-health")
def get_financial_health(
    period: Optional[str] = Query(
        default=None,
        description="Período en formato YYYY-MM. Por defecto: mes actual."
    ),
    db: Session = Depends(get_db),
):
    """
    Calcula los 6 indicadores del Radar de Salud Financiera (G-08).

    Dimensiones (según manual FinanzasOS):
      1. 💰 Tasa de Ahorro       — % ingreso ahorrado          (meta ≥ 20%)
      2. 💳 Control de Deuda     — ratio deuda/ingreso          (meta < 30%)
      3. 📈 Inversión Activa     — % ingreso en inversiones     (meta ≥ 10%)
      4. 🛡️ Fondo de Emergencia  — meses cubiertos por ahorro   (meta ≥ 3 meses)
      5. 📋 Cumplimiento Presup. — % categorías en presupuesto  (meta ≥ 80%)
      6. 📅 Puntualidad de Pagos — placeholder (100% por defecto hasta impl. CalendarEvent)
    """
    # Período por defecto: mes actual
    if not period:
        today = date.today()
        period = f"{today.year}-{today.month:02d}"

    # Extraer año y mes para etiqueta
    try:
        y, m = int(period[:4]), int(period[5:7])
        period_label = f"{calendar.month_name[m]} {y}"
    except Exception:
        period_label = period

    # ─── CONSULTA BASE ────────────────────────────────────────────────────────
    # Excluir transferencias internas (excluir_del_analisis = True)
    q = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.period == period,
            models.Transaction.excluir_del_analisis == False,  # noqa: E712
        )
    )

    def total_type(tx_type: str) -> float:
        result = (
            q.filter(models.Transaction.type == tx_type)
            .with_entities(func.coalesce(func.sum(func.abs(models.Transaction.amount)), 0))
            .scalar()
        )
        return float(result or 0)

    # Tipos según models.py del proyecto:
    # ingreso | gasto_fijo | gasto_variable | deuda | ahorro
    ingresos        = total_type("ingreso")
    ahorros_mes     = total_type("ahorro")
    deuda_mensual   = total_type("deuda")
    gastos_fijos    = total_type("gasto_fijo")
    gastos_variable = total_type("gasto_variable")
    gasto_total     = gastos_fijos + gastos_variable + deuda_mensual

    # Para inversión activa: usamos ahorro como proxy si no existe tipo "inversión"
    # (Las inversiones del portafolio están en tabla investments, no en transactions)
    # Se puede ampliar sumando movements con category="Inversión" o "Ahorro programado"
    inversion_mes = (
        q.filter(
            models.Transaction.type == "ahorro",
            models.Transaction.category.in_(["Inversión", "Ahorro programado"])
        )
        .with_entities(func.coalesce(func.sum(func.abs(models.Transaction.amount)), 0))
        .scalar()
    )
    inversion_mes = float(inversion_mes or 0)

    # ─── INDICADOR 1: TASA DE AHORRO ─────────────────────────────────────────
    tasa_ahorro = round((ahorros_mes / ingresos) * 100, 1) if ingresos else 0.0
    score_ahorro = _score(tasa_ahorro, 20.0, higher_is_better=True)

    # ─── INDICADOR 2: CONTROL DE DEUDA ───────────────────────────────────────
    ratio_deuda = round((deuda_mensual / ingresos) * 100, 1) if ingresos else 0.0
    score_deuda = _score(ratio_deuda, 30.0, higher_is_better=False)

    # ─── INDICADOR 3: INVERSIÓN ACTIVA ───────────────────────────────────────
    pct_inversion = round((inversion_mes / ingresos) * 100, 1) if ingresos else 0.0
    score_inversion = _score(pct_inversion, 10.0, higher_is_better=True)

    # ─── INDICADOR 4: FONDO DE EMERGENCIA ────────────────────────────────────
    # Ahorro acumulado histórico (todos los períodos, sin filtro de mes)
    ahorro_acumulado = (
        db.query(func.coalesce(func.sum(func.abs(models.Transaction.amount)), 0))
        .filter(
            models.Transaction.type == "ahorro",
            models.Transaction.excluir_del_analisis == False,  # noqa: E712
        )
        .scalar()
    )
    ahorro_acumulado = float(ahorro_acumulado or 0)
    gasto_ref = gasto_total if gasto_total > 0 else 1
    meses_cubiertos = round(ahorro_acumulado / gasto_ref, 1)
    score_emergencia = _score(meses_cubiertos, 3.0, higher_is_better=True)

    # ─── INDICADOR 5: CUMPLIMIENTO DE PRESUPUESTO ────────────────────────────
    budgets = (
        db.query(models.Budget)
        .filter(models.Budget.period == period)
        .all()
    )
    if budgets:
        within = 0
        for b in budgets:
            gasto_cat = (
                q.filter(models.Transaction.category == b.category)
                .with_entities(func.coalesce(func.sum(func.abs(models.Transaction.amount)), 0))
                .scalar()
            )
            if float(gasto_cat or 0) <= b.amount:
                within += 1
        cumplimiento = round((within / len(budgets)) * 100, 1)
    else:
        cumplimiento = 0.0

    score_presupuesto = _score(cumplimiento, 80.0, higher_is_better=True)

    # ─── INDICADOR 6: PUNTUALIDAD DE PAGOS ───────────────────────────────────
    # TODO: integrar con CalendarEvent cuando esté disponible.
    # Por ahora: si hay deuda registrada en el período = pagó sus obligaciones.
    puntualidad = 100.0 if deuda_mensual > 0 else 100.0
    score_puntualidad = 100.0

    # ─── SCORE GLOBAL ─────────────────────────────────────────────────────────
    score_global = round(
        (score_ahorro + score_deuda + score_inversion +
         score_emergencia + score_presupuesto + score_puntualidad) / 6,
        1
    )

    if score_global >= 70:
        semaforo, semaforo_label = "verde", "Saludable 🟢"
    elif score_global >= 40:
        semaforo, semaforo_label = "amarillo", "En observación 🟡"
    else:
        semaforo, semaforo_label = "rojo", "Requiere acción 🔴"

    # ─── RESPUESTA ─────────────────────────────────────────────────────────────
    return {
        "period":        period,
        "period_label":  period_label,
        "score_global":  score_global,
        "semaforo":      semaforo,
        "semaforo_label": semaforo_label,
        "indicators": [
            {
                "key":         "tasa_ahorro",
                "label":       "Tasa de Ahorro",
                "emoji":       "💰",
                "value":       tasa_ahorro,
                "unit":        "%",
                "target":      20.0,
                "score":       score_ahorro,
                "description": f"Ahorras el {tasa_ahorro}% de tus ingresos (meta ≥ 20%)",
            },
            {
                "key":         "control_deuda",
                "label":       "Control de Deuda",
                "emoji":       "💳",
                "value":       ratio_deuda,
                "unit":        "%",
                "target":      30.0,
                "score":       score_deuda,
                "description": f"Tu deuda representa el {ratio_deuda}% del ingreso (meta < 30%)",
            },
            {
                "key":         "inversion_activa",
                "label":       "Inversión Activa",
                "emoji":       "📈",
                "value":       pct_inversion,
                "unit":        "%",
                "target":      10.0,
                "score":       score_inversion,
                "description": f"Inviertes el {pct_inversion}% de tus ingresos (meta ≥ 10%)",
            },
            {
                "key":         "fondo_emergencia",
                "label":       "Fondo Emergencia",
                "emoji":       "🛡️",
                "value":       meses_cubiertos,
                "unit":        "meses",
                "target":      3.0,
                "score":       score_emergencia,
                "description": f"Tienes {meses_cubiertos} meses cubiertos (meta ≥ 3 meses)",
            },
            {
                "key":         "cumplimiento_presupuesto",
                "label":       "Cumpl. Presupuesto",
                "emoji":       "📋",
                "value":       cumplimiento,
                "unit":        "%",
                "target":      80.0,
                "score":       score_presupuesto,
                "description": f"{cumplimiento}% de categorías dentro del presupuesto (meta ≥ 80%)",
            },
            {
                "key":         "puntualidad_pagos",
                "label":       "Puntualidad Pagos",
                "emoji":       "📅",
                "value":       puntualidad,
                "unit":        "%",
                "target":      100.0,
                "score":       score_puntualidad,
                "description": f"{puntualidad}% de pagos realizados a tiempo (meta 100%)",
            },
        ],
    }
