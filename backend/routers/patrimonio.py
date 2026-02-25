# ============================================================
# FinanzasVH v3.0 — routers/patrimonio.py
# Las cuentas se sincronizan automáticamente desde Settings.accounts
# No se necesita seed manual — si el usuario configura sus cuentas
# en ⚙️ Configuración, aquí aparecen automáticamente.
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from database import get_db
from models import Asset, AssetBalanceSnapshot, AssetGoal, ExchangeRateLog, AppSettings
from services.currency_service import CurrencyService

router = APIRouter(prefix="/v3/patrimonio", tags=["Patrimonio v3"])

# ── Mapeo de tipo de cuenta (Settings) → tipo de activo (Asset) ─
ACCOUNT_TYPE_MAP = {
    "banco":     "CUENTA_OPERATIVA",
    "billetera": "CUENTA_OPERATIVA",
    "efectivo":  "CUENTA_OPERATIVA",
    "tarjeta":   "CREDITO",
    "ahorro":    "AHORRO",
    "inversion": "BOLSA_USA",   # genérico; Binance se detecta por nombre
}

def _asset_type_from_account(acc: dict) -> str:
    """Infiere el tipo de activo a partir del account de Settings."""
    name  = (acc.get("name") or "").lower()
    atype = acc.get("type") or "banco"
    # Casos especiales por nombre
    if any(k in name for k in ["binance", "crypto", "btc", "eth"]):
        return "CRYPTO"
    if any(k in name for k in ["interactive", "broker", "etf", "fondo mutuo", "fondo"]):
        return "FONDO_MUTUO"
    return ACCOUNT_TYPE_MAP.get(atype, "CUENTA_OPERATIVA")

def _currency_from_account(acc: dict) -> str:
    """La mayoría de cuentas peruanas son PEN; brokers/crypto son USD."""
    atype = _asset_type_from_account(acc)
    return "USD" if atype in ("BOLSA_USA", "CRYPTO", "FONDO_MUTUO") else "PEN"

def _sync_assets_from_settings(db: Session) -> list:
    """
    Sincroniza la tabla Asset con las cuentas activas de AppSettings.
    - Crea Assets para cuentas nuevas.
    - Desactiva Assets de cuentas eliminadas/inactivas.
    Retorna la lista de Assets activos actualizados.
    """
    cfg = db.query(AppSettings).filter(AppSettings.id == 1).first()
    if not cfg or not cfg.accounts:
        return []

    active_names = {
        acc["name"]
        for acc in cfg.accounts
        if acc.get("active", True)
    }

    # Desactivar Assets que ya no están en Settings
    all_assets = db.query(Asset).all()
    for asset in all_assets:
        should_be_active = asset.name in active_names
        if asset.is_active != should_be_active:
            asset.is_active = should_be_active

    # Crear Assets para cuentas nuevas que aún no existen
    existing_names = {a.name for a in all_assets}
    for acc in cfg.accounts:
        if not acc.get("active", True):
            continue
        if acc["name"] in existing_names:
            continue
        new_asset = Asset(
            name        = acc["name"],
            institution = acc["name"],          # nombre como institución por defecto
            asset_type  = _asset_type_from_account(acc),
            currency    = _currency_from_account(acc),
            is_active   = True,
            notes       = f"Creado automáticamente desde Configuración · tipo: {acc.get('type','banco')}",
        )
        db.add(new_asset)

    db.commit()
    return db.query(Asset).filter(Asset.is_active == True).all()


# ── GET: Snapshot de tasa de cambio actual ───────────────────

@router.get("/tasa-cambio")
async def get_tasa_cambio(db: Session = Depends(get_db)):
    rate = await CurrencyService.get_current_rate(db)
    return {"usd_to_pen": rate, "retrieved_at": datetime.utcnow()}


# ── GET: Vista consolidada de patrimonio ─────────────────────

@router.get("/consolidado")
async def get_patrimonio_consolidado(db: Session = Depends(get_db)):
    """
    Vista general del patrimonio neto.
    Las cuentas se sincronizan automáticamente desde ⚙️ Configuración.
    """
    # 1. Sincronizar Assets desde Settings
    assets = _sync_assets_from_settings(db)

    # Sin cuentas configuradas → respuesta vacía pero coherente
    if not assets:
        return {
            "patrimonio_neto_pen": 0.0,
            "total_activos_pen":   0.0,
            "total_pasivos_pen":   0.0,
            "exchange_rate_used":  3.72,
            "assets":              [],
            "generated_at":        datetime.utcnow(),
            "hint": "Configura tus cuentas en ⚙️ Configuración → Cuentas para verlas aquí.",
        }

    current_rate = await CurrencyService.get_current_rate(db)
    consolidated = []
    total_activos_pen  = 0.0
    total_pasivos_pen  = 0.0

    for asset in assets:
        # Último snapshot de saldo
        last_snapshot = (
            db.query(AssetBalanceSnapshot)
            .filter(AssetBalanceSnapshot.asset_id == asset.id)
            .order_by(AssetBalanceSnapshot.snapshot_date.desc())
            .first()
        )

        if last_snapshot:
            balance_value = last_snapshot.balance
            balance_pen   = CurrencyService.convert_to_pen(
                balance_value, asset.currency, current_rate
            )
            last_updated  = last_snapshot.snapshot_date
            source        = last_snapshot.source
        else:
            # Sin saldo registrado aún → mostrar con 0, invitar a actualizar
            balance_value = 0.0
            balance_pen   = 0.0
            last_updated  = datetime.utcnow()
            source        = "PENDIENTE"

        # Crédito = pasivo
        if asset.asset_type == "CREDITO":
            total_pasivos_pen += abs(balance_pen)
        else:
            total_activos_pen += balance_pen

        # Meta de ahorro (si tiene)
        goal = (
            db.query(AssetGoal)
            .filter(AssetGoal.asset_id == asset.id, AssetGoal.is_achieved == False)
            .first()
        )
        progress_pct = None
        if goal and balance_pen > 0:
            goal_pen = CurrencyService.convert_to_pen(
                goal.goal_amount, goal.currency, current_rate
            )
            progress_pct = round((balance_pen / goal_pen) * 100, 1) if goal_pen > 0 else None

        consolidated.append({
            "asset_id":     asset.id,
            "name":         asset.name,
            "institution":  asset.institution,
            "asset_type":   asset.asset_type,
            "currency":     asset.currency,
            "balance":      balance_value,
            "balance_pen":  round(balance_pen, 2),
            "last_updated": last_updated,
            "source":       source,
            "goal": {
                "label":        goal.label        if goal else None,
                "goal_amount":  goal.goal_amount  if goal else None,
                "deadline":     goal.deadline     if goal else None,
                "progress_pct": progress_pct,
            } if goal else None,
        })

    patrimonio_neto = round(total_activos_pen - total_pasivos_pen, 2)

    return {
        "patrimonio_neto_pen": patrimonio_neto,
        "total_activos_pen":   round(total_activos_pen, 2),
        "total_pasivos_pen":   round(total_pasivos_pen, 2),
        "exchange_rate_used":  current_rate,
        "assets":              consolidated,
        "generated_at":        datetime.utcnow(),
    }


# ── POST: Registrar snapshot manual de saldo ─────────────────

@router.post("/snapshot")
async def registrar_snapshot(
    asset_id: int,
    balance:  float,
    source:   str = "MANUAL",
    db: Session = Depends(get_db),
):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Activo no encontrado")

    rate        = await CurrencyService.get_current_rate(db)
    balance_pen = CurrencyService.convert_to_pen(balance, asset.currency, rate)

    snapshot = AssetBalanceSnapshot(
        asset_id      = asset_id,
        balance       = balance,
        balance_pen   = balance_pen,
        exchange_rate = rate if asset.currency == "USD" else None,
        source        = source,
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)

    return {
        "snapshot_id": snapshot.id,
        "balance_pen": balance_pen,
        "rate_used":   rate,
    }


# ── GET: Historial de patrimonio neto ────────────────────────

@router.get("/historial")
async def get_historial_patrimonio(db: Session = Depends(get_db)):
    from sqlalchemy import func

    snapshots = (
        db.query(
            func.date(AssetBalanceSnapshot.snapshot_date).label("fecha"),
            func.sum(AssetBalanceSnapshot.balance_pen).label("total_pen"),
        )
        .group_by(func.date(AssetBalanceSnapshot.snapshot_date))
        .order_by(func.date(AssetBalanceSnapshot.snapshot_date).asc())
        .all()
    )

    return [
        {"fecha": str(s.fecha), "patrimonio_pen": round(s.total_pen, 2)}
        for s in snapshots
    ]
