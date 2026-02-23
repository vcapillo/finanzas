from sqlalchemy import Column, Integer, String, Float, DateTime, Text, JSON
from sqlalchemy.sql import func
from database import Base


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
    source      = Column(String(20),  default="manual")            # manual | import_text | import_csv | seed
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


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
    custom_rules    = Column(JSON, default=[])   # [{pattern, type, category, account, label}]
    billing_cycles  = Column(JSON, default=[])   # [{name, cutDay, dueDay, account}]
    categories      = Column(JSON, default={})   # {ingreso:[...], gasto_fijo:[...], ...}
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())


class Profile(Base):
    __tablename__ = "profile"

    id                  = Column(Integer, primary_key=True, default=1)
    name                = Column(String(100), default="Victor Hugo")
    income              = Column(Float, default=7163.0)
    pay_day             = Column(Integer, default=6)
    accounts            = Column(JSON, default=["BBVA","BCP","YAPE","iO Card","Agora"])
    recurring_services  = Column(JSON, default=[])
    billing_cycles      = Column(JSON, default=[])
    onboarding_done     = Column(Integer, default=0)               # 0=False, 1=True
    updated_at          = Column(DateTime(timezone=True), onupdate=func.now())
