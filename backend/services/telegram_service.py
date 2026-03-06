"""
FinanzasOS — services/telegram_service.py
F-01: Bot de Notificaciones Telegram

Responsabilidades:
  - Enviar mensajes via Telegram Bot API (httpx, sin dependencias extra)
  - Job diario (APScheduler) que revisa eventos y envía alertas a las 8:00 AM Lima
  - Notificaciones de: vencimientos de tarjeta, servicios recurrentes, tasa de ahorro baja
"""
import os
import logging
from datetime import datetime, date, timedelta
from typing import Optional
from utils.timezone_utils import now_lima, today_lima

import httpx
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger("telegram_service")

# ─── Scheduler dedicado ───────────────────────────────────────
_scheduler: Optional[BackgroundScheduler] = None

TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"


# ═══════════════════════════════════════════════════════════════
# 1. ENVÍO DE MENSAJES
# ═══════════════════════════════════════════════════════════════

def send_message(text: str, token: str = None, chat_id: str = None,
                 parse_mode: str = "HTML") -> dict:
    """
    Envía un mensaje de texto al chat de Telegram configurado.
    Prioridad: parámetros > variables de entorno.
    """
    tok = token   or os.getenv("TELEGRAM_BOT_TOKEN", "")
    cid = chat_id or os.getenv("TELEGRAM_CHAT_ID",   "")

    if not tok or not cid:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados"}

    url = TELEGRAM_API.format(token=tok)
    try:
        resp = httpx.post(url, json={
            "chat_id":    cid,
            "text":       text,
            "parse_mode": parse_mode,
        }, timeout=10)
        data = resp.json()
        if not data.get("ok"):
            logger.warning("Telegram API error: %s", data)
        return data
    except Exception as e:
        logger.error("Error enviando mensaje Telegram: %s", e)
        return {"ok": False, "error": str(e)}


def send_test_message(token: str = None, chat_id: str = None) -> dict:
    """Mensaje de prueba para verificar conectividad."""
    now = now_lima().strftime("%d/%m/%Y %H:%M")  # Lima UTC-5
    text = (
        "✅ <b>FinanzasOS — Conexión exitosa</b>\n"
        f"📅 {now}\n\n"
        "El bot de notificaciones está correctamente configurado.\n"
        "Recibirás alertas diarias a las <b>8:00 AM</b> sobre:\n"
        "  💳 Vencimientos de tarjeta\n"
        "  🔁 Servicios recurrentes\n"
        "  📉 Alertas de ahorro\n\n"
        "👉 <a href='https://finanzas.alias.nom.pe/'>Abrir FinanzasOS</a>"
    )
    return send_message(text, token=token, chat_id=chat_id)


# ═══════════════════════════════════════════════════════════════
# 2. LÓGICA DE NOTIFICACIONES
# ═══════════════════════════════════════════════════════════════

def _dias_hasta(target_day: int, hoy: date) -> int:
    """
    Calcula cuántos días faltan para el día 'target_day' del mes.
    Maneja correctamente el cruce de mes.
    """
    try:
        target = hoy.replace(day=target_day)
    except ValueError:
        # Día inválido para este mes (ej: día 31 en abril) → primer día del mes siguiente
        if hoy.month == 12:
            target = hoy.replace(year=hoy.year+1, month=1, day=1)
        else:
            target = hoy.replace(month=hoy.month+1, day=1)

    if target < hoy:
        # El día ya pasó este mes → calcular para el próximo
        if hoy.month == 12:
            target = target.replace(year=hoy.year+1, month=1)
        else:
            target = target.replace(month=hoy.month+1)

    return (target - hoy).days


def build_daily_notification(profile: dict, settings: dict,
                              anticipation_days: int = 3,
                              current_period: str = None) -> Optional[str]:
    """
    Construye el mensaje diario de notificación.
    Retorna None si no hay eventos relevantes para hoy.
    """
    hoy       = today_lima()          # Lima UTC-5 (no UTC del servidor)
    hoy_str   = hoy.strftime("%d/%m/%Y")
    dia_hoy   = hoy.day
    eventos   = []

    billing_cycles     = settings.get("billing_cycles", [])
    recurring_services = profile.get("recurring_services", [])

    # ── Vencimientos de tarjeta ──────────────────────────────
    for ciclo in billing_cycles:
        nombre  = ciclo.get("name", "Tarjeta")
        due_day = ciclo.get("dueDay") or ciclo.get("due_day")
        cut_day = ciclo.get("cutDay") or ciclo.get("cut_day")

        if due_day:
            dias = _dias_hasta(int(due_day), hoy)
            if dias == 0:
                eventos.append(f"🔴 <b>HOY vence {nombre}</b> (día {due_day})\n   ⚠️ Realiza el pago hoy para evitar intereses")
            elif 1 <= dias <= anticipation_days:
                eventos.append(f"💳 <b>{nombre}</b> vence en <b>{dias} día{'s' if dias>1 else ''}</b> (día {due_day})")

        if cut_day:
            dias = _dias_hasta(int(cut_day), hoy)
            if dias == 0:
                eventos.append(f"✂️ <b>HOY es corte de {nombre}</b> — Revisa tus cargos del mes")
            elif 1 <= dias <= anticipation_days:
                eventos.append(f"✂️ Corte de <b>{nombre}</b> en <b>{dias} día{'s' if dias>1 else ''}</b> (día {cut_day})")

    # ── Servicios recurrentes ────────────────────────────────
    for svc in recurring_services:
        nombre  = svc.get("name", "Servicio")
        monto   = svc.get("amount", 0)
        svc_day = svc.get("day")
        cuenta  = svc.get("account", "")

        if not svc_day:
            continue

        dias = _dias_hasta(int(svc_day), hoy)
        monto_str = f"S/ {float(monto):.2f}" if monto else ""

        if dias == 0:
            eventos.append(
                f"📌 <b>HOY: {nombre}</b>{' — ' + monto_str if monto_str else ''}"
                f"{' en ' + cuenta if cuenta else ''}"
            )
        elif 1 <= dias <= anticipation_days:
            eventos.append(
                f"🔔 <b>{nombre}</b> en {dias} día{'s' if dias>1 else ''}"
                f"{' (' + monto_str + ')' if monto_str else ''}"
                f"{' — ' + cuenta if cuenta else ''}"
            )

    # ── Día de pago de sueldo ────────────────────────────────
    pay_day = profile.get("pay_day")
    if pay_day and int(pay_day) == dia_hoy:
        income = profile.get("income", 0)
        eventos.append(f"💰 <b>¡Hoy es día de pago!</b> — Ingreso esperado: S/ {float(income):,.2f}")

    if not eventos:
        return None

    # ── Construir mensaje ────────────────────────────────────
    lineas = [
        f"📅 <b>FinanzasOS | {hoy_str}</b>",
        "",
    ] + eventos + [
        "",
        f"👉 <a href='https://finanzas.alias.nom.pe/'>Ver detalle en FinanzasOS</a>",
    ]
    return "\n".join(lineas)


def build_low_savings_alert(period: str, tasa_ahorro: float, threshold: float = 10.0) -> str:
    """Alerta cuando la tasa de ahorro cae por debajo del umbral."""
    emoji = "🔴" if tasa_ahorro < 5 else "🟡"
    return (
        f"{emoji} <b>Alerta de ahorro — {period}</b>\n\n"
        f"Tu tasa de ahorro actual es <b>{tasa_ahorro:.1f}%</b>\n"
        f"La meta mínima es <b>{threshold:.0f}%</b>\n\n"
        "💡 Revisa tus gastos variables para mejorar el ratio.\n"
        f"👉 <a href='https://finanzas.alias.nom.pe/'>Abrir Dashboard</a>"
    )


# ═══════════════════════════════════════════════════════════════
# 3. JOB DEL SCHEDULER — corre cada día a las 8:00 AM Lima
# ═══════════════════════════════════════════════════════════════

def _daily_notification_job():
    """
    Job principal del scheduler Telegram.
    Importa DB dentro del job para evitar problemas de scope.
    """
    try:
        from database import SessionLocal
        from models import Profile, AppSettings, AppTelegramConfig
        import models as m

        db = SessionLocal()
        try:
            # Leer config Telegram
            tg_cfg = db.query(AppTelegramConfig).filter(AppTelegramConfig.id == 1).first()
            if not tg_cfg or not tg_cfg.enabled:
                logger.info("Notificaciones Telegram desactivadas — saltando job")
                return

            token    = tg_cfg.token    or os.getenv("TELEGRAM_BOT_TOKEN", "")
            chat_id  = tg_cfg.chat_id  or os.getenv("TELEGRAM_CHAT_ID",   "")
            ant_days = tg_cfg.anticipation_days or 3

            if not token or not chat_id:
                logger.warning("Telegram: token o chat_id no configurados")
                return

            # Leer perfil y settings
            profile  = db.query(Profile).filter(Profile.id == 1).first()
            settings = db.query(m.AppSettings).filter(m.AppSettings.id == 1).first()

            prof_dict = {
                "pay_day":            profile.pay_day            if profile else 1,
                "income":             profile.income             if profile else 0,
                "recurring_services": profile.recurring_services if profile else [],
            }
            sett_dict = {
                "billing_cycles": settings.billing_cycles if settings else [],
            }

            # Construir y enviar notificación diaria
            msg = build_daily_notification(prof_dict, sett_dict, anticipation_days=ant_days)
            if msg:
                result = send_message(msg, token=token, chat_id=chat_id)
                logger.info("Notificación diaria enviada: ok=%s", result.get("ok"))
            else:
                logger.info("Sin eventos hoy — no se envía notificación")

        finally:
            db.close()

    except Exception as e:
        logger.error("Error en job Telegram: %s", e, exc_info=True)


# ═══════════════════════════════════════════════════════════════
# 4. GESTIÓN DEL SCHEDULER
# ═══════════════════════════════════════════════════════════════

def start_telegram_scheduler():
    """Inicia el scheduler Telegram. Llama desde lifespan de FastAPI."""
    global _scheduler
    if _scheduler and _scheduler.running:
        return

    _scheduler = BackgroundScheduler(timezone="America/Lima")

    # Job diario a las 8:00 AM hora Lima
    _scheduler.add_job(
        _daily_notification_job,
        trigger=CronTrigger(hour=8, minute=0, timezone="America/Lima"),
        id="telegram_daily",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info("Scheduler Telegram iniciado — job diario 8:00 AM Lima")


def stop_telegram_scheduler():
    """Detiene el scheduler Telegram."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler Telegram detenido")


def get_scheduler_status() -> dict:
    """Retorna el estado del scheduler y próxima ejecución."""
    if not _scheduler or not _scheduler.running:
        return {"running": False, "next_run": None}

    job = _scheduler.get_job("telegram_daily")
    return {
        "running":  True,
        "next_run": job.next_run_time.isoformat() if job and job.next_run_time else None,
    }
