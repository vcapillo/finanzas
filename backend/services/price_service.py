"""
FinanzasVH — services/price_service.py
F-02: Actualización automática de precios de inversiones.

Scheduler APScheduler que:
  · Cada 4 horas → actualiza precios crypto (CoinGecko)
  · Cada 6 horas → actualiza precios acciones (Yahoo Finance / yfinance)
  · Cada hora    → actualiza tipo de cambio USD/PEN (open.er-api.com)
  · Fin de mes   → genera snapshot automático del portafolio

El precio actualizado se guarda en la tabla PriceCache (un registro por ticker).
"""

import logging
import calendar
from datetime import datetime, timezone
from typing import Optional

import requests
import yfinance as yf
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session

import models
from database import SessionLocal

logger = logging.getLogger("price_service")

# ─── Mapa ticker → CoinGecko id (se puede ampliar desde aquí) ─
COINGECKO_IDS: dict[str, str] = {
    "BTC":  "bitcoin",
    "ETH":  "ethereum",
    "SOL":  "solana",
    "BNB":  "binancecoin",
    "ADA":  "cardano",
    "DOT":  "polkadot",
    "AVAX": "avalanche-2",
    "MATIC":"matic-network",
    "LINK": "chainlink",
    "UNI":  "uniswap",
    "XRP":  "ripple",
    "LTC":  "litecoin",
    "DOGE": "dogecoin",
    "SHIB": "shiba-inu",
    "USDT": "tether",
    "USDC": "usd-coin",
}

# Tipo de cambio en memoria (también persistido en BD para snapshots)
_exchange_rate: float = 3.72
_last_refresh: Optional[datetime] = None


# ═══════════════════════════════════════════════════════════════
# HELPERS BD
# ═══════════════════════════════════════════════════════════════

def _upsert_price(db: Session, ticker: str, price: float, source: str) -> None:
    """Inserta o actualiza un precio en PriceCache."""
    existing = db.query(models.PriceCache).filter(
        models.PriceCache.ticker == ticker.upper()
    ).first()
    if existing:
        existing.price_usd  = price
        existing.source     = source
        existing.updated_at = datetime.utcnow()
    else:
        db.add(models.PriceCache(
            ticker    = ticker.upper(),
            price_usd = price,
            source    = source,
            updated_at= datetime.utcnow(),
        ))
    db.commit()


def _get_active_tickers(db: Session) -> dict[str, list[str]]:
    """Devuelve tickers de inversiones activas agrupados por tipo."""
    investments = db.query(models.Investment).all()
    crypto = list({i.ticker.upper() for i in investments if i.type == "crypto"})
    stocks = list({i.ticker.upper() for i in investments if i.type == "stock"})
    return {"crypto": crypto, "stocks": stocks}


# ═══════════════════════════════════════════════════════════════
# JOBS DE ACTUALIZACIÓN
# ═══════════════════════════════════════════════════════════════

def job_update_exchange_rate() -> None:
    """Actualiza tipo de cambio USD→PEN cada hora."""
    global _exchange_rate
    try:
        resp = requests.get("https://open.er-api.com/v6/latest/USD", timeout=10)
        data = resp.json()
        if data.get("rates", {}).get("PEN"):
            _exchange_rate = data["rates"]["PEN"]
            logger.info(f"[TC] Tipo de cambio actualizado: S/ {_exchange_rate:.3f}")
    except Exception as e:
        logger.warning(f"[TC] No se pudo actualizar tipo de cambio: {e}")


def job_update_crypto_prices() -> None:
    """
    Actualiza precios de criptomonedas desde CoinGecko cada 4 horas.
    Solo actualiza los tickers que existen en la tabla investments.
    """
    global _last_refresh
    db = SessionLocal()
    try:
        tickers = _get_active_tickers(db)["crypto"]
        if not tickers:
            logger.info("[Crypto] Sin activos crypto registrados, saltando.")
            return

        gecko_ids = [COINGECKO_IDS[t] for t in tickers if t in COINGECKO_IDS]
        unknown   = [t for t in tickers if t not in COINGECKO_IDS]
        if unknown:
            logger.warning(f"[Crypto] Tickers sin mapeo CoinGecko: {unknown}")

        if not gecko_ids:
            return

        url = f"https://api.coingecko.com/api/v3/simple/price?ids={','.join(gecko_ids)}&vs_currencies=usd"
        resp = requests.get(url, timeout=15)
        data = resp.json()

        updated = 0
        for ticker in tickers:
            gecko_id = COINGECKO_IDS.get(ticker)
            if gecko_id and data.get(gecko_id, {}).get("usd"):
                price = data[gecko_id]["usd"]
                _upsert_price(db, ticker, price, "coingecko")
                updated += 1

        _last_refresh = datetime.now(timezone.utc)
        logger.info(f"[Crypto] {updated}/{len(tickers)} precios actualizados.")

    except Exception as e:
        logger.error(f"[Crypto] Error actualizando precios: {e}")
    finally:
        db.close()


# ─── Sesión compartida con cookie/crumb para Yahoo Finance ───
_yahoo_session: Optional[requests.Session] = None
_yahoo_crumb:   Optional[str]              = None


def _get_yahoo_session() -> tuple[Optional[requests.Session], Optional[str]]:
    """
    Obtiene (o reutiliza) una sesión autenticada con Yahoo Finance.
    Yahoo Finance requiere desde 2024: cookie YF_session + crumb para su API.
    """
    global _yahoo_session, _yahoo_crumb
    if _yahoo_session and _yahoo_crumb:
        return _yahoo_session, _yahoo_crumb

    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
    })

    try:
        # Paso 1: obtener cookie de consentimiento
        session.get("https://finance.yahoo.com", timeout=10)

        # Paso 2: obtener crumb (requerido por la API v1)
        crumb_resp = session.get(
            "https://query2.finance.yahoo.com/v1/test/getcrumb",
            timeout=10
        )
        crumb = crumb_resp.text.strip()
        if crumb and len(crumb) > 3:  # crumb válido tiene ~11 chars
            _yahoo_session = session
            _yahoo_crumb   = crumb
            logger.info(f"[Yahoo] Sesión autenticada. Crumb: {crumb[:6]}...")
            return session, crumb
        else:
            logger.warning(f"[Yahoo] Crumb inválido: '{crumb}'")
            return session, None
    except Exception as e:
        logger.warning(f"[Yahoo] No se pudo iniciar sesión: {e}")
        return session, None


def _fetch_stock_price_http(ticker: str) -> Optional[float]:
    """
    Fallback HTTP directo a Yahoo Finance con autenticación cookie+crumb.
    Funciona desde Docker donde yfinance es bloqueado por Yahoo.
    """
    global _yahoo_session, _yahoo_crumb
    session, crumb = _get_yahoo_session()

    # Construir URL con crumb si está disponible
    params = {"interval": "1d", "range": "5d"}
    if crumb:
        params["crumb"] = crumb

    for host in ["query2.finance.yahoo.com", "query1.finance.yahoo.com"]:
        try:
            url  = f"https://{host}/v8/finance/chart/{ticker}"
            resp = session.get(url, params=params, timeout=15)

            if resp.status_code == 401:
                # Crumb expirado — forzar renovación
                _yahoo_session = None
                _yahoo_crumb   = None
                session, crumb = _get_yahoo_session()
                if crumb:
                    params["crumb"] = crumb
                resp = session.get(url, params=params, timeout=15)

            if resp.status_code != 200:
                logger.debug(f"[Stocks-HTTP] {host} retornó {resp.status_code} para {ticker}")
                continue

            data  = resp.json()
            meta  = data["chart"]["result"][0]["meta"]
            price = (meta.get("regularMarketPrice")
                  or meta.get("previousClose")
                  or meta.get("chartPreviousClose"))
            if price and float(price) > 0:
                return float(price)

        except Exception as e:
            logger.debug(f"[Stocks-HTTP] {host}/{ticker} falló: {e}")
            continue

    return None


def job_update_stock_prices() -> None:
    """
    Actualiza precios de acciones y ETFs desde Yahoo Finance cada 6 horas.
    Estrategia en 3 capas para máxima robustez:
      1. yfinance fast_info (atributo, no .get())
      2. yfinance history(period='5d')
      3. HTTP directo a Yahoo Finance (resistente a bloqueos Docker)
    """
    db = SessionLocal()
    try:
        tickers = _get_active_tickers(db)["stocks"]
        if not tickers:
            logger.info("[Stocks] Sin activos de bolsa/ETF registrados, saltando.")
            return

        updated = 0
        for ticker in tickers:
            price = None
            method = "ninguno"
            try:
                # Capa 1: yfinance fast_info (acceso por atributo)
                try:
                    fast  = yf.Ticker(ticker).fast_info
                    price = getattr(fast, "last_price", None) \
                         or getattr(fast, "previous_close", None)
                    if price and price > 0:
                        method = "fast_info"
                except Exception as e:
                    logger.debug(f"[Stocks] {ticker} fast_info falló: {e}")

                # Capa 2: yfinance history
                if not price or price <= 0:
                    try:
                        hist = yf.Ticker(ticker).history(period="5d")
                        if not hist.empty:
                            price  = float(hist["Close"].iloc[-1])
                            method = "history"
                    except Exception as e:
                        logger.debug(f"[Stocks] {ticker} history falló: {e}")

                # Capa 3: HTTP directo (bypass yfinance — mejor en Docker)
                if not price or price <= 0:
                    price = _fetch_stock_price_http(ticker)
                    if price:
                        method = "http_directo"

                # Guardar resultado
                if price and price > 0:
                    _upsert_price(db, ticker, float(price), f"yahoo_{method}")
                    updated += 1
                    logger.info(f"[Stocks] {ticker} = ${price:.4f} (via {method})")
                else:
                    logger.warning(
                        f"[Stocks] {ticker}: sin precio tras 3 intentos — "
                        "posible bloqueo de red o ticker inválido"
                    )

            except Exception as e:
                logger.warning(f"[Stocks] Error inesperado con {ticker}: {e}")

        logger.info(f"[Stocks] {updated}/{len(tickers)} precios actualizados.")

    except Exception as e:
        logger.error(f"[Stocks] Error crítico en job_update_stock_prices: {e}")
    finally:
        db.close()


def job_auto_snapshot() -> None:
    """
    Genera snapshot automático del portafolio al cierre de cada mes.
    Se ejecuta diariamente a las 23:00 y verifica si es el último día del mes.
    """
    now   = datetime.now()
    today = now.day
    last_day = calendar.monthrange(now.year, now.month)[1]

    if today != last_day:
        return

    db = SessionLocal()
    try:
        investments = db.query(models.Investment).all()
        if not investments:
            logger.info("[AutoSnapshot] Sin inversiones, saltando.")
            return

        # Verificar si ya existe snapshot del día
        date_str = now.strftime("%Y-%m-%d")
        existing = db.query(models.PortfolioSnapshot).filter(
            models.PortfolioSnapshot.date.startswith(date_str)
        ).first()
        if existing:
            logger.info(f"[AutoSnapshot] Ya existe snapshot para {date_str}, omitiendo.")
            return

        # Construir snapshot con precios en cache
        price_cache = {
            row.ticker: row.price_usd
            for row in db.query(models.PriceCache).all()
        }

        total_usd = 0.0
        detail    = []
        for inv in investments:
            t     = inv.ticker.upper()
            price = price_cache.get(t, inv.buy_price)  # fallback al precio de compra
            value = inv.quantity * price
            total_usd += value
            detail.append({
                "ticker":    t,
                "name":      inv.name,
                "qty":       inv.quantity,
                "price_usd": round(price, 4),
                "value_usd": round(value, 2),
            })

        total_pen = round(total_usd * _exchange_rate, 2)
        snap = models.PortfolioSnapshot(
            date          = f"{date_str} 23:00",
            total_usd     = round(total_usd, 2),
            total_pen     = total_pen,
            exchange_rate = _exchange_rate,
            detail        = detail,
        )
        db.add(snap)
        db.commit()
        logger.info(
            f"[AutoSnapshot] Snapshot de fin de mes guardado: "
            f"${total_usd:.2f} | S/{total_pen:.2f} | {date_str}"
        )

    except Exception as e:
        logger.error(f"[AutoSnapshot] Error generando snapshot automático: {e}")
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════
# INTERFAZ PÚBLICA
# ═══════════════════════════════════════════════════════════════

def get_cached_prices(db: Session) -> dict:
    """
    Devuelve todos los precios en cache junto con metadata.
    Usado por el endpoint GET /investments/prices/current
    """
    rows = db.query(models.PriceCache).all()
    prices = {}
    oldest: Optional[datetime] = None

    for row in rows:
        prices[row.ticker] = {
            "price_usd":  row.price_usd,
            "source":     row.source,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        if row.updated_at:
            if oldest is None or row.updated_at < oldest:
                oldest = row.updated_at

    return {
        "prices":        prices,
        "exchange_rate": _exchange_rate,
        "last_updated":  oldest.isoformat() if oldest else None,
        "count":         len(prices),
    }


def refresh_all_now() -> dict:
    """
    Actualización manual inmediata de todos los precios.
    Llamado por POST /investments/prices/refresh
    """
    job_update_exchange_rate()
    job_update_crypto_prices()
    job_update_stock_prices()
    return {"message": "Actualización completada", "timestamp": datetime.utcnow().isoformat()}


def get_exchange_rate() -> float:
    return _exchange_rate


# ═══════════════════════════════════════════════════════════════
# SCHEDULER — se inicia desde main.py con lifespan
# ═══════════════════════════════════════════════════════════════

_scheduler: Optional[BackgroundScheduler] = None


def start_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        return

    _scheduler = BackgroundScheduler(timezone="America/Lima")

    # Tipo de cambio: cada 1 hora
    _scheduler.add_job(
        job_update_exchange_rate,
        trigger=IntervalTrigger(hours=1),
        id="exchange_rate",
        replace_existing=True,
        next_run_time=datetime.now(),   # ejecutar inmediatamente al arrancar
    )

    # Crypto: cada 4 horas
    _scheduler.add_job(
        job_update_crypto_prices,
        trigger=IntervalTrigger(hours=4),
        id="crypto_prices",
        replace_existing=True,
        next_run_time=datetime.now(),   # ejecutar inmediatamente al arrancar
    )

    # Acciones: cada 6 horas
    _scheduler.add_job(
        job_update_stock_prices,
        trigger=IntervalTrigger(hours=6),
        id="stock_prices",
        replace_existing=True,
        next_run_time=datetime.now(),   # ejecutar inmediatamente al arrancar
    )

    # Snapshot automático: todos los días a las 23:00
    _scheduler.add_job(
        job_auto_snapshot,
        trigger=CronTrigger(hour=23, minute=0),
        id="auto_snapshot",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info("✅ Price Scheduler iniciado — crypto/4h · stocks/6h · TC/1h · snapshot/fin-mes")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("⏹ Price Scheduler detenido.")
