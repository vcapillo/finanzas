# ============================================================
# FinanzasVH v3.0 — routers/ingesta.py
# Flujo de ingesta de extractos con IA (Gemini) y revisión de duplicados
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from database import get_db
from models import DuplicateCandidate, DuplicateStatus
from services.gemini_service import GeminiService
from services.duplicate_service import DuplicateDetector

router = APIRouter(prefix="/v3/ingesta", tags=["Ingesta IA v3"])


# ── SCHEMAS ──────────────────────────────────────────────────

class IngestaRequest(BaseModel):
    asset_id: int
    period: str      # Ej: "2025-06"
    raw_text: str    # Texto copiado del extracto bancario / PDF


class ReviewAction(BaseModel):
    action: str      # "APPROVE" | "REJECT"


# ── POST: Ingestar extracto bancario ─────────────────────────

@router.post("/extracto")
async def ingestar_extracto(
    request: IngestaRequest,
    db: Session = Depends(get_db),
):
    """
    Flujo completo:
    1. Gemini parsea el texto crudo → transacciones estructuradas
    2. DuplicateDetector separa limpias vs. posibles duplicados
    3. Guarda candidatos a duplicados en BD para revisión manual
    4. Retorna resumen de lo procesado
    """
    # Paso 1: Parseo con IA
    gemini = GeminiService()
    result = await gemini.parse_extracto(
        raw_text=request.raw_text,
        asset_id=request.asset_id,
        period=request.period,
        db=db,
    )
    parsed_txs = result.get("transactions", [])
    ai_summary = result.get("summary", {})

    # Paso 2: Detección de duplicados
    detector = DuplicateDetector(db)
    clean_txs, duplicate_candidates = detector.analyze(parsed_txs, request.asset_id)

    # Paso 3: Persistir candidatos a duplicados
    for candidate in duplicate_candidates:
        db.add(candidate)
    db.commit()

    return {
        "status":              "OK",
        "clean_transactions":  clean_txs,
        "clean_count":         len(clean_txs),
        "duplicates_pending":  len(duplicate_candidates),
        "ai_summary":          ai_summary,
        "message": (
            f"{len(clean_txs)} transacciones listas para importar. "
            f"{len(duplicate_candidates)} requieren tu revisión en la Bandeja de Duplicados."
        ),
    }


# ── GET: Obtener duplicados pendientes ───────────────────────

@router.get("/duplicados")
async def get_duplicados(
    status: str = "PENDING",
    db: Session = Depends(get_db),
):
    """Lista los candidatos a duplicados filtrados por estado."""
    candidates = (
        db.query(DuplicateCandidate)
        .filter(DuplicateCandidate.status == status)
        .order_by(DuplicateCandidate.created_at.desc())
        .all()
    )
    return [
        {
            "id":                   c.id,
            "asset_id":             c.asset_id,
            "incoming_transaction": c.incoming_transaction,
            "existing_tx_id":       c.existing_tx_id,
            "similarity_score":     c.similarity_score,
            "ai_reasoning":         c.ai_reasoning,
            "status":               c.status,
            "created_at":           c.created_at,
        }
        for c in candidates
    ]


# ── POST: Revisar un duplicado (APPROVE o REJECT) ────────────

@router.post("/duplicados/{candidate_id}/revisar")
async def revisar_duplicado(
    candidate_id: int,
    body: ReviewAction,
    db: Session = Depends(get_db),
):
    """
    El usuario decide si una transacción marcada como duplicado es:
    - APPROVE → No era duplicado, importar la transacción nueva
    - REJECT  → Era duplicado real, descartar
    """
    candidate = db.query(DuplicateCandidate).get(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidato no encontrado")

    if body.action not in ("APPROVE", "REJECT"):
        raise HTTPException(status_code=400, detail="Acción debe ser APPROVE o REJECT")

    candidate.status = (
        DuplicateStatus.APPROVED if body.action == "APPROVE"
        else DuplicateStatus.REJECTED
    )
    candidate.reviewed_at = datetime.utcnow()
    db.commit()

    return {
        "candidate_id": candidate_id,
        "status":       candidate.status,
        "reviewed_at":  candidate.reviewed_at,
        "message": (
            "Transacción aprobada para importar."
            if body.action == "APPROVE"
            else "Transacción descartada como duplicado."
        ),
    }


# ── POST: Aprobar o rechazar todos de una vez ────────────────

@router.post("/duplicados/revisar-todos")
async def revisar_todos(
    body: ReviewAction,
    db: Session = Depends(get_db),
):
    """Aprueba o rechaza en bloque todos los duplicados PENDING."""
    pending = (
        db.query(DuplicateCandidate)
        .filter(DuplicateCandidate.status == DuplicateStatus.PENDING)
        .all()
    )
    new_status = (
        DuplicateStatus.APPROVED if body.action == "APPROVE"
        else DuplicateStatus.REJECTED
    )
    now = datetime.utcnow()
    for c in pending:
        c.status = new_status
        c.reviewed_at = now

    db.commit()
    return {"updated": len(pending), "new_status": new_status}
