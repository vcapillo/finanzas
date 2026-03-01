/**
 * FinanzasVH — constants/rules.js
 * Reglas del sistema (base, no editables) y mapeo de IDs para CoinGecko.
 */

export const SYSTEM_RULES = [
  {label:"Wong / Vivanda",      pattern:"WONG|VIVANDA",                                     type:"gasto_variable", category:"Alimentación"        },
  {label:"Plaza Vea",           pattern:"PLAZA.?VEA|SPSA|PVEA",                             type:"gasto_variable", category:"Alimentación"        },
  {label:"Metro / Cencosud",    pattern:"METRO\\b|CENCOSUD",                                type:"gasto_variable", category:"Alimentación"        },
  {label:"Tottus / Makro",      pattern:"TOTTUS|MAKRO",                                     type:"gasto_variable", category:"Alimentación"        },
  {label:"La Chalupa",          pattern:"CORPORACION.LA.C|CHALUPA",                         type:"gasto_variable", category:"Alimentación"        },
  {label:"Canasto",             pattern:"CANASTO|OPENPAY.*CANASTO",                         type:"gasto_variable", category:"Alimentación"        },
  {label:"MASS / Tambo",        pattern:"MASS\\b|TAMBO",                                    type:"gasto_variable", category:"Alimentación"        },
  {label:"InkaFarma",           pattern:"IKF|INKAFARMA",                                    type:"gasto_variable", category:"Salud/Farmacia"      },
  {label:"Mifarma / Botica",    pattern:"MIFARMA|FASA|BOTICA",                              type:"gasto_variable", category:"Salud/Farmacia"      },
  {label:"Grifo / Gasolina",    pattern:"PRIMAX|REPSOL|PECSA|PETRO|GRIFO|GO COMBUSTIBLES",  type:"gasto_variable", category:"Transporte/Gasolina" },
  {label:"Uber / Cabify",       pattern:"UBER|CABIFY|INDRIVER",                             type:"gasto_variable", category:"Transporte/Gasolina" },
  {label:"Parking",             pattern:"APPARKA|PARKING|PARQUEO",                          type:"gasto_variable", category:"Transporte/Gasolina" },
  {label:"Netflix",             pattern:"NETFLIX",                                          type:"gasto_fijo",     category:"Suscripciones"       },
  {label:"Apple",               pattern:"APPLE\\b|APPLE\\.COM",                             type:"gasto_fijo",     category:"Suscripciones"       },
  {label:"Spotify",             pattern:"SPOTIFY",                                          type:"gasto_fijo",     category:"Suscripciones"       },
  {label:"Pacífico / Rimac",    pattern:"PACIFICO|RIMAC|MAPFRE",                            type:"gasto_fijo",     category:"Seguros"             },
  {label:"Seguro desgravamen",  pattern:"SEGURO.?DESGRAVAMEN|DESGRAVAMEN",                  type:"gasto_fijo",     category:"Seguros"             },
  {label:"Luz Enel",            pattern:"ENEL|LUZ.DEL.SUR",                                 type:"gasto_fijo",     category:"Luz"                 },
  {label:"Agua Sedapal",        pattern:"SEDAPAL",                                          type:"gasto_fijo",     category:"Agua"                },
  {label:"Internet / Telefonía",pattern:"CLARO|MOVISTAR|ENTEL",                             type:"gasto_fijo",     category:"Internet/Cable"      },
  {label:"Hogar Jennifer",      pattern:"JENNIFER|ESPOSA",                                  type:"gasto_fijo",     category:"Hogar (Jennifer)"    },
  {label:"Pago Tarjeta BBVA",   pattern:"BM\\.?\\s*PAGO.?TARJET|PAGO.*TARJETA.*BBVA",      type:"deuda",          category:"Tarjeta BBVA"        },
  {label:"Pago Tarjeta iO",     pattern:"PAGO.*IO|IO.*PAGO",                                type:"deuda",          category:"Tarjeta iO"          },
  {label:"Sueldo MINEDU",       pattern:"SUELDO|REMUNERACION|HABERES|MINEDU",               type:"ingreso",        category:"Sueldo"              },
  {label:"Gratificación",       pattern:"GRATIFICACION",                                    type:"ingreso",        category:"Gratificación"       },
  {label:"CTS",                 pattern:"CTS\\b",                                           type:"ingreso",        category:"CTS"                 },
  {label:"Agora Ahorro",        pattern:"AGORA",                                            type:"ahorro",         category:"Ahorro programado"   },
  {label:"Restaurantes / Chifa",pattern:"RESTAURAN|KFC|MC.?DONALD|BEMBOS|PIZZA|BUFFET|DON BUFFET|CHIFA|PARRI", type:"gasto_variable", category:"Restaurante"},
  {label:"Ropa / Tiendas",      pattern:"SAGA|FALABELLA|RIPLEY|ZARA|OECHSLE",               type:"gasto_variable", category:"Ropa"                },
  {label:"Compras online",      pattern:"AMAZON|MERCADO.?LIBRE|LINIO",                      type:"gasto_variable", category:"Compras online"      },
  // ── Transferencias internas entre cuentas propias ──────────────────────────
  {label:"Transfer BBVA→BCP",   pattern:"Transferencia a BCP Digital|TRANSF.*BCP",           type:"gasto_variable", category:"Movimiento interno", isInternal:true },
  {label:"Transfer BCP→BBVA",   pattern:"TRANSF\\.BCO\\.BBVA|BANCO DE CREDITO D|TRAN\\.CTAS\\.TERC\\.BM", type:"gasto_variable", category:"Movimiento interno", isInternal:true },
  {label:"Transfer BBVA→YAPE",  pattern:"YAPE.*SALIDA|TRANSF.*YAPE",                         type:"gasto_variable", category:"Movimiento interno", isInternal:true },
  {label:"Transfer entre ctas", pattern:"TRANSF.*CTA|CTA.*TRANSF|TRANSFER.*PROPIA",           type:"gasto_variable", category:"Movimiento interno", isInternal:true },
  {label:"TRANSF INMEDIATA BCP", pattern:"TRANSF INMEDIATA AL 002|TRANSF.*INMEDIATA.*002",   type:"gasto_variable", category:"Movimiento interno", isInternal:true },
  // ── Comercios generales ────────────────────────────────────────────────────
  {label:"Promart / Sodimac",   pattern:"PROMART|SODIMAC",                                  type:"gasto_variable", category:"Otro variable"       },
];

export const COINGECKO_IDS = {
  BTC:"bitcoin", ETH:"ethereum", BNB:"binancecoin", SOL:"solana",
  ADA:"cardano", XRP:"ripple",   MATIC:"matic-network", DOT:"polkadot",
  AVAX:"avalanche-2", LINK:"chainlink", UNI:"uniswap", DOGE:"dogecoin",
  USDT:"tether", USDC:"usd-coin", LTC:"litecoin", ATOM:"cosmos",
};
