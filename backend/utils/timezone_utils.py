"""
FinanzasVH — utils/timezone_utils.py
Helper centralizado de zona horaria: America/Lima (UTC-5)

Uso:
    from utils.timezone_utils import now_lima, today_lima, lima_tz

    ts  = now_lima()          # datetime aware en Lima
    hoy = today_lima()        # date de hoy en Lima
    dt  = now_lima().strftime("%d/%m/%Y %H:%M")
"""
from datetime import datetime, date, timezone, timedelta
try:
    from zoneinfo import ZoneInfo   # Python 3.9+
    lima_tz = ZoneInfo("America/Lima")
    _USE_ZONEINFO = True
except ImportError:
    lima_tz = None
    _USE_ZONEINFO = False

# Offset fijo UTC-5 (fallback si ZoneInfo no está disponible)
_UTC_MINUS_5 = timezone(timedelta(hours=-5))


def now_lima() -> datetime:
    """
    Retorna el datetime actual en zona horaria America/Lima (UTC-5).
    Compatible con APScheduler, SQLAlchemy y cualquier log del sistema.
    """
    if _USE_ZONEINFO:
        return datetime.now(lima_tz)
    return datetime.now(_UTC_MINUS_5)


def today_lima() -> date:
    """Retorna la fecha de hoy según la hora de Lima."""
    return now_lima().date()


def now_lima_naive() -> datetime:
    """
    Datetime Lima sin tzinfo (naive) — para campos SQLite/SQLAlchemy
    que no soportan timezone-aware datetimes.
    Equivalente a 'datetime.now()' pero en hora Lima.
    """
    return now_lima().replace(tzinfo=None)


def iso_lima() -> str:
    """ISO 8601 del momento actual en Lima. Ej: '2026-03-01T08:30:00-05:00'"""
    return now_lima().isoformat()
