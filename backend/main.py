"""
FinanzasVH — API Backend
FastAPI + SQLAlchemy + SQLite
"""
import os
from typing import Optional
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
import models
from database import engine, get_db
from routers import patrimonio, ingesta, transferencias, analytics, telegram, resumen as resumen_router
from routers import financial_health as financial_health_router
from routers import reportes as reportes_router
from services import price_service, telegram_service
from utils.timezone_utils import now_lima, iso_lima

# ─── Crear tablas al iniciar ──────────────────────────────────
models.Base.metadata.create_all(bind=engine)


# ─── Lifespan: scheduler de precios ──────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inicia schedulers al arrancar; los detiene al cerrar."""
    price_service.start_scheduler()
    telegram_service.start_telegram_scheduler()
    # F-03: registrar job de resumen mensual en el scheduler de precios
    from services.resumen_service import job_generar_resumen_fin_de_mes
    from apscheduler.triggers.cron import CronTrigger as _CronTrigger
    price_service._scheduler.add_job(
        job_generar_resumen_fin_de_mes,
        trigger=_CronTrigger(hour=23, minute=30, timezone="America/Lima"),
        id="resumen_mensual",
        replace_existing=True,
    )
    yield
    price_service.stop_scheduler()
    telegram_service.stop_telegram_scheduler()


app = FastAPI(
    title="FinanzasVH API",
    description="Sistema de gestión financiera personal",
    version="3.1.0",
    lifespan=lifespan,
)

# ─── CORS — permite que el frontend React acceda ──────────────
origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(patrimonio.router)
app.include_router(ingesta.router)
app.include_router(transferencias.router)
app.include_router(analytics.router)
app.include_router(telegram.router)
app.include_router(resumen_router.router)   # F-03: Resumen Mensual IA
app.include_router(financial_health_router.router)  # G-08: Radar de Salud Financiera
app.include_router(reportes_router.router)           # F-08: Reportes PDF

# ═══════════════════════════════════════════════════════════════
# SCHEMAS (Pydantic)
# ═══════════════════════════════════════════════════════════════

class TransactionIn(BaseModel):
    date:                 str
    period:               str
    description:          str
    amount:               float
    type:                 str
    category:             str
    account:              str
    source:               Optional[str]  = "manual"
    excluir_del_analisis: Optional[bool] = False   # True = transferencia interna (no afecta métricas)

class TransactionOut(TransactionIn):
    id:         int
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class BudgetIn(BaseModel):
    period:   str
    category: str
    amount:   float

class BudgetOut(BudgetIn):
    id: int
    class Config:
        from_attributes = True

class ProfileIn(BaseModel):
    name:               Optional[str]   = ""
    income:             Optional[float] = 0.0
    pay_day:            Optional[int]   = 1
    accounts:           Optional[list]  = []
    recurring_services: Optional[list]  = []
    billing_cycles:     Optional[list]  = []
    onboarding_done:    Optional[int]   = 0

class ProfileOut(ProfileIn):
    id: int
    class Config:
        from_attributes = True

class ImportBatch(BaseModel):
    transactions: list[TransactionIn]

class BulkBudget(BaseModel):
    period:  str
    budgets: dict  # {category: amount}


# ═══════════════════════════════════════════════════════════════
# HEALTH
# ═══════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {"status": "ok", "app": "FinanzasVH", "version": "3.0.0"}


# ═══════════════════════════════════════════════════════════════
# TRANSACTIONS
# ═══════════════════════════════════════════════════════════════

@app.get("/transactions", response_model=list[TransactionOut])
def list_transactions(
    period:  Optional[str] = Query(None, description="Filtrar por período YYYY-MM"),
    type:    Optional[str] = Query(None, description="Filtrar por tipo"),
    account: Optional[str] = Query(None, description="Filtrar por cuenta"),
    db: Session = Depends(get_db)
):
    q = db.query(models.Transaction)
    if period:  q = q.filter(models.Transaction.period == period)
    if type:    q = q.filter(models.Transaction.type == type)
    if account: q = q.filter(models.Transaction.account == account)
    return q.order_by(models.Transaction.date.desc()).all()


@app.post("/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(tx: TransactionIn, db: Session = Depends(get_db)):
    obj = models.Transaction(**tx.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@app.post("/transactions/import", status_code=201)
def import_transactions(batch: ImportBatch, db: Session = Depends(get_db)):
    """
    Importación masiva con deduplicación.
    Retorna cuántas se insertaron y cuántas se saltaron por duplicado.
    """
    inserted = 0
    skipped  = 0

    # Traer transacciones existentes para comparar
    existing = db.query(models.Transaction).all()

    for tx in batch.transactions:
        # Verificar duplicado: misma fecha ±0, mismo monto, descripción similar
        is_dup = any(
            ex.date == tx.date
            and abs(ex.amount - tx.amount) < 0.01
            and _similar(ex.description, tx.description)
            for ex in existing
        )
        if is_dup:
            skipped += 1
            continue

        obj = models.Transaction(**tx.model_dump())
        db.add(obj)
        inserted += 1

    db.commit()
    return {
        "message": f"{inserted} transacciones importadas, {skipped} omitidas por duplicado",
        "inserted": inserted,
        "skipped":  skipped
    }


@app.delete("/transactions/{tx_id}", status_code=204)
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Transaction).filter(models.Transaction.id == tx_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    db.delete(obj)
    db.commit()


@app.delete("/transactions/period/{period}", status_code=200)
def delete_period(period: str, db: Session = Depends(get_db)):
    """Elimina todas las transacciones de un período (útil para re-importar)."""
    deleted = db.query(models.Transaction).filter(models.Transaction.period == period).delete()
    db.commit()
    return {"deleted": deleted, "period": period}


@app.get("/transactions/periods")
def list_periods(db: Session = Depends(get_db)):
    """Lista todos los períodos disponibles con conteo de transacciones."""
    from sqlalchemy import func as sqlfunc
    rows = (
        db.query(models.Transaction.period, sqlfunc.count(models.Transaction.id).label("count"))
        .group_by(models.Transaction.period)
        .order_by(models.Transaction.period.desc())
        .all()
    )
    return [{"period": r.period, "count": r.count} for r in rows]


# ═══════════════════════════════════════════════════════════════
# BUDGETS
# ═══════════════════════════════════════════════════════════════

@app.get("/budgets/{period}")
def get_budgets(period: str, db: Session = Depends(get_db)):
    rows = db.query(models.Budget).filter(models.Budget.period == period).all()
    return {r.category: r.amount for r in rows}


@app.put("/budgets")
def upsert_budgets(data: BulkBudget, db: Session = Depends(get_db)):
    """Guarda o actualiza presupuesto completo de un período."""
    for category, amount in data.budgets.items():
        existing = (
            db.query(models.Budget)
            .filter(models.Budget.period == data.period, models.Budget.category == category)
            .first()
        )
        if existing:
            existing.amount = amount
        else:
            db.add(models.Budget(period=data.period, category=category, amount=amount))
    db.commit()
    return {"message": f"Presupuesto de {data.period} actualizado", "categories": len(data.budgets)}


# ═══════════════════════════════════════════════════════════════
# PROFILE
# ═══════════════════════════════════════════════════════════════

@app.get("/profile", response_model=ProfileOut)
def get_profile(db: Session = Depends(get_db)):
    profile = db.query(models.Profile).filter(models.Profile.id == 1).first()
    if not profile:
        # Primera ejecución — perfil vacío, el usuario lo configura desde la app
        profile = models.Profile(
            id=1,
            name="",
            income=0.0,
            pay_day=1,
            accounts=[],
            recurring_services=[],
            billing_cycles=[],
            onboarding_done=0
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@app.put("/profile", response_model=ProfileOut)
def update_profile(data: ProfileIn, db: Session = Depends(get_db)):
    profile = db.query(models.Profile).filter(models.Profile.id == 1).first()
    if not profile:
        profile = models.Profile(id=1)
        db.add(profile)

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    db.commit()
    db.refresh(profile)
    return profile


# ═══════════════════════════════════════════════════════════════
# EXPORT — Backup completo
# ═══════════════════════════════════════════════════════════════

@app.get("/export")
def export_all(db: Session = Depends(get_db)):
    """Descarga JSON completo de todos los datos (backup manual)."""
    transactions = db.query(models.Transaction).order_by(models.Transaction.date).all()
    profile      = db.query(models.Profile).filter(models.Profile.id == 1).first()

    periods = list({t.period for t in transactions})
    budgets = {}
    for p in periods:
        rows = db.query(models.Budget).filter(models.Budget.period == p).all()
        budgets[p] = {r.category: r.amount for r in rows}

    return {
        "version": "3.0.0",
        "exported_at": iso_lima(),   # Lima UTC-5
        "transactions": [
            {
                "id": t.id, "date": t.date, "period": t.period,
                "description": t.description, "amount": t.amount,
                "type": t.type, "category": t.category,
                "account": t.account, "source": t.source
            }
            for t in transactions
        ],
        "budgets": budgets,
        "profile": {
            "name":               profile.name               if profile else "",
            "income":             profile.income             if profile else 0,
            "pay_day":            profile.pay_day            if profile else 1,
            "accounts":           profile.accounts           if profile else [],
            "recurring_services": profile.recurring_services if profile else [],
            "billing_cycles":     profile.billing_cycles     if profile else [],
        }
    }


# ═══════════════════════════════════════════════════════════════
# SETTINGS — Configuración personalizable
# ═══════════════════════════════════════════════════════════════

DEFAULT_ACCOUNTS = []          # El usuario agrega sus propias cuentas

DEFAULT_CATEGORIES = {
    "ingreso":        ["Sueldo","Honorarios","Transferencia recibida","Gratificación","CTS","Otro ingreso"],
    "gasto_fijo":     ["Alquiler","Luz","Agua","Gas","Internet/Cable","Seguros","Suscripciones","Educación","Otro fijo"],
    "gasto_variable": ["Alimentación","Transporte/Gasolina","Salud/Farmacia","Ropa","Ocio","Compras online","Restaurante","Otro variable"],
    "deuda":          ["Préstamo","Cuota diferida","Tarjeta de crédito","Otra deuda"],
    "ahorro":         ["Ahorro programado","Inversión","Fondo emergencia","Otro ahorro"],
}

DEFAULT_BILLING_CYCLES = []    # El usuario agrega sus propias tarjetas

# Reglas del sistema — valores por defecto (editables desde la UI, nunca hardcodeados en código de negocio)
# Formato: {label, pattern, type, category, prioridad, activa, es_movimiento_interno}
DEFAULT_SYSTEM_RULES = [
    {"label":"Wong / Vivanda",      "pattern":"WONG|VIVANDA",                                    "type":"gasto_variable","category":"Alimentación",        "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Plaza Vea",           "pattern":"PLAZA.?VEA|SPSA|PVEA",                            "type":"gasto_variable","category":"Alimentación",        "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Metro / Cencosud",    "pattern":"METRO\\b|CENCOSUD",                               "type":"gasto_variable","category":"Alimentación",        "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Tottus / Makro",      "pattern":"TOTTUS|MAKRO",                                    "type":"gasto_variable","category":"Alimentación",        "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"La Chalupa",          "pattern":"CORPORACION.LA.C|CHALUPA",                        "type":"gasto_variable","category":"Alimentación",        "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Canasto",             "pattern":"CANASTO|OPENPAY.*CANASTO",                        "type":"gasto_variable","category":"Alimentación",        "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"MASS / Tambo",        "pattern":"MASS\\b|TAMBO",                                   "type":"gasto_variable","category":"Alimentación",        "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"InkaFarma",           "pattern":"IKF|INKAFARMA",                                   "type":"gasto_variable","category":"Salud/Farmacia",     "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Mifarma / Botica",    "pattern":"MIFARMA|FASA|BOTICA",                             "type":"gasto_variable","category":"Salud/Farmacia",     "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Grifo / Gasolina",    "pattern":"PRIMAX|REPSOL|PECSA|PETRO|GRIFO|GO COMBUSTIBLES", "type":"gasto_variable","category":"Transporte/Gasolina","prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Uber / Cabify",       "pattern":"UBER|CABIFY|INDRIVER",                            "type":"gasto_variable","category":"Transporte/Gasolina","prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Parking",             "pattern":"APPARKA|PARKING|PARQUEO",                         "type":"gasto_variable","category":"Transporte/Gasolina","prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Netflix",             "pattern":"NETFLIX",                                         "type":"gasto_fijo",    "category":"Suscripciones",      "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Apple",               "pattern":"APPLE\\b|APPLE\\.COM",                            "type":"gasto_fijo",    "category":"Suscripciones",      "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Spotify",             "pattern":"SPOTIFY",                                         "type":"gasto_fijo",    "category":"Suscripciones",      "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Pacífico / Rimac",    "pattern":"PACIFICO|RIMAC|MAPFRE",                           "type":"gasto_fijo",    "category":"Seguros",            "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Seguro desgravamen",  "pattern":"SEGURO.?DESGRAVAMEN|DESGRAVAMEN",                 "type":"gasto_fijo",    "category":"Seguros",            "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Luz Enel",            "pattern":"ENEL|LUZ.DEL.SUR",                                "type":"gasto_fijo",    "category":"Luz",                "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Agua Sedapal",        "pattern":"SEDAPAL",                                         "type":"gasto_fijo",    "category":"Agua",               "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Internet / Telefónía","pattern":"CLARO|MOVISTAR|ENTEL",                             "type":"gasto_fijo",    "category":"Internet/Cable",    "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Pago Tarjeta BBVA",   "pattern":"BM\.?\\s*PAGO.?TARJET|PAGO.*TARJETA.*BBVA|Pago de Tarjeta de Cr|Tarjeta de Cr.dito", "type":"deuda", "category":"Tarjeta BBVA", "prioridad":5, "activa":True,"es_movimiento_interno":True},
    {"label":"Pago Tarjeta iO",     "pattern":"PAGO.*IO|IO.*PAGO",                               "type":"deuda",         "category":"Tarjeta iO",        "prioridad":5, "activa":True,"es_movimiento_interno":True},
    {"label":"Sueldo MINEDU",       "pattern":"SUELDO|REMUNERACION|HABERES|MINEDU",              "type":"ingreso",       "category":"Sueldo",            "prioridad":1, "activa":True,"es_movimiento_interno":False},
    {"label":"Gratificación",       "pattern":"GRATIFICACION",                                   "type":"ingreso",       "category":"Gratificación",     "prioridad":1, "activa":True,"es_movimiento_interno":False},
    {"label":"CTS",                 "pattern":"CTS\\b",                                           "type":"ingreso",       "category":"CTS",               "prioridad":1, "activa":True,"es_movimiento_interno":False},
    {"label":"Agora Ahorro",        "pattern":"AGORA",                                           "type":"ahorro",        "category":"Ahorro programado", "prioridad":5, "activa":True,"es_movimiento_interno":False},
    {"label":"Financiera Efectiva", "pattern":"FINANCIERA EFECTIVA|FIN.?EFECTIVA",               "type":"ahorro",        "category":"Ahorro programado", "prioridad":5, "activa":True,"es_movimiento_interno":False},
    {"label":"Jennifer - Hogar",    "pattern":"Jennifer.*Teran|Jennifer Ter",                     "type":"gasto_fijo",    "category":"Hogar",             "prioridad":3, "activa":True,"es_movimiento_interno":False},
    {"label":"Transferencia BCP",   "pattern":"Transferencia a BCP Digital",                     "type":"gasto_variable","category":"Movimiento interno","prioridad":3, "activa":True,"es_movimiento_interno":True},
    {"label":"Rebote BBVA->BCP",    "pattern":"TRANSF\\.BCO\\.BBVA",                              "type":"ingreso",       "category":"Movimiento interno","prioridad":3, "activa":True,"es_movimiento_interno":True},
    {"label":"BCP->BBVA debito",    "pattern":"BANCO DE CREDITO D|TRAN\\.CTAS\\.TERC\\.BM",    "type":"gasto_variable","category":"Movimiento interno","prioridad":3, "activa":True,"es_movimiento_interno":True},
    {"label":"Restaurantes / Chifa","pattern":"RESTAURAN|KFC|MC.?DONALD|BEMBOS|PIZZA|BUFFET|DON BUFFET|CHIFA|PARRI","type":"gasto_variable","category":"Restaurante","prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Ropa / Tiendas",      "pattern":"SAGA|FALABELLA|RIPLEY|ZARA|OECHSLE",              "type":"gasto_variable","category":"Ropa",                "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Compras online",      "pattern":"AMAZON|MERCADO.?LIBRE|LINIO",                     "type":"gasto_variable","category":"Compras online",     "prioridad":10,"activa":True,"es_movimiento_interno":False},
    {"label":"Promart / Sodimac",   "pattern":"PROMART|SODIMAC",                                 "type":"gasto_variable","category":"Otro variable",      "prioridad":10,"activa":True,"es_movimiento_interno":False},
]


class SettingsIn(BaseModel):
    accounts:       Optional[list] = None
    custom_rules:   Optional[list] = None
    system_rules:   Optional[list] = None   # Reglas del sistema editables
    billing_cycles: Optional[list] = None
    categories:     Optional[dict] = None


# ─── Investment schemas ───────────────────────────────────────
class InvestmentIn(BaseModel):
    name:       str
    ticker:     str
    type:       str                    # crypto | stock
    platform:   str                    # Binance | InteractiveBrokers
    quantity:   float
    buy_price:  float                  # USD
    buy_date:   str
    notes:      Optional[str] = ""

class InvestmentOut(InvestmentIn):
    id:         int
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class SnapshotIn(BaseModel):
    date:          str
    total_usd:     float
    total_pen:     float
    exchange_rate: float
    detail:        list               # [{ticker, qty, price_usd, value_usd}]


@app.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    row = db.query(models.AppSettings).filter(models.AppSettings.id == 1).first()
    if not row:
        row = models.AppSettings(
            id=1,
            accounts=DEFAULT_ACCOUNTS,
            custom_rules=[],
            system_rules=DEFAULT_SYSTEM_RULES,
            billing_cycles=DEFAULT_BILLING_CYCLES,
            categories=DEFAULT_CATEGORIES,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return {
        "accounts":       row.accounts or DEFAULT_ACCOUNTS,
        "custom_rules":   row.custom_rules or [],
        # Si el campo system_rules en BD está vacío (instalaciones previas), devuelve los defaults
        "system_rules":   row.system_rules if row.system_rules else DEFAULT_SYSTEM_RULES,
        "billing_cycles": row.billing_cycles or DEFAULT_BILLING_CYCLES,
        "categories":     row.categories or DEFAULT_CATEGORIES,
    }


@app.put("/settings")
def save_settings(data: SettingsIn, db: Session = Depends(get_db)):
    row = db.query(models.AppSettings).filter(models.AppSettings.id == 1).first()
    if not row:
        row = models.AppSettings(id=1)
        db.add(row)
    if data.accounts       is not None: row.accounts       = data.accounts
    if data.custom_rules   is not None: row.custom_rules   = data.custom_rules
    if data.system_rules   is not None: row.system_rules   = data.system_rules
    if data.billing_cycles is not None: row.billing_cycles = data.billing_cycles
    if data.categories     is not None: row.categories     = data.categories
    db.commit()
    db.refresh(row)
    return {"message": "Configuración guardada", "ok": True}


# ═══════════════════════════════════════════════════════════════
# F-02: PRECIOS AUTOMÁTICOS — Caché y scheduler
# ═══════════════════════════════════════════════════════════════

@app.get("/investments/prices/current")
def get_current_prices(db: Session = Depends(get_db)):
    """
    Devuelve todos los precios en caché actualizados por el scheduler.
    Incluye tipo de cambio USD/PEN y timestamp de última actualización.
    """
    return price_service.get_cached_prices(db)


@app.post("/investments/prices/refresh")
def refresh_prices():
    """
    Dispara actualización manual inmediata de todos los precios.
    útil para forzar sincronización sin esperar el scheduler.
    """
    result = price_service.refresh_all_now()
    return result


@app.get("/investments/prices/schedule")
def get_schedule_info():
    """
    Informa el estado del scheduler y las próximas ejecuciones.
    """
    from services.price_service import _scheduler
    if not _scheduler or not _scheduler.running:
        return {"running": False, "jobs": []}

    jobs = []
    for job in _scheduler.get_jobs():
        jobs.append({
            "id":       job.id,
            "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
        })
    return {"running": True, "jobs": jobs}


# ═══════════════════════════════════════════════════════════════
# INVESTMENTS — Portafolio manual
# ═══════════════════════════════════════════════════════════════

@app.get("/investments", response_model=list[InvestmentOut])
def list_investments(db: Session = Depends(get_db)):
    return db.query(models.Investment).order_by(models.Investment.buy_date.desc()).all()


@app.post("/investments", response_model=InvestmentOut, status_code=201)
def create_investment(inv: InvestmentIn, db: Session = Depends(get_db)):
    obj = models.Investment(**inv.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@app.put("/investments/{inv_id}", response_model=InvestmentOut)
def update_investment(inv_id: int, inv: InvestmentIn, db: Session = Depends(get_db)):
    obj = db.query(models.Investment).filter(models.Investment.id == inv_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Inversión no encontrada")
    for field, value in inv.model_dump().items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


@app.delete("/investments/{inv_id}", status_code=204)
def delete_investment(inv_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Investment).filter(models.Investment.id == inv_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Inversión no encontrada")
    db.delete(obj)
    db.commit()


# ─── Snapshots de portafolio (evolución en el tiempo) ─────────

@app.get("/investments/snapshots")
def list_snapshots(db: Session = Depends(get_db)):
    rows = (
        db.query(models.PortfolioSnapshot)
        .order_by(models.PortfolioSnapshot.date.asc())
        .all()
    )
    return [
        {
            "id":            r.id,
            "date":          r.date,
            "total_usd":     r.total_usd,
            "total_pen":     r.total_pen,
            "exchange_rate": r.exchange_rate,
            "detail":        r.detail,
        }
        for r in rows
    ]


@app.post("/investments/snapshots", status_code=201)
def save_snapshot(data: SnapshotIn, db: Session = Depends(get_db)):
    """
    Siempre inserta un nuevo snapshot.
    Se permite múltiples registros por día — el usuario decide cuándo guardar.
    """
    obj = models.PortfolioSnapshot(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return {"message": f"Snapshot {data.date} guardado", "id": obj.id, "total_usd": data.total_usd}


@app.delete("/investments/snapshots/{snap_id}", status_code=204)
def delete_snapshot(snap_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.PortfolioSnapshot).filter(models.PortfolioSnapshot.id == snap_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Snapshot no encontrado")
    db.delete(obj)
    db.commit()


# ═══════════════════════════════════════════════════════════════
# HELPERS INTERNOS
# ═══════════════════════════════════════════════════════════════

def _similar(a: str, b: str) -> bool:
    """Compara dos descripciones y retorna True si son suficientemente similares."""
    na = "".join(c for c in a.lower() if c.isalnum())
    nb = "".join(c for c in b.lower() if c.isalnum())
    if not na or not nb:
        return False
    longer  = na if len(na) >= len(nb) else nb
    shorter = na if len(na) < len(nb)  else nb
    matches = sum(1 for c in shorter if c in longer)
    return (matches / len(longer)) >= 0.5