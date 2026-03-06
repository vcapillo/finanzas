/**
 * FinanzasOS — constants/rules.js
 * Reglas del sistema (base, no editables) y mapeo de IDs para CoinGecko.
 */

// Reglas del sistema eliminadas — toda clasificación es personalizada (reglas en Configuración → Reglas)
export const SYSTEM_RULES = [];

export const COINGECKO_IDS = {
  BTC:"bitcoin", ETH:"ethereum", BNB:"binancecoin", SOL:"solana",
  ADA:"cardano", XRP:"ripple",   MATIC:"matic-network", DOT:"polkadot",
  AVAX:"avalanche-2", LINK:"chainlink", UNI:"uniswap", DOGE:"dogecoin",
  USDT:"tether", USDC:"usd-coin", LTC:"litecoin", ATOM:"cosmos",
};
