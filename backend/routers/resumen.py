"""
FinanzasVH — routers/resumen.py
F-03: Endpoints del Resumen Mensual de Salud Financiera con IA

Rutas:
  POST /v3/resumen/{period}   — Genera (o regenera) el resumen con Gemini
  GET  /v3/resumen/{period}   — Obtiene el último resumen guardado
  GET  /v3/resumen/           — Lista todos los períodos con resumen disponible
"""

import logging
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from database import get_db
from services.resumen_service import generar_resumen_mensual
from utils.timezone_utils import now_lima

logger = logging.getLogger("router.resumen")

router = APIRouter(prefix="/v3/resumen", tags=["F-03: Resumen IA"])


# ─── POST /v3/resumen/{period} ────────────────────────────────
@router.post("/{period}")
def generar_resumen(period: str, db: Session = Depends(get_db)):
    """
    Genera el resumen mensual de salud financiera con Gemini.
    Si el período no tiene datos devuelve un error descriptivo.
    Puede llamarse manualmente desde el Dashboard o vía scheduler.
    """
    logger.info(f"[Resumen] Solicitud manual de generación — período {period}")
    resultado = generar_resumen_mensual(period, db)
    return resultado


# ─── GET /v3/resumen/{period} ────────────────────────────────
@router.get("/{period}")
def obtener_resumen(period: str, db: Session = Depends(get_db)):
    """
    Retorna el último resumen almacenado para el período.
    Si no existe, retorna error con flag 'existe: False'.
    """
    import json
    from models import ResumenMensual

    resumen = (
        db.query(ResumenMensual)
        .filter(ResumenMensual.periodo == period)
        .first()
    )

    if not resumen:
        return {
            "existe":  False,
            "periodo": period,
            "mensaje": f"No existe resumen para el período {period}. Genera uno con el botón.",
        }

    return {
        "existe":      True,
        "periodo":     resumen.periodo,
        "semaforo":    resumen.semaforo,
        "fuente":      resumen.fuente,
        "generado_en": resumen.generado_en.isoformat() if resumen.generado_en else None,
        "contenido":   json.loads(resumen.contenido_json),
    }


# ─── GET /v3/resumen/ ────────────────────────────────────────
@router.get("/")
def listar_resumenes(db: Session = Depends(get_db)):
    """
    Lista todos los períodos que tienen resumen generado.
    Ordenado de más reciente a más antiguo.
    """
    from models import ResumenMensual

    resumenes = (
        db.query(ResumenMensual)
        .order_by(ResumenMensual.periodo.desc())
        .all()
    )

    return [
        {
            "periodo":     r.periodo,
            "semaforo":    r.semaforo,
            "fuente":      r.fuente,
            "generado_en": r.generado_en.isoformat() if r.generado_en else None,
        }
        for r in resumenes
    ]
