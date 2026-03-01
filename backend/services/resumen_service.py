"""
FinanzasVH — services/resumen_service.py
F-03: Resumen Mensual de Salud Financiera con IA

Genera un diagnóstico narrativo completo del período usando Gemini.
Soporta key alternativa automática cuando la principal agota la cuota.

Disparadores:
  - Manual: POST /v3/resumen/{period}  (botón en Dashboard)
  - Automático: job scheduler último día del mes a las 23:30 Lima
"""

import json
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from services.gemini_service import GeminiService, GeminiQuotaExceeded, GeminiError
from utils.timezone_utils import now_lima

logger = logging.getLogger("resumen_service")

# ─── Instancia compartida del servicio Gemini ────────────────
_gemini: GeminiService | None = None

def _get_gemini() -> GeminiService:
    """Singleton del GeminiService (inicializado en primer uso)."""
    global _gemini
    if _gemini is None:
        _gemini = GeminiService()
    return _gemini


# ═══════════════════════════════════════════════════════════════
# SYSTEM PROMPT PARA RESUMEN MENSUAL
# ═══════════════════════════════════════════════════════════════

SYSTEM_PROMPT_RESUMEN = """
Eres un asesor financiero personal experto en finanzas personales peruanas.
Recibirás datos financieros consolidados de un período mensual de Victor Hugo,
un profesional peruano con ingresos regulares del MINEDU.

Tu tarea es generar un diagnóstico narrativo completo, empático y accionable.

REGLAS:
- Usa Soles peruanos (S/) como moneda principal
- Tono empático, directo y sin juicios sobre hábitos de consumo
- Sé específico con los números que te proporciono
- Las recomendaciones deben ser concretas y priorizadas por impacto

SEMÁFOROS:
- verde: tasa ahorro >= 20% Y ratio deuda <= 20%
- amarillo: tasa ahorro 10-19% O ratio deuda 20-30%
- rojo: tasa ahorro < 10% O ratio deuda > 30% O saldo neto negativo

Responde ÚNICAMENTE con JSON válido, sin markdown, sin explicaciones previas.
Usa esta estructura exacta:

{
  "resumen_ejecutivo": "2-3 oraciones resumiendo el mes con los indicadores clave",
  "semaforo": "verde|amarillo|rojo",
  "diagnostico": "Párrafo de 3-4 oraciones con el diagnóstico de salud financiera",
  "tasa_ahorro_pct": 0.0,
  "ratio_deuda_ingreso_pct": 0.0,
  "saldo_neto": 0.0,
  "top_categorias_gasto": [
    {"nombre": "...", "monto": 0.0, "porcentaje_ingreso": 0.0, "variacion_pct": null}
  ],
  "situacion_inversiones": "Texto sobre el portafolio si hay datos, o null si no hay",
  "comparativa_mes_anterior": "Texto comparando con el mes anterior, o null si es el primer mes",
  "recomendaciones": [
    "Recomendación 1 concreta y priorizada",
    "Recomendación 2 concreta y priorizada",
    "Recomendación 3 concreta y priorizada"
  ],
  "proyeccion_anual": "Proyección de ahorro acumulado al cierre del año si mantiene el ritmo actual",
  "frase_motivadora": "Una frase motivadora y realista, corta"
}
"""


# ═══════════════════════════════════════════════════════════════
# COMPILACIÓN DE DATOS
# ═══════════════════════════════════════════════════════════════

def _compilar_datos_periodo(period: str, db: Session, income_configured: float = 0) -> dict:
    """
    Extrae y agrupa los datos financieros del período desde SQLite.
    Excluye transacciones marcadas como excluir_del_analisis.
    """
    from models import Transaction, PortfolioSnapshot, PriceCache

    movimientos = (
        db.query(Transaction)
        .filter(
            Transaction.period == period,
            Transaction.excluir_del_analisis == False,
        )
        .all()
    )

    if not movimientos:
        return {"tiene_datos": False, "periodo": period}

    # Agrupar por tipo
    ingresos         = sum(t.amount for t in movimientos if t.type == "ingreso")
    gastos_fijos     = sum(abs(t.amount) for t in movimientos if t.type == "gasto_fijo")
    gastos_variables = sum(abs(t.amount) for t in movimientos if t.type == "gasto_variable")
    deudas           = sum(abs(t.amount) for t in movimientos if t.type == "deuda")
    ahorros          = sum(abs(t.amount) for t in movimientos if t.type == "ahorro")

    ingreso_base = ingresos if ingresos > 0 else income_configured

    # Calcular indicadores
    total_egresos = gastos_fijos + gastos_variables + deudas + ahorros
    saldo_neto    = ingresos - total_egresos
    tasa_ahorro   = (ahorros / ingreso_base * 100) if ingreso_base > 0 else 0
    ratio_deuda   = (deudas / ingreso_base * 100)  if ingreso_base > 0 else 0

    # Top categorías de gasto
    cat_map: dict[str, float] = {}
    for t in movimientos:
        if t.type != "ingreso":
            cat_map[t.category] = cat_map.get(t.category, 0) + abs(t.amount)

    top_cats = sorted(cat_map.items(), key=lambda x: x[1], reverse=True)[:7]
    top_cats_data = [
        {
            "nombre":            k,
            "monto":             round(v, 2),
            "porcentaje_ingreso": round(v / ingreso_base * 100, 1) if ingreso_base > 0 else 0,
        }
        for k, v in top_cats
    ]

    # Snapshot de inversiones más reciente
    snapshot = (
        db.query(PortfolioSnapshot)
        .order_by(PortfolioSnapshot.date.desc())
        .first()
    )
    inversiones = None
    if snapshot:
        inversiones = {
            "total_usd":     snapshot.total_usd,
            "total_pen":     snapshot.total_pen,
            "exchange_rate": snapshot.exchange_rate,
            "fecha":         snapshot.date,
        }

    return {
        "tiene_datos":       True,
        "periodo":           period,
        "ingresos":          round(ingresos, 2),
        "gastos_fijos":      round(gastos_fijos, 2),
        "gastos_variables":  round(gastos_variables, 2),
        "deudas":            round(deudas, 2),
        "ahorros":           round(ahorros, 2),
        "saldo_neto":        round(saldo_neto, 2),
        "tasa_ahorro_pct":   round(tasa_ahorro, 2),
        "ratio_deuda_pct":   round(ratio_deuda, 2),
        "total_movimientos": len(movimientos),
        "top_categorias":    top_cats_data,
        "inversiones":       inversiones,
    }


def _compilar_datos_anterior(period: str, db: Session) -> dict | None:
    """Extrae resumen del período anterior para comparativa."""
    from models import Transaction

    # Calcular período anterior
    year, month = map(int, period.split("-"))
    if month == 1:
        prev_period = f"{year - 1}-12"
    else:
        prev_period = f"{year}-{str(month - 1).zfill(2)}"

    movimientos = (
        db.query(Transaction)
        .filter(
            Transaction.period == prev_period,
            Transaction.excluir_del_analisis == False,
        )
        .all()
    )

    if not movimientos:
        return None

    ingresos         = sum(t.amount for t in movimientos if t.type == "ingreso")
    gastos_fijos     = sum(abs(t.amount) for t in movimientos if t.type == "gasto_fijo")
    gastos_variables = sum(abs(t.amount) for t in movimientos if t.type == "gasto_variable")
    deudas           = sum(abs(t.amount) for t in movimientos if t.type == "deuda")
    ahorros          = sum(abs(t.amount) for t in movimientos if t.type == "ahorro")

    tasa_ahorro = (ahorros / ingresos * 100) if ingresos > 0 else 0

    return {
        "periodo":          prev_period,
        "ingresos":         round(ingresos, 2),
        "gastos_fijos":     round(gastos_fijos, 2),
        "gastos_variables": round(gastos_variables, 2),
        "deudas":           round(deudas, 2),
        "ahorros":          round(ahorros, 2),
        "tasa_ahorro_pct":  round(tasa_ahorro, 2),
    }


# ═══════════════════════════════════════════════════════════════
# PERSISTENCIA
# ═══════════════════════════════════════════════════════════════

def _guardar_resumen(period: str, resultado: dict, fuente: str, db: Session) -> None:
    """Inserta o actualiza el resumen mensual en BD."""
    from models import ResumenMensual

    existing = (
        db.query(ResumenMensual)
        .filter(ResumenMensual.periodo == period)
        .first()
    )

    contenido = json.dumps(resultado, ensure_ascii=False)
    semaforo  = resultado.get("semaforo", "amarillo")

    if existing:
        existing.contenido_json = contenido
        existing.semaforo       = semaforo
        existing.fuente         = fuente
        existing.generado_en    = datetime.utcnow()
    else:
        db.add(
            ResumenMensual(
                periodo        = period,
                semaforo       = semaforo,
                contenido_json = contenido,
                fuente         = fuente,
                generado_en    = datetime.utcnow(),
            )
        )
    db.commit()
    logger.info(f"[Resumen] Resumen {period} guardado. Semaforo: {semaforo} | Fuente: {fuente}")


# ═══════════════════════════════════════════════════════════════
# FUNCIÓN PRINCIPAL
# ═══════════════════════════════════════════════════════════════

def generar_resumen_mensual(period: str, db: Session) -> dict:
    """
    Genera el resumen mensual de salud financiera con Gemini.
    Si Gemini falla por cuota, retorna un resumen calculado localmente.

    Args:
        period: formato 'YYYY-MM' (ej. '2026-02')
        db:     sesión de SQLAlchemy

    Returns:
        dict con el contenido del resumen + metadatos de generación
    """
    logger.info(f"[Resumen] Iniciando generación para período {period}")

    # Leer perfil para obtener ingreso configurado
    try:
        from models import Profile
        profile = db.query(Profile).filter(Profile.id == 1).first()
        income_configured = profile.income if profile else 0
    except Exception:
        income_configured = 0

    # Compilar datos del período actual y anterior
    datos         = _compilar_datos_periodo(period, db, income_configured)
    datos_anterior = _compilar_datos_anterior(period, db)

    if not datos.get("tiene_datos"):
        return {
            "error":   True,
            "mensaje": f"No hay movimientos registrados para el período {period}.",
            "periodo": period,
        }

    # Construir prompt usuario con todos los datos
    user_prompt = f"""
PERÍODO A ANALIZAR: {period}
ZONA HORARIA: America/Lima (UTC-5)
INGRESO MENSUAL CONFIGURADO: S/ {income_configured:,.2f}

=== DATOS DEL MES ACTUAL ({period}) ===
{json.dumps(datos, ensure_ascii=False, indent=2)}

=== DATOS DEL MES ANTERIOR (para comparativa) ===
{json.dumps(datos_anterior, ensure_ascii=False, indent=2) if datos_anterior else "No disponible (primer mes registrado)"}
"""

    # Intentar con Gemini (con fallback de key alternativa incluido)
    try:
        gemini = _get_gemini()
        raw_text, fuente = gemini.generate_text(SYSTEM_PROMPT_RESUMEN, user_prompt)

        # Limpiar markdown si lo hay
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
        raw_text = raw_text.rstrip("`").strip()

        resultado = json.loads(raw_text)

        # Asegurar campos mínimos desde los datos calculados
        resultado.setdefault("tasa_ahorro_pct",         datos["tasa_ahorro_pct"])
        resultado.setdefault("ratio_deuda_ingreso_pct", datos["ratio_deuda_pct"])
        resultado.setdefault("saldo_neto",              datos["saldo_neto"])

        # Agregar metadatos
        resultado["_meta"] = {
            "generado_en": now_lima().isoformat(),
            "fuente":      fuente,
            "periodo":     period,
        }

        _guardar_resumen(period, resultado, fuente, db)
        return resultado

    except GeminiQuotaExceeded as e:
        logger.warning(f"[Resumen] Cuota agotada: {e}. Generando resumen local.")
        return _generar_resumen_local(period, datos, datos_anterior, db)

    except (GeminiError, json.JSONDecodeError) as e:
        logger.error(f"[Resumen] Error Gemini/JSON: {e}. Generando resumen local.")
        return _generar_resumen_local(period, datos, datos_anterior, db)

    except Exception as e:
        logger.error(f"[Resumen] Error inesperado: {e}")
        return {
            "error":   True,
            "mensaje": f"Error al generar resumen: {str(e)}",
            "periodo": period,
        }


def _generar_resumen_local(
    period: str,
    datos: dict,
    datos_anterior: dict | None,
    db: Session,
) -> dict:
    """
    Resumen calculado localmente sin Gemini.
    Se usa como fallback cuando la API no está disponible.
    """
    tasa   = datos["tasa_ahorro_pct"]
    ratio  = datos["ratio_deuda_pct"]
    saldo  = datos["saldo_neto"]

    # Determinar semáforo
    if tasa >= 20 and ratio <= 20 and saldo >= 0:
        semaforo = "verde"
    elif tasa < 10 or ratio > 30 or saldo < 0:
        semaforo = "rojo"
    else:
        semaforo = "amarillo"

    # Recomendaciones automáticas
    recs = []
    if tasa < 10:
        recs.append(
            f"Incrementa tu tasa de ahorro al 10%+. Meta mensual: S/ {datos['ingresos'] * 0.10:,.0f}. "
            "Automatiza la transferencia a tu cuenta de ahorro el día de cobro."
        )
    if ratio > 25:
        recs.append(
            f"Tu ratio deuda/ingreso ({ratio:.1f}%) supera el límite recomendado (25%). "
            "Prioriza el pago total de tarjetas para evitar intereses."
        )
    if saldo > 500:
        recs.append(
            f"Tienes S/ {saldo:,.0f} de excedente este mes. "
            "Considera destinar al menos el 50% a inversiones o fondo de emergencia."
        )
    if not recs:
        recs.append("Mantén el buen ritmo financiero. Revisa tus categorías de mayor gasto.")

    resultado = {
        "resumen_ejecutivo": (
            f"Período {period}: ingresos S/ {datos['ingresos']:,.0f}, "
            f"egresos S/ {datos['ingresos'] - datos['saldo_neto']:,.0f}, "
            f"saldo neto S/ {datos['saldo_neto']:,.0f}."
        ),
        "semaforo":                semaforo,
        "diagnostico":             (
            f"Tasa de ahorro: {tasa:.1f}% (meta: 20%). "
            f"Ratio deuda/ingreso: {ratio:.1f}% (límite: 30%). "
            f"Saldo neto: {'positivo' if saldo >= 0 else 'negativo'} S/ {abs(saldo):,.0f}."
        ),
        "tasa_ahorro_pct":         datos["tasa_ahorro_pct"],
        "ratio_deuda_ingreso_pct": datos["ratio_deuda_pct"],
        "saldo_neto":              datos["saldo_neto"],
        "top_categorias_gasto":    datos["top_categorias"],
        "situacion_inversiones":   None,
        "comparativa_mes_anterior": (
            f"Mes anterior ({datos_anterior['periodo']}): "
            f"ingresos S/ {datos_anterior['ingresos']:,.0f}, "
            f"ahorro {datos_anterior['tasa_ahorro_pct']:.1f}%."
        ) if datos_anterior else None,
        "recomendaciones":         recs,
        "proyeccion_anual":        (
            f"Si mantienes el ritmo actual, acumularás S/ {datos['ahorros'] * 12:,.0f} en ahorro al cierre del año."
        ) if datos["ahorros"] > 0 else "Define una meta de ahorro mensual para proyectar el cierre anual.",
        "frase_motivadora":        "El control financiero no es restriccion — es libertad construida con datos.",
        "_meta": {
            "generado_en": now_lima().isoformat(),
            "fuente":      "LOCAL_FALLBACK",
            "periodo":     period,
            "aviso":       "Resumen generado localmente. Gemini no disponible en este momento.",
        },
    }

    _guardar_resumen(period, resultado, "LOCAL_FALLBACK", db)
    return resultado


# ═══════════════════════════════════════════════════════════════
# JOB AUTOMÁTICO — último día del mes
# ═══════════════════════════════════════════════════════════════

def job_generar_resumen_fin_de_mes() -> None:
    """
    Job APScheduler: genera resumen automático el último día del mes a las 23:30 Lima.
    Se integra en price_service.py / start_scheduler() desde main.py.
    """
    import calendar
    from database import SessionLocal

    now  = now_lima()
    last_day = calendar.monthrange(now.year, now.month)[1]

    if now.day != last_day:
        return  # No es el último día del mes

    period = now.strftime("%Y-%m")
    logger.info(f"[Resumen] Job automático fin de mes — generando resumen {period}")

    db = SessionLocal()
    try:
        resultado = generar_resumen_mensual(period, db)

        # Notificar por Telegram si está habilitado
        if not resultado.get("error"):
            try:
                from services import telegram_service
                from models import AppTelegramConfig

                tg = db.query(AppTelegramConfig).filter(AppTelegramConfig.id == 1).first()
                if tg and tg.enabled:
                    semaforo_emoji = {"verde": "🟢", "amarillo": "🟡", "rojo": "🔴"}.get(
                        resultado.get("semaforo", "amarillo"), "🟡"
                    )
                    msg = (
                        f"📊 <b>Resumen Mensual FinanzasVH — {period}</b>\n\n"
                        f"{semaforo_emoji} <b>Salud financiera:</b> {resultado.get('resumen_ejecutivo', '')}\n\n"
                        f"💡 {resultado.get('recomendaciones', [''])[0]}\n\n"
                        f"👉 <a href='https://finanzas.alias.nom.pe/'>Ver resumen completo</a>"
                    )
                    telegram_service.send_message(
                        msg,
                        token=tg.token or None,
                        chat_id=tg.chat_id or None,
                    )
                    logger.info("[Resumen] Resumen mensual enviado por Telegram.")
            except Exception as e:
                logger.warning(f"[Resumen] No se pudo enviar por Telegram: {e}")

    except Exception as e:
        logger.error(f"[Resumen] Error en job automático: {e}", exc_info=True)
    finally:
        db.close()
