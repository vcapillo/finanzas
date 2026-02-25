#!/usr/bin/env python3
# ============================================================
# FinanzasVH v3.0 — seed_assets_v3.py
# Carga inicial de activos de Victor Hugo en la BD
# Ejecutar UNA SOLA VEZ después de la migración Alembic
# Uso: python seed_assets_v3.py
# ============================================================

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine
from models import Base, Asset, AssetGoal, AssetType, CurrencyType
from datetime import datetime, date

# Crear tablas si no existen (respaldo además de Alembic)
Base.metadata.create_all(bind=engine)

db = SessionLocal()

# ── ACTIVOS INICIALES ────────────────────────────────────────

ASSETS_SEED = [
    {
        "name":        "BBVA Principal",
        "institution": "BBVA Perú",
        "asset_type":  AssetType.CUENTA_OPERATIVA,
        "currency":    CurrencyType.PEN,
        "notes":       "Cuenta de sueldo. CCI: XXXX",
    },
    {
        "name":        "BCP Operaciones",
        "institution": "BCP",
        "asset_type":  AssetType.CUENTA_OPERATIVA,
        "currency":    CurrencyType.PEN,
        "notes":       "Cuenta de gastos operativos familiares.",
    },
    {
        "name":        "Financiera Confianza - Ahorro",
        "institution": "Financiera Confianza",
        "asset_type":  AssetType.AHORRO,
        "currency":    CurrencyType.PEN,
        "notes":       "Fondo de ahorro de alto rendimiento. Meta: S/. 45,000",
        "goal": {
            "goal_amount": 45000.00,
            "currency":    CurrencyType.PEN,
            "label":       "Fondo de emergencia familiar",
            "deadline":    datetime(2026, 12, 31),
        },
    },
    {
        "name":        "Agora Ahorro",
        "institution": "Agora",
        "asset_type":  AssetType.AHORRO,
        "currency":    CurrencyType.PEN,
        "notes":       "Cuenta de ahorro digital Agora.",
    },
    {
        "name":        "Interactive Brokers - Bolsa USA",
        "institution": "Interactive Brokers",
        "asset_type":  AssetType.BOLSA_USA,
        "currency":    CurrencyType.USD,
        "notes":       "Portafolio de acciones USA (IBKR).",
    },
    {
        "name":        "Binance - Crypto",
        "institution": "Binance",
        "asset_type":  AssetType.CRYPTO,
        "currency":    CurrencyType.USD,
        "notes":       "Portafolio de criptomonedas.",
    },
    {
        "name":        "iO Digital - Tarjeta Crédito",
        "institution": "iO Digital",
        "asset_type":  AssetType.CREDITO,
        "currency":    CurrencyType.PEN,
        "notes":       "Tarjeta de crédito iO Digital. Pasivo mensual.",
    },
]

# ── INSERTAR ─────────────────────────────────────────────────

created = 0
skipped = 0

for a in ASSETS_SEED:
    # Verificar si ya existe
    existing = db.query(Asset).filter(
        Asset.name == a["name"],
        Asset.institution == a["institution"],
    ).first()

    if existing:
        print(f"  ⏭️  Ya existe: {a['name']} — omitido")
        skipped += 1
        continue

    goal_data = a.pop("goal", None)

    asset = Asset(**a)
    db.add(asset)
    db.flush()   # Para obtener el ID antes del commit

    # Crear meta si corresponde
    if goal_data:
        goal = AssetGoal(asset_id=asset.id, **goal_data)
        db.add(goal)

    print(f"  ✅ Creado: {asset.name} ({asset.asset_type} / {asset.currency})")
    created += 1

db.commit()
db.close()

print(f"\n🎉 Seed completo: {created} activos creados, {skipped} omitidos.")
print("Próximo paso: registra el saldo actual de cada activo desde la UI.")
