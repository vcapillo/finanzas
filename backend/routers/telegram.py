"""
FinanzasVH — routers/telegram.py
F-01: Endpoints REST para gestión del Bot Telegram
"""
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
import models
from services import telegram_service

router = APIRouter(prefix="/telegram", tags=["telegram"])


# ─── Schemas ─────────────────────────────────────────────────

class TelegramConfigIn(BaseModel):
    enabled:           bool          = True
    token:             Optional[str] = None   # Si se omite, usa variable de entorno
    chat_id:           Optional[str] = None   # Si se omite, usa variable de entorno
    anticipation_days: int           = 3       # Días antes del evento para notificar
    notify_hour:       int           = 8       # Hora de envío (8 = 8:00 AM Lima)

class TelegramConfigOut(TelegramConfigIn):
    token_configured:   bool
    chat_id_configured: bool
    scheduler:          dict

class TestMessageIn(BaseModel):
    token:   Optional[str] = None
    chat_id: Optional[str] = None

class NotifyNowIn(BaseModel):
    anticipation_days: Optional[int] = 3


# ─── Helpers ─────────────────────────────────────────────────

def _get_or_create_config(db: Session) -> models.AppTelegramConfig:
    cfg = db.query(models.AppTelegramConfig).filter(models.AppTelegramConfig.id == 1).first()
    if not cfg:
        cfg = models.AppTelegramConfig(
            id=1,
            enabled=False,
            token=None,
            chat_id=None,
            anticipation_days=3,
            notify_hour=8,
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


# ═══════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@router.get("/status")
def get_telegram_status(db: Session = Depends(get_db)):
    """Estado actual del bot: configuración + próxima ejecución."""
    cfg = _get_or_create_config(db)

    # Token y chat_id pueden venir de la BD o de variables de entorno
    token_ok   = bool(cfg.token   or os.getenv("TELEGRAM_BOT_TOKEN", ""))
    chat_id_ok = bool(cfg.chat_id or os.getenv("TELEGRAM_CHAT_ID",   ""))

    return {
        "enabled":            cfg.enabled,
        "token_configured":   token_ok,
        "chat_id_configured": chat_id_ok,
        "anticipation_days":  cfg.anticipation_days,
        "notify_hour":        cfg.notify_hour,
        "scheduler":          telegram_service.get_scheduler_status(),
        "ready":              token_ok and chat_id_ok and cfg.enabled,
    }


@router.put("/config")
def save_telegram_config(data: TelegramConfigIn, db: Session = Depends(get_db)):
    """Guarda la configuración del bot Telegram."""
    cfg = _get_or_create_config(db)
    cfg.enabled           = data.enabled
    cfg.anticipation_days = data.anticipation_days
    cfg.notify_hour       = data.notify_hour

    # Solo actualizar token/chat_id si se proporcionan explícitamente
    if data.token:   cfg.token   = data.token
    if data.chat_id: cfg.chat_id = data.chat_id

    db.commit()
    db.refresh(cfg)

    return {
        "message":            "Configuración Telegram guardada",
        "enabled":            cfg.enabled,
        "anticipation_days":  cfg.anticipation_days,
        "notify_hour":        cfg.notify_hour,
        "token_configured":   bool(cfg.token   or os.getenv("TELEGRAM_BOT_TOKEN", "")),
        "chat_id_configured": bool(cfg.chat_id or os.getenv("TELEGRAM_CHAT_ID",   "")),
    }


@router.post("/test")
def send_test_message(data: TestMessageIn = TestMessageIn(), db: Session = Depends(get_db)):
    """Envía un mensaje de prueba para verificar la configuración."""
    cfg = _get_or_create_config(db)
    token   = data.token   or cfg.token   or os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = data.chat_id or cfg.chat_id or os.getenv("TELEGRAM_CHAT_ID",   "")

    if not token or not chat_id:
        raise HTTPException(
            status_code=400,
            detail="Token o Chat ID no configurados. Revisa las variables de entorno o configura el bot."
        )

    result = telegram_service.send_test_message(token=token, chat_id=chat_id)
    if not result.get("ok"):
        raise HTTPException(status_code=502, detail=f"Error Telegram API: {result}")

    return {"ok": True, "message": "Mensaje de prueba enviado correctamente"}


@router.post("/notify/now")
def notify_now(data: NotifyNowIn = NotifyNowIn(), db: Session = Depends(get_db)):
    """
    Dispara la notificación diaria de forma inmediata (sin esperar el scheduler).
    Útil para probar el contenido real de la notificación.
    """
    cfg = _get_or_create_config(db)
    token   = cfg.token   or os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = cfg.chat_id or os.getenv("TELEGRAM_CHAT_ID",   "")

    if not token or not chat_id:
        raise HTTPException(status_code=400, detail="Bot no configurado")

    profile  = db.query(models.Profile).filter(models.Profile.id == 1).first()
    settings = db.query(models.AppSettings).filter(models.AppSettings.id == 1).first()

    prof_dict = {
        "pay_day":            profile.pay_day            if profile else 1,
        "income":             profile.income             if profile else 0,
        "recurring_services": profile.recurring_services if profile else [],
    }
    sett_dict = {
        "billing_cycles": settings.billing_cycles if settings else [],
    }

    ant_days = data.anticipation_days or cfg.anticipation_days or 3
    msg = telegram_service.build_daily_notification(prof_dict, sett_dict, anticipation_days=ant_days)

    if not msg:
        return {"ok": True, "sent": False, "message": "Sin eventos próximos hoy — no hay nada que notificar"}

    result = telegram_service.send_message(msg, token=token, chat_id=chat_id)
    if not result.get("ok"):
        raise HTTPException(status_code=502, detail=f"Error Telegram: {result}")

    return {"ok": True, "sent": True, "message": "Notificación enviada correctamente", "preview": msg}


@router.get("/preview")
def preview_notification(anticipation_days: int = 3, db: Session = Depends(get_db)):
    """
    Previsualiza el mensaje que se enviaría hoy, sin enviarlo.
    """
    profile  = db.query(models.Profile).filter(models.Profile.id == 1).first()
    settings = db.query(models.AppSettings).filter(models.AppSettings.id == 1).first()

    prof_dict = {
        "pay_day":            profile.pay_day            if profile else 1,
        "income":             profile.income             if profile else 0,
        "recurring_services": profile.recurring_services if profile else [],
    }
    sett_dict = {
        "billing_cycles": settings.billing_cycles if settings else [],
    }

    msg = telegram_service.build_daily_notification(prof_dict, sett_dict, anticipation_days=anticipation_days)

    return {
        "has_events": bool(msg),
        "preview":    msg or "Sin eventos próximos para los próximos días.",
    }
