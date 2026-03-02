import enum
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, JSON, Boolean, ForeignKey, Enum
from sqlalchemy.sql import func
from database import Base
from sqlalchemy.orm import relationship
from datetime import datetime


class Transaction(Base):
    __tablename__ = "transactions"

    id          = Column(Integer, primary_key=True, index=True, autoincrement=True)
    date        = Column(String(10), nullable=False, index=True)   # YYYY-MM-DD
    period      = Column(String(7),  nullable=False, index=True)   # YYYY-MM
    description = Column(String(255), nullable=False)
    amount      = Column(Float, nullable=False)
    type        = Column(String(30),  nullable=False)              # ingreso | gasto_fijo | ...
    category    = Column(String(80),  nullable=False)
    account     = Column(String(50),  nullable=False)
    source               = Column(String(20),  default="manual")   # manual | import_text | import_csv | seed
    excluir_del_analisis = Column(Boolean, default=False)              # True para transferencias internas (no afectan métricas)
    created_at           = Column(DateTime(timezone=True), server_default=func.now())


class Budget(Base):
    __tablename__ = "budgets"

    id       = Column(Integer, primary_key=True, index=True, autoincrement=True)
    period   = Column(String(7),  nullable=False, index=True)      # YYYY-MM
    category = Column(String(80), nullable=False)
    amount   = Column(Float, nullable=False)


class AppSettings(Base):
    """
    Configuración personalizable del usuario:
    - cuentas y billeteras
    - reglas de auto-clasificación
    - ciclos de tarjetas
    - categorías por tipo
    Un solo registro (id=1).
    """
    __tablename__ = "app_settings"

    id              = Column(Integer, primary_key=True, default=1)
    accounts        = Column(JSON, default=[])   # [{name, type, color, active}]
    custom_rules    = Column(JSON, default=[])   # [{label, pattern, type, category, prioridad, activa, es_movimiento_interno}]
    system_rules    = Column(JSON, default=[])   # Reglas del sistema (editables, igual formato que custom_rules)
    billing_cycles  = Column(JSON, default=[])   # [{name, cutDay, dueDay, account}]
    categories      = Column(JSON, default={})   # {ingreso:[...], gasto_fijo:[...], ...}
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())


class Profile(Base):
    __tablename__ = "profile"

    id                  = Column(Integer, primary_key=True, default=1)
    name                = Column(String(100), default="")
    income              = Column(Float, default=0.0)
    pay_day             = Column(Integer, default=1)
    accounts            = Column(JSON, default=[])
    recurring_services  = Column(JSON, default=[])
    billing_cycles      = Column(JSON, default=[])
    onboarding_done     = Column(Integer, default=0)               # 0=False, 1=True
    updated_at          = Column(DateTime(timezone=True), onupdate=func.now())


class Investment(Base):
    """
    Portafolio de inversiones manual.
    Cada fila = un activo (crypto o acción).
    """
    __tablename__ = "investments"

    id          = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name        = Column(String(100), nullable=False)              # Ej. "Bitcoin", "Apple Inc."
    ticker      = Column(String(20),  nullable=False)              # Ej. "BTC", "AAPL"
    type        = Column(String(20),  nullable=False)              # crypto | stock
    platform    = Column(String(30),  nullable=False)              # Binance | InteractiveBrokers
    quantity    = Column(Float, nullable=False)                    # Cantidad de unidades
    buy_price   = Column(Float, nullable=False)                    # Precio de compra (USD)
    buy_date    = Column(String(10),  nullable=False)              # YYYY-MM-DD
    notes       = Column(String(255), default="")
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


class PortfolioSnapshot(Base):
    """
    Historial del valor del portafolio en el tiempo.
    Se guarda cuando el usuario hace clic en 'Guardar snapshot'.
    Permite ver la evolución histórica.
    """
    __tablename__ = "portfolio_snapshots"

    id          = Column(Integer, primary_key=True, index=True, autoincrement=True)
    date        = Column(String(10), nullable=False, index=True)   # YYYY-MM-DD
    total_usd   = Column(Float, nullable=False)
    total_pen   = Column(Float, nullable=False)
    exchange_rate = Column(Float, nullable=False)                  # USD/PEN al momento
    detail      = Column(JSON, default=[])                         # [{ticker, qty, price_usd, value_usd}]
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

class PriceCache(Base):
    """
    Cache de precios actualizados automáticamente por el scheduler.
    Un registro por ticker. Se sobreescribe en cada actualización.
    """
    __tablename__ = "price_cache"

    id         = Column(Integer, primary_key=True, index=True, autoincrement=True)
    ticker     = Column(String(20), nullable=False, unique=True, index=True)  # Ej. BTC, AAPL
    price_usd  = Column(Float, nullable=False)                                 # Precio en USD
    source     = Column(String(30), default="coingecko")                      # coingecko | yahoo
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), default=datetime.utcnow)


# ============================================================
# FinanzasVH v3.0 — models_v3.py
# Nuevas entidades SQLAlchemy (no destructivas)
# Ejecutar: alembic revision --autogenerate -m "v3_patrimonio"
#            alembic upgrade head
# ============================================================



# ── ENUMS ────────────────────────────────────────────────────

class CurrencyType(str, enum.Enum):
    PEN = "PEN"
    USD = "USD"

class AssetType(str, enum.Enum):
    CUENTA_OPERATIVA = "CUENTA_OPERATIVA"   # BBVA, BCP
    AHORRO           = "AHORRO"             # Financiera Confianza, Agora
    FONDO_MUTUO      = "FONDO_MUTUO"        # Fondos en bancos
    BOLSA_USA        = "BOLSA_USA"          # Interactive Brokers
    CRYPTO           = "CRYPTO"             # Binance
    CREDITO          = "CREDITO"            # iO Digital (pasivo)

class DuplicateStatus(str, enum.Enum):
    PENDING  = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


# ── ACTIVOS / CUENTAS ────────────────────────────────────────

class Asset(Base):
    """Catálogo de todos los activos y cuentas."""
    __tablename__ = "assets"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(100), nullable=False)       # "BBVA Principal"
    institution = Column(String(100))                       # "BBVA Perú"
    asset_type  = Column(Enum(AssetType), nullable=False)
    currency    = Column(Enum(CurrencyType), default=CurrencyType.PEN)
    is_active   = Column(Boolean, default=True)
    notes       = Column(Text, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

    balance_snapshots = relationship("AssetBalanceSnapshot", back_populates="asset",
                                     cascade="all, delete-orphan")
    goals             = relationship("AssetGoal", back_populates="asset",
                                     cascade="all, delete-orphan")


# ── HISTORIAL DE SALDOS (Net Worth Over Time) ────────────────

class AssetBalanceSnapshot(Base):
    """Registro histórico de saldos. Base del gráfico de patrimonio."""
    __tablename__ = "asset_balance_snapshots"

    id            = Column(Integer, primary_key=True, index=True)
    asset_id      = Column(Integer, ForeignKey("assets.id"), nullable=False)
    snapshot_date = Column(DateTime, default=datetime.utcnow, index=True)
    balance       = Column(Float, nullable=False)       # Moneda nativa
    balance_pen   = Column(Float, nullable=True)        # Convertido a PEN
    exchange_rate = Column(Float, nullable=True)        # Tasa usada (si USD)
    source        = Column(String(50), default="MANUAL")  # MANUAL | API | IMPORT

    asset = relationship("Asset", back_populates="balance_snapshots")


# ── METAS FINANCIERAS ────────────────────────────────────────

class AssetGoal(Base):
    """Meta de ahorro asociada a un activo (ej: S/. 45,000 en Financiera Confianza)."""
    __tablename__ = "asset_goals"

    id          = Column(Integer, primary_key=True, index=True)
    asset_id    = Column(Integer, ForeignKey("assets.id"), nullable=False)
    goal_amount = Column(Float, nullable=False)
    currency    = Column(Enum(CurrencyType), default=CurrencyType.PEN)
    deadline    = Column(DateTime, nullable=True)
    label       = Column(String(200))                   # "Fondo de emergencia familiar"
    is_achieved = Column(Boolean, default=False)
    created_at  = Column(DateTime, default=datetime.utcnow)

    asset = relationship("Asset", back_populates="goals")


# ── HISTORIAL DE TIPO DE CAMBIO ──────────────────────────────

class ExchangeRateLog(Base):
    """Registro auditable de tasas USD/PEN usadas en conversiones."""
    __tablename__ = "exchange_rate_logs"

    id         = Column(Integer, primary_key=True, index=True)
    date       = Column(DateTime, default=datetime.utcnow, index=True)
    usd_to_pen = Column(Float, nullable=False)          # Ej: 3.72
    source     = Column(String(50), default="MANUAL")   # MANUAL | BCRP_API


# ── COLA DE DUPLICADOS ───────────────────────────────────────

class DuplicateCandidate(Base):
    """
    Transacciones marcadas por Gemini como posibles duplicados.
    El usuario decide APPROVE (importar) o REJECT (descartar) en el frontend.
    """
    __tablename__ = "duplicate_candidates"

    id                   = Column(Integer, primary_key=True, index=True)
    asset_id             = Column(Integer, ForeignKey("assets.id"), nullable=True)
    incoming_transaction = Column(JSON, nullable=False)    # Tx nueva (sin guardar aún)
    existing_tx_id       = Column(Integer, nullable=True)  # ID de Tx ya en BD
    similarity_score     = Column(Float)                   # 0.0 – 1.0
    ai_reasoning         = Column(Text)                    # Explicación de Gemini
    status               = Column(Enum(DuplicateStatus), default=DuplicateStatus.PENDING)
    created_at           = Column(DateTime, default=datetime.utcnow)
    reviewed_at          = Column(DateTime, nullable=True)


# ── TRANSFERENCIAS INTERNAS (anti doble conteo) ──────────────

class InternalTransfer(Base):
    """
    Movimientos entre cuentas propias (ej: BBVA → Financiera Confianza).
    Estos montos se EXCLUYEN de gastos e ingresos para evitar doble conteo.
    """
    __tablename__ = "internal_transfers"

    id              = Column(Integer, primary_key=True, index=True)
    source_asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    dest_asset_id   = Column(Integer, ForeignKey("assets.id"), nullable=False)
    amount          = Column(Float, nullable=False)
    currency        = Column(Enum(CurrencyType), default=CurrencyType.PEN)
    transfer_date   = Column(DateTime, nullable=False)
    notes           = Column(Text, nullable=True)
    source_tx_id    = Column(Integer, nullable=True)   # FK a transactions existente
    dest_tx_id      = Column(Integer, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)


# ── F-01: CONFIGURACIÓN BOT TELEGRAM ────────────────────────

class ResumenMensual(Base):
    """
    F-03: Resumen mensual de salud financiera generado por Gemini.
    Un registro por período (YYYY-MM). Se sobreescribe si se regenera.
    """
    __tablename__ = "resumenes_mensuales"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    periodo        = Column(String(7),  unique=True, nullable=False, index=True)  # 'YYYY-MM'
    semaforo       = Column(String(10), default="amarillo")                        # verde|amarillo|rojo
    contenido_json = Column(Text, nullable=False)
    fuente         = Column(String(20), default="GEMINI")                          # GEMINI | LOCAL | ERROR
    generado_en    = Column(DateTime, default=datetime.utcnow)


# ── F-04: METAS FINANCIERAS ─────────────────────────────────

class FinancialGoal(Base):
    """
    F-04: Metas financieras independientes.
    No vinculadas a Asset — representan objetivos autónomos
    (ej: 'Fondo emergencia S/ 10,000 para Jun 2026').
    """
    __tablename__ = "financial_goals"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    name           = Column(String(200), nullable=False)     # "Fondo de emergencia"
    description    = Column(Text, nullable=True)
    target_amount  = Column(Float, nullable=False)           # S/ 10,000
    current_amount = Column(Float, default=0.0)              # Progreso acumulado
    deadline       = Column(String(10), nullable=True)       # YYYY-MM-DD
    account        = Column(String(100), nullable=True)      # "Financiera Efectiva"
    currency       = Column(String(3), default="PEN")
    icon           = Column(String(10), default="🎯")
    color          = Column(String(20), default="#22c55e")
    is_active      = Column(Boolean, default=True)
    is_achieved    = Column(Boolean, default=False)
    created_at     = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, onupdate=datetime.utcnow)

    abonos = relationship("GoalContribution", back_populates="goal",
                          cascade="all, delete-orphan")


class GoalContribution(Base):
    """
    Registro de abonos a una meta financiera.
    Permite ver el historial de aportes realizados.
    """
    __tablename__ = "goal_contributions"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    goal_id    = Column(Integer, ForeignKey("financial_goals.id"), nullable=False)
    amount     = Column(Float, nullable=False)
    date       = Column(String(10), nullable=False)          # YYYY-MM-DD
    note       = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    goal = relationship("FinancialGoal", back_populates="abonos")


class AppTelegramConfig(Base):
    """
    Configuración del bot de notificaciones Telegram.
    Un solo registro (id=1). Token/chat_id pueden venir de
    variables de entorno o guardarse aquí para edición desde la UI.
    """
    __tablename__ = "app_telegram_config"

    id                = Column(Integer, primary_key=True, default=1)
    enabled           = Column(Boolean, default=False)       # Bot activo / inactivo
    token             = Column(String(200), nullable=True)   # Override del env var
    chat_id           = Column(String(50),  nullable=True)   # Override del env var
    anticipation_days = Column(Integer, default=3)           # Días antes del evento
    notify_hour       = Column(Integer, default=8)           # Hora de envío (Lima)
    updated_at        = Column(DateTime(timezone=True), onupdate=func.now())

