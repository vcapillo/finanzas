# ============================================================
# FinanzasVH v3.0 — services/currency_service.py
# Conversión USD/PEN con fallback al último rate conocido en BD
# ============================================================

import httpx
from sqlalchemy.orm import Session
from models import ExchangeRateLog
from datetime import datetime

# API pública del Banco Central de Reserva del Perú
BCRP_API_URL = (
    "https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04640PD/json"
)

FALLBACK_RATE = 3.70  # Tasa conservadora de respaldo


class CurrencyService:

    @staticmethod
    async def get_current_rate(db: Session) -> float:
        """
        Obtiene la tasa USD/PEN actual.
        Prioridad: (1) BCRP API → (2) Último registro en BD → (3) Constante fallback.
        Nunca bloquea la respuesta ante un fallo de red.
        """
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(BCRP_API_URL)
                resp.raise_for_status()
                data = resp.json()
                rate = float(data["periods"][-1]["values"][0])

                # Guardar en BD para auditoría
                log = ExchangeRateLog(usd_to_pen=rate, source="BCRP_API")
                db.add(log)
                db.commit()
                return rate

        except Exception:
            # Fallback 1: último rate registrado manualmente o por API anterior
            last = (
                db.query(ExchangeRateLog)
                .order_by(ExchangeRateLog.date.desc())
                .first()
            )
            if last:
                return last.usd_to_pen

            # Fallback 2: constante
            return FALLBACK_RATE

    @staticmethod
    def convert_to_pen(amount: float, currency: str, rate: float) -> float:
        """Convierte un monto a PEN usando la tasa provista."""
        if currency == "PEN":
            return amount
        elif currency == "USD":
            return amount * rate
        return amount  # Moneda desconocida — devuelve sin conversión

    @staticmethod
    def convert_to_usd(amount: float, currency: str, rate: float) -> float:
        """Convierte un monto a USD."""
        if currency == "USD":
            return amount
        elif currency == "PEN":
            return amount / rate if rate else amount
        return amount
