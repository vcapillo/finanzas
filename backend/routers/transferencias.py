# ============================================================
# FinanzasVH v3.1 — routers/transferencias.py
# Endpoints REST para InternalTransfer
# Registra movimientos entre cuentas propias sin doble conteo
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database import get_db
from models import InternalTransfer, Asset, Transaction

router = APIRouter(prefix="/v3/transferencias", tags=["Transferencias Internas v3"])


# ── SCHEMAS ──────────────────────────────────────────────────

class TransferenciaIn(BaseModel):
    source_asset_id: int            # ID del activo origen
    dest_asset_id:   int            # ID del activo destino
    amount:          float          # Monto (positivo siempre)
    currency:        str  = "PEN"  # PEN | USD
    transfer_date:   str            # YYYY-MM-DD
    notes:           Optional[str] = ""


class TransferenciaOut(BaseModel):
    id:              int
    source_asset_id: int
    dest_asset_id:   int
    source_name:     str
    dest_name:       str
    amount:          float
    currency:        str
    transfer_date:   str
    notes:           Optional[str]
    source_tx_id:    Optional[int]
    dest_tx_id:      Optional[int]
    created_at:      Optional[datetime]

    class Config:
        from_attributes = True


# ── HELPERS ──────────────────────────────────────────────────

def _get_asset_name(db: Session, asset_id: int) -> str:
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    return asset.name if asset else f"Cuenta #{asset_id}"


def _crear_transaccion_interna(
    db: Session,
    date: str,
    description: str,
    amount: float,
    account: str,
    tx_type: str,
) -> Transaction:
    """Crea una transacción marcada como movimiento interno (excluida del análisis)."""
    period = date[:7]  # YYYY-MM
    tx = Transaction(
        date=date,
        period=period,
        description=description,
        amount=amount,
        type=tx_type,
        category="Movimiento interno",
        account=account,
        source="internal_transfer",
        excluir_del_analisis=True,
    )
    db.add(tx)
    db.flush()  # obtener ID sin commit
    return tx


# ── GET: Listar transferencias ────────────────────────────────

@router.get("/", response_model=list[TransferenciaOut])
def listar_transferencias(
    desde:  Optional[str] = None,   # YYYY-MM-DD filtro fecha inicio
    hasta:  Optional[str] = None,   # YYYY-MM-DD filtro fecha fin
    db: Session = Depends(get_db),
):
    q = db.query(InternalTransfer).order_by(InternalTransfer.transfer_date.desc())
    if desde:
        q = q.filter(InternalTransfer.transfer_date >= desde)
    if hasta:
        q = q.filter(InternalTransfer.transfer_date <= hasta)

    rows = q.all()
    result = []
    for r in rows:
        result.append(TransferenciaOut(
            id=r.id,
            source_asset_id=r.source_asset_id,
            dest_asset_id=r.dest_asset_id,
            source_name=_get_asset_name(db, r.source_asset_id),
            dest_name=_get_asset_name(db, r.dest_asset_id),
            amount=r.amount,
            currency=r.currency if isinstance(r.currency, str) else r.currency.value,
            transfer_date=str(r.transfer_date)[:10],
            notes=r.notes,
            source_tx_id=r.source_tx_id,
            dest_tx_id=r.dest_tx_id,
            created_at=r.created_at,
        ))
    return result


# ── POST: Registrar transferencia interna ─────────────────────

@router.post("/", status_code=201)
def registrar_transferencia(
    data: TransferenciaIn,
    db: Session = Depends(get_db),
):
    """
    Registra una transferencia entre cuentas propias.
    Crea automáticamente dos transacciones marcadas como
    excluir_del_analisis=True para evitar doble conteo.
    """
    # Validar que ambos activos existen
    src = db.query(Asset).filter(Asset.id == data.source_asset_id).first()
    dst = db.query(Asset).filter(Asset.id == data.dest_asset_id).first()

    if not src:
        raise HTTPException(status_code=404, detail=f"Activo origen #{data.source_asset_id} no encontrado")
    if not dst:
        raise HTTPException(status_code=404, detail=f"Activo destino #{data.dest_asset_id} no encontrado")
    if data.source_asset_id == data.dest_asset_id:
        raise HTTPException(status_code=400, detail="Origen y destino no pueden ser la misma cuenta")
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a cero")

    # Crear transacción de salida (cuenta origen)
    desc_salida = f"Transferencia a {dst.name}"
    tx_salida = _crear_transaccion_interna(
        db=db,
        date=data.transfer_date,
        description=desc_salida,
        amount=-abs(data.amount),
        account=src.name,
        tx_type="gasto_variable",
    )

    # Crear transacción de entrada (cuenta destino)
    desc_entrada = f"Transferencia desde {src.name}"
    tx_entrada = _crear_transaccion_interna(
        db=db,
        date=data.transfer_date,
        description=desc_entrada,
        amount=abs(data.amount),
        account=dst.name,
        tx_type="ingreso",
    )

    # Registrar la transferencia interna
    transferencia = InternalTransfer(
        source_asset_id=data.source_asset_id,
        dest_asset_id=data.dest_asset_id,
        amount=data.amount,
        currency=data.currency,
        transfer_date=datetime.strptime(data.transfer_date, "%Y-%m-%d"),
        notes=data.notes,
        source_tx_id=tx_salida.id,
        dest_tx_id=tx_entrada.id,
    )
    db.add(transferencia)
    db.commit()
    db.refresh(transferencia)

    return {
        "id":            transferencia.id,
        "source":        src.name,
        "destination":   dst.name,
        "amount":        data.amount,
        "currency":      data.currency,
        "transfer_date": data.transfer_date,
        "source_tx_id":  tx_salida.id,
        "dest_tx_id":    tx_entrada.id,
        "message":       f"Transferencia de {src.name} → {dst.name} registrada. Ambas transacciones excluidas del análisis.",
    }


# ── GET: Detalle de una transferencia ────────────────────────

@router.get("/{transfer_id}", response_model=TransferenciaOut)
def obtener_transferencia(
    transfer_id: int,
    db: Session = Depends(get_db),
):
    r = db.query(InternalTransfer).filter(InternalTransfer.id == transfer_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Transferencia no encontrada")
    return TransferenciaOut(
        id=r.id,
        source_asset_id=r.source_asset_id,
        dest_asset_id=r.dest_asset_id,
        source_name=_get_asset_name(db, r.source_asset_id),
        dest_name=_get_asset_name(db, r.dest_asset_id),
        amount=r.amount,
        currency=r.currency if isinstance(r.currency, str) else r.currency.value,
        transfer_date=str(r.transfer_date)[:10],
        notes=r.notes,
        source_tx_id=r.source_tx_id,
        dest_tx_id=r.dest_tx_id,
        created_at=r.created_at,
    )


# ── DELETE: Eliminar transferencia y sus transacciones ───────

@router.delete("/{transfer_id}", status_code=200)
def eliminar_transferencia(
    transfer_id: int,
    db: Session = Depends(get_db),
):
    """
    Elimina la transferencia y las dos transacciones internas
    que se crearon automáticamente al registrarla.
    """
    transferencia = db.query(InternalTransfer).filter(InternalTransfer.id == transfer_id).first()
    if not transferencia:
        raise HTTPException(status_code=404, detail="Transferencia no encontrada")

    eliminadas = 0
    for tx_id in [transferencia.source_tx_id, transferencia.dest_tx_id]:
        if not tx_id:
            continue

        # SAFETY: solo eliminar la tx si no es referenciada por OTRA transferencia
        # Previene el bug donde source_tx_id duplicado destruye datos ajenos
        otras_refs = (
            db.query(InternalTransfer)
            .filter(
                InternalTransfer.id != transfer_id,
                (
                    (InternalTransfer.source_tx_id == tx_id) |
                    (InternalTransfer.dest_tx_id   == tx_id)
                )
            )
            .count()
        )
        if otras_refs > 0:
            continue  # tx compartida con otra transferencia — no tocar

        tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
        if tx:
            db.delete(tx)
            eliminadas += 1

    db.delete(transferencia)
    db.commit()

    return {
        "deleted_transfer_id":  transfer_id,
        "deleted_transactions": eliminadas,
        "message": "Transferencia eliminada. Transacciones espejo removidas si no eran compartidas.",
    }
