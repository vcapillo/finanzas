"""
FinanzasVH v3.1 — routers/flujo_caja.py
F-05: Análisis de Flujo de Caja Proyectado
Proyecta el saldo disponible semana a semana dentro de un mes,
combinando transacciones reales (pasado) con estimaciones (futuro).
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import date, timedelta
import calendar

from database import get_db
import models
from utils.timezone_utils import now_lima

router = APIRouter(prefix="/v3/flujo-caja", tags=["Flujo de Caja"])


# ── HELPERS ──────────────────────────────────────────────────

def _str_to_date(s: str) -> date:
    return date.fromisoformat(s)


def _semanas_del_mes(year: int, month: int):
    """
    Divide el mes en 4 (o 5) semanas de 7 días.
    La última semana absorbe el resto del mes.
    Retorna lista de (inicio: date, fin: date, label: str)
    """
    primer_dia = date(year, month, 1)
    ultimo_dia = date(year, month, calendar.monthrange(year, month)[1])

    semanas = []
    inicio = primer_dia
    num = 1
    while inicio <= ultimo_dia:
        fin = min(inicio + timedelta(days=6), ultimo_dia)
        mes_str = inicio.strftime("%b")
        label = f"Sem {num} ({inicio.day}-{fin.day} {mes_str})"
        semanas.append({
            "semana": num,
            "inicio": inicio.isoformat(),
            "fin": fin.isoformat(),
            "label": label,
        })
        inicio = fin + timedelta(days=1)
        num += 1

    return semanas


def _txs_semana(txs, inicio_str: str, fin_str: str):
    """Filtra las transacciones que caen dentro de la semana."""
    return [t for t in txs if inicio_str <= t.date <= fin_str]


def _proyectar_semana_futura(semana: dict, profile, avg_gasto_var: float,
                              avg_gasto_fijo: float, avg_deuda: float):
    """
    Estima ingresos y egresos de una semana futura usando:
    - Servicios recurrentes del perfil (pay_day, recurring_services)
    - Promedios históricos de gasto variable y fijo
    """
    inicio = _str_to_date(semana["inicio"])
    fin    = _str_to_date(semana["fin"])

    ingresos       = 0.0
    gastos_fijos   = 0.0
    gastos_var     = avg_gasto_var   # promedio histórico de la semana
    deuda          = avg_deuda

    # ── Checar si el día de cobro cae en la semana ────────────
    if profile and profile.pay_day:
        try:
            pay_date = date(inicio.year, inicio.month, profile.pay_day)
            if inicio <= pay_date <= fin:
                ingresos += float(profile.income or 0)
        except ValueError:
            pass  # día 29/30/31 que no existe en el mes

    # ── Servicios recurrentes que vencen en la semana ─────────
    if profile and profile.recurring_services:
        for svc in profile.recurring_services:
            try:
                svc_day = int(svc.get("day", 0))
                svc_monto = abs(float(svc.get("amount", 0)))
                svc_date = date(inicio.year, inicio.month, svc_day)
                if inicio <= svc_date <= fin:
                    gastos_fijos += svc_monto
            except (ValueError, TypeError):
                continue

    return {
        "ingresos":         round(ingresos, 2),
        "gastos_fijos":     round(gastos_fijos, 2),
        "gastos_variables": round(gastos_var, 2),
        "deuda":            round(deuda, 2),
        "tipo":             "proyectado",
    }


def _calcular_semana_real(txs_semana):
    """Suma transacciones reales de una semana."""
    ingresos       = 0.0
    gastos_fijos   = 0.0
    gastos_var     = 0.0
    deuda          = 0.0

    for t in txs_semana:
        if t.excluir_del_analisis:
            continue
        amt = abs(t.amount)
        if t.type == "ingreso":
            ingresos += amt
        elif t.type == "gasto_fijo":
            gastos_fijos += amt
        elif t.type == "gasto_variable":
            gastos_var += amt
        elif t.type == "deuda":
            deuda += amt

    return {
        "ingresos":         round(ingresos, 2),
        "gastos_fijos":     round(gastos_fijos, 2),
        "gastos_variables": round(gastos_var, 2),
        "deuda":            round(deuda, 2),
        "tipo":             "real",
    }


# ── ENDPOINT PRINCIPAL ────────────────────────────────────────

@router.get("/{period}")
def get_flujo_caja(
    period: str,
    saldo_inicial: float = Query(0.0, description="Saldo disponible al inicio del mes (S/)"),
    db: Session = Depends(get_db),
):
    """
    F-05: Proyección de flujo de caja semana a semana para un período YYYY-MM.

    - Semanas pasadas: usa transacciones reales de la BD.
    - Semanas futuras: usa promedios históricos + servicios recurrentes del perfil.
    - Retorna waterfall data lista para recharts.
    - Incluye alertas cuando el saldo proyectado es negativo.
    """
    # Parsear período
    try:
        year, month = int(period[:4]), int(period[5:7])
    except (ValueError, IndexError):
        return {"error": f"Período inválido: {period}"}

    today = now_lima().date()

    # ── Obtener transacciones del mes ────────────────────────
    txs = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.period == period,
            models.Transaction.excluir_del_analisis == False,
        )
        .all()
    )

    # ── Promedios históricos (2 meses anteriores) ─────────────
    prev_periods = []
    for delta in [1, 2]:
        m = month - delta
        y = year
        if m <= 0:
            m += 12
            y -= 1
        prev_periods.append(f"{y:04d}-{m:02d}")

    hist_txs = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.period.in_(prev_periods),
            models.Transaction.excluir_del_analisis == False,
        )
        .all()
        if prev_periods else []
    )

    # Promedios semanales de períodos históricos
    num_periodos_hist = max(len(set(t.period for t in hist_txs)), 1)
    avg_gasto_var_mensual  = sum(abs(t.amount) for t in hist_txs if t.type == "gasto_variable") / num_periodos_hist
    avg_gasto_fijo_mensual = sum(abs(t.amount) for t in hist_txs if t.type == "gasto_fijo")     / num_periodos_hist
    avg_deuda_mensual      = sum(abs(t.amount) for t in hist_txs if t.type == "deuda")           / num_periodos_hist

    # Dividir en 4 semanas (aproximado)
    avg_gasto_var_sem  = avg_gasto_var_mensual  / 4
    avg_gasto_fijo_sem = avg_gasto_fijo_mensual / 4
    avg_deuda_sem      = avg_deuda_mensual       / 4

    # ── Perfil del usuario ────────────────────────────────────
    profile = db.query(models.Profile).filter(models.Profile.id == 1).first()

    # ── Generar semanas del mes ───────────────────────────────
    semanas_base = _semanas_del_mes(year, month)

    # ── Calcular flujo por semana ─────────────────────────────
    resultado_semanas = []
    saldo_acum = saldo_inicial

    for sem in semanas_base:
        inicio_str = sem["inicio"]
        fin_str    = sem["fin"]
        fin_date   = _str_to_date(fin_str)

        txs_sem = _txs_semana(txs, inicio_str, fin_str)

        # ¿La semana ya pasó completamente, está en curso, o es futura?
        if fin_date < today:
            tipo_semana = "real"
        elif _str_to_date(inicio_str) > today:
            tipo_semana = "proyectado"
        else:
            tipo_semana = "en_curso"  # semana actual: mix real + proyección

        if tipo_semana in ("real", "en_curso") and txs_sem:
            datos = _calcular_semana_real(txs_sem)
            datos["tipo"] = tipo_semana
        else:
            # Futura o sin datos: proyectar
            datos = _proyectar_semana_futura(
                sem, profile,
                avg_gasto_var_sem, avg_gasto_fijo_sem, avg_deuda_sem
            )
            if tipo_semana == "en_curso":
                datos["tipo"] = "en_curso"

        egreso_total = datos["gastos_fijos"] + datos["gastos_variables"] + datos["deuda"]
        saldo_inicio = saldo_acum
        saldo_fin    = saldo_inicio + datos["ingresos"] - egreso_total

        resultado_semanas.append({
            **sem,
            **datos,
            "egreso_total": round(egreso_total, 2),
            "saldo_inicio": round(saldo_inicio, 2),
            "saldo_fin":    round(saldo_fin, 2),
            "es_negativo":  saldo_fin < 0,
        })

        saldo_acum = saldo_fin

    # ── Waterfall data para recharts ─────────────────────────
    waterfall = []
    saldo_runner = saldo_inicial

    # Punto de partida
    waterfall.append({
        "name":    "Saldo inicial",
        "saldo":   round(saldo_inicial, 2),
        "tipo":    "saldo",
        "tooltip": f"Saldo disponible al inicio: S/ {saldo_inicial:,.2f}",
    })

    for sem in resultado_semanas:
        # Barra de ingreso (positiva)
        if sem["ingresos"] > 0:
            waterfall.append({
                "name":    f"{sem['label']} — Ingresos",
                "valor":   round(sem["ingresos"], 2),
                "base":    round(saldo_runner, 2),
                "tipo":    "ingreso",
                "semana":  sem["semana"],
                "tooltip": f"Ingresos {sem['label']}: +S/ {sem['ingresos']:,.2f}",
            })
            saldo_runner += sem["ingresos"]

        # Barra de egreso (negativa)
        if sem["egreso_total"] > 0:
            waterfall.append({
                "name":    f"{sem['label']} — Gastos",
                "valor":   -round(sem["egreso_total"], 2),
                "base":    round(saldo_runner, 2),
                "tipo":    "egreso",
                "semana":  sem["semana"],
                "tooltip": (
                    f"Gastos {sem['label']}: -S/ {sem['egreso_total']:,.2f} "
                    f"(Fijos: {sem['gastos_fijos']:,.0f} | "
                    f"Var: {sem['gastos_variables']:,.0f} | "
                    f"Deuda: {sem['deuda']:,.0f})"
                ),
            })
            saldo_runner -= sem["egreso_total"]

        # Punto de saldo acumulado
        waterfall.append({
            "name":    f"Saldo {sem['label']}",
            "saldo":   round(saldo_runner, 2),
            "tipo":    "saldo",
            "semana":  sem["semana"],
            "esNeg":   saldo_runner < 0,
            "tooltip": f"Saldo al cierre {sem['label']}: S/ {saldo_runner:,.2f}",
        })

    # ── Alertas ───────────────────────────────────────────────
    alertas = []

    for sem in resultado_semanas:
        if sem["es_negativo"]:
            alertas.append({
                "nivel":   "🔴",
                "tipo":    "saldo_negativo",
                "semana":  sem["semana"],
                "label":   sem["label"],
                "mensaje": f"Saldo proyectado negativo en {sem['label']}: S/ {sem['saldo_fin']:,.2f}",
            })

    saldo_cierre = resultado_semanas[-1]["saldo_fin"] if resultado_semanas else 0
    if saldo_cierre < 500:
        alertas.append({
            "nivel":   "🟡",
            "tipo":    "saldo_bajo",
            "mensaje": f"Saldo de cierre del mes muy bajo: S/ {saldo_cierre:,.2f}. Considera reducir gastos variables.",
        })

    ingreso_total  = sum(s["ingresos"]       for s in resultado_semanas)
    egreso_total   = sum(s["egreso_total"]   for s in resultado_semanas)
    tasa_ahorro    = ((ingreso_total - egreso_total) / ingreso_total * 100) if ingreso_total > 0 else 0

    if tasa_ahorro < 10 and ingreso_total > 0:
        alertas.append({
            "nivel":   "🟡",
            "tipo":    "tasa_ahorro_baja",
            "mensaje": f"Tasa de ahorro proyectada: {tasa_ahorro:.1f}%. Meta recomendada ≥ 20%.",
        })

    # ── Resumen del mes proyectado ────────────────────────────
    resumen = {
        "saldo_inicial":    round(saldo_inicial, 2),
        "ingreso_total":    round(ingreso_total, 2),
        "egreso_total":     round(egreso_total, 2),
        "saldo_cierre":     round(saldo_cierre, 2),
        "tasa_ahorro_pct":  round(tasa_ahorro, 1),
        "semanas_negativas": sum(1 for s in resultado_semanas if s["es_negativo"]),
        "num_semanas":       len(resultado_semanas),
        "semana_mas_critica": min(resultado_semanas, key=lambda s: s["saldo_fin"])["label"] if resultado_semanas else None,
    }

    return {
        "period":    period,
        "today":     today.isoformat(),
        "semanas":   resultado_semanas,
        "waterfall": waterfall,
        "alertas":   alertas,
        "resumen":   resumen,
        "meta": {
            "saldo_inicial":   saldo_inicial,
            "avg_var_semanal": round(avg_gasto_var_sem, 2),
            "avg_fijo_semanal": round(avg_gasto_fijo_sem, 2),
            "periodos_hist":   prev_periods,
        }
    }
