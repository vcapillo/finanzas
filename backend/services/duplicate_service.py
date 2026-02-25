# ============================================================
# FinanzasVH v3.0 — services/duplicate_service.py
# Separa transacciones limpias de candidatas a duplicado
# ============================================================

from datetime import datetime
from sqlalchemy.orm import Session
from models import DuplicateCandidate

DUPLICATE_THRESHOLD = 0.70  # Score mínimo para enviar a revisión manual


class DuplicateDetector:

    def __init__(self, db: Session, threshold: float = DUPLICATE_THRESHOLD):
        self.db = db
        self.threshold = threshold

    def analyze(
        self,
        parsed_transactions: list,
        asset_id: int,
    ) -> tuple[list, list]:
        """
        Separa las transacciones parseadas en:
        - clean_txs: listas para importar directamente
        - duplicate_candidates: modelos DuplicateCandidate para revisión manual

        Retorna (clean_txs, duplicate_candidates)
        """
        clean_txs = []
        duplicate_candidates = []

        for tx in parsed_transactions:
            score = tx.get("duplicate_score", 0.0)

            if score >= self.threshold:
                candidate = DuplicateCandidate(
                    asset_id=asset_id,
                    incoming_transaction=tx,
                    existing_tx_id=None,  # Puedes mapear el ID real si lo tienes
                    similarity_score=score,
                    ai_reasoning=tx.get(
                        "duplicate_reasoning",
                        "Gemini detectó similitud alta con una transacción existente."
                    ),
                )
                duplicate_candidates.append(candidate)
            else:
                # Transacción limpia — remover campos de duplicado antes de importar
                clean_tx = {
                    k: v for k, v in tx.items()
                    if k not in (
                        "duplicate_score",
                        "duplicate_reasoning",
                        "possible_duplicate_of_description",
                    )
                }
                clean_txs.append(clean_tx)

        return clean_txs, duplicate_candidates
