"""
FinanzasVH — routers/reportes.py
F-08: Exportación y Reportes PDF

Rutas:
  GET /v3/reportes/resumen/{period}  — Descarga PDF del resumen mensual con gráficos
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc

from database import get_db
import models
from services.pdf_service import generar_pdf_resumen

logger = logging.getLogger("router.reportes")

router = APIRouter(prefix="/v3/reportes", tags=["F-08: Reportes PDF"])


# ═══════════════════════════════════════════════════════════════
# HELPER — Datos para los 4 gráficos del PDF
# ═══════════════════════════════════════════════════════════════

def _get_totales(period: str, db: Session) -> dict:
    """Agrega totales por tipo de transacción de un período."""
    q = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.period == period,
            models.Transaction.excluir_del_analisis == False,  # noqa: E712
        )
    )

    def total(tipo: str) -> float:
        r = (
            q.filter(models.Transaction.type == tipo)
            .with_entities(sqlfunc.coalesce(sqlfunc.sum(sqlfunc.abs(models.Transaction.amount)), 0))
            .scalar()
        )
        return float(r or 0)

    return {
        "ingresos":         total("ingreso"),
        "gastos_fijos":     total("gasto_fijo"),
        "gastos_variables": total("gasto_variable"),
        "deudas":           total("deuda"),
        "ahorros":          total("ahorro"),
    }


def _prev_period(period: str) -> str:
    """Calcula el período anterior en formato YYYY-MM."""
    y, m = int(period[:4]), int(period[5:7])
    return f"{y - 1}-12" if m == 1 else f"{y}-{str(m - 1).zfill(2)}"


def _compute_chart_data(period: str, db: Session) -> dict:
    """
    Calcula todos los datos necesarios para los 4 gráficos del PDF:
      1. kpis     → barras horizontales con semáforo
      2. radar    → spider chart de 6 dimensiones
      3. act/ant  → barras comparativas mes actual vs anterior
    """
    act        = _get_totales(period, db)
    prev       = _prev_period(period)
    ant        = _get_totales(prev, db)

    # Ingresos de referencia (evitar div/0)
    ing = act["ingresos"] or 1

    # ─── KPI scores ──────────────────────────────────────────
    tasa       = act["ahorros"] / ing * 100
    ratio_deu  = act["deudas"] / ing * 100
    gasto_tot  = act["gastos_fijos"] + act["gastos_variables"] + act["deudas"]
    saldo      = act["ingresos"] - gasto_tot - act["ahorros"]

    score_tasa  = round(min(100.0, tasa / 20 * 100), 1)
    score_deuda = round(max(0.0, (1 - ratio_deu / 30) * 100), 1)
    score_saldo = 100.0 if saldo >= 0 else round(max(0.0, 50 + saldo / ing * 100), 1)

    # ─── Radar: 6 dimensiones ────────────────────────────────

    # Dim 3: Inversión activa (sub-categorías de ahorro)
    inversion = float(
        db.query(sqlfunc.coalesce(sqlfunc.sum(sqlfunc.abs(models.Transaction.amount)), 0))
        .filter(
            models.Transaction.period == period,
            models.Transaction.type == "ahorro",
            models.Transaction.category.in_(["Inversión", "Ahorro programado"]),
            models.Transaction.excluir_del_analisis == False,  # noqa: E712
        )
        .scalar() or 0
    )
    pct_inversion = inversion / ing * 100
    score_inv = round(min(100.0, pct_inversion / 10 * 100), 1)

    # Dim 4: Fondo de emergencia (ahorro acumulado histórico / gasto mensual)
    ahorro_acum = float(
        db.query(sqlfunc.coalesce(sqlfunc.sum(sqlfunc.abs(models.Transaction.amount)), 0))
        .filter(
            models.Transaction.type == "ahorro",
            models.Transaction.excluir_del_analisis == False,  # noqa: E712
        )
        .scalar() or 0
    )
    gasto_ref     = gasto_tot or 1
    meses_cub     = ahorro_acum / gasto_ref
    score_emerg   = round(min(100.0, meses_cub / 3 * 100), 1)

    # Dim 5: Cumplimiento de presupuesto
    budgets = db.query(models.Budget).filter(models.Budget.period == period).all()
    if budgets:
        within = 0
        for b in budgets:
            spent = float(
                db.query(sqlfunc.coalesce(sqlfunc.sum(sqlfunc.abs(models.Transaction.amount)), 0))
                .filter(
                    models.Transaction.period == period,
                    models.Transaction.category == b.category,
                    models.Transaction.excluir_del_analisis == False,  # noqa: E712
                )
                .scalar() or 0
            )
            if spent <= b.amount:
                within += 1
        cumplimiento = round(within / len(budgets) * 100, 1)
    else:
        cumplimiento = 0.0

    score_pres = round(min(100.0, cumplimiento / 80 * 100), 1)

    # ─── Resultado ───────────────────────────────────────────
    return {
        "act": act,
        "ant": ant,
        "prev_period": prev,
        "saldo": round(saldo, 2),
        "kpis": [
            {
                "label": "Tasa Ahorro",
                "value": round(tasa, 1),
                "score": score_tasa,
                "unit":  "%",
                "meta":  "≥20%",
            },
            {
                "label": "Control Deuda",
                "value": round(ratio_deu, 1),
                "score": score_deuda,
                "unit":  "%",
                "meta":  "<30%",
            },
            {
                "label": "Saldo Neto",
                "value": round(saldo, 0),
                "score": score_saldo,
                "unit":  "S/",
                "meta":  ">0",
            },
        ],
        "radar": [
            {"label": "Ahorro",       "score": score_tasa},
            {"label": "Deuda",        "score": score_deuda},
            {"label": "Inversión",    "score": score_inv},
            {"label": "Emergencia",   "score": score_emerg},
            {"label": "Presupuesto",  "score": score_pres},
            {"label": "Puntualidad",  "score": 100.0},
        ],
    }


# ═══════════════════════════════════════════════════════════════
# ENDPOINT
# ═══════════════════════════════════════════════════════════════

@router.get("/resumen/{period}")
def descargar_resumen_pdf(period: str, db: Session = Depends(get_db)):
    """
    Genera y descarga el resumen mensual en PDF con 4 gráficos:
      1. Barras horizontales de KPIs con semáforo
      2. Radar de salud financiera (6 dimensiones)
      3. Torta de distribución de gastos por categoría
      4. Barras comparativas mes actual vs mes anterior

    Requiere que el resumen IA (F-03) haya sido generado previamente.

    Parámetros:
        period: formato YYYY-MM (ej. 2026-02)
    """
    # Verificar que existe el resumen generado
    resumen = (
        db.query(models.ResumenMensual)
        .filter(models.ResumenMensual.periodo == period)
        .first()
    )

    if not resumen:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No hay resumen generado para el período {period}. "
                "Genera el resumen primero desde el Dashboard (botón 'Generar Resumen IA')."
            ),
        )

    # Parsear contenido JSON
    try:
        contenido = json.loads(resumen.contenido_json)
    except (json.JSONDecodeError, TypeError) as e:
        logger.error(f"[Reportes] Error parseando resumen {period}: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error al procesar el contenido del resumen. Regenera el resumen e intenta de nuevo.",
        )

    # Calcular datos para los 4 gráficos
    try:
        datos_graficos = _compute_chart_data(period, db)
    except Exception as e:
        logger.warning(f"[Reportes] No se pudieron calcular datos de gráficos: {e}. Generando PDF sin gráficos.")
        datos_graficos = {}

    # Generar PDF
    try:
        pdf_bytes = generar_pdf_resumen(period, contenido, datos_graficos)
    except Exception as e:
        logger.error(f"[Reportes] Error generando PDF {period}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error generando el PDF: {str(e)}",
        )

    filename = f"FinanzasVH_Resumen_{period}.pdf"
    logger.info(f"[Reportes] PDF generado: {filename} ({len(pdf_bytes):,} bytes)")

    return Response(
        content    = pdf_bytes,
        media_type = "application/pdf",
        headers    = {
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length":       str(len(pdf_bytes)),
        },
    )
