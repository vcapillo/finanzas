# ============================================================
# FinanzasVH v3.0 — services/gemini_service.py
# SDK: google-genai (nuevo)  |  Modelo: gemini-2.0-flash-lite
# Con fallback local para cuando la cuota de Gemini esté agotada
# ============================================================

import json
import os
import re
from datetime import datetime, timedelta
from google import genai
from google.genai import types
from google.genai.errors import ClientError
from sqlalchemy.orm import Session

MODEL_NAME = "gemini-2.5-flash-lite"

# ── SYSTEM PROMPT ────────────────────────────────────────────

SYSTEM_PROMPT_PARSER = """
Eres un motor de extracción financiera de alta precisión especializado en extractos
bancarios peruanos y estados de cuenta de brokers internacionales.

## TU TAREA
Recibir texto crudo de un extracto bancario o estado de cuenta y devolver un JSON
estructurado con la lista de transacciones.

## CAMPOS OBLIGATORIOS POR TRANSACCIÓN
{
  "date": "YYYY-MM-DD",
  "description": "descripción original sin modificar",
  "merchant_clean": "nombre comercial limpio (ej: 'InkaFarma', 'Canasto', 'BBVA')",
  "amount": 0.00,
  "currency": "PEN | USD",
  "type": "INGRESO | GASTO | TRANSFERENCIA_INTERNA | COMISION",
  "category_suggestion": "string descriptivo o null",
  "confidence": 0.0
}

## REGLAS DE CLASIFICACIÓN
- "BM. PAGO TARJETA D..." → type: TRANSFERENCIA_INTERNA
- "OPENPAY*CANASTO" → merchant_clean: "Canasto", category_suggestion: "Supermercado"
- "IKF..." → merchant_clean: "InkaFarma", category_suggestion: "Salud"
- "CORPORACION LA C..." → merchant_clean: "La Chalupa", category_suggestion: "Alimentación"
- Sueldo / haberes / remuneración → type: INGRESO, category_suggestion: "Sueldo"
- Transferencias entre cuentas propias → type: TRANSFERENCIA_INTERNA

## DETECCIÓN DE DUPLICADOS
Para cada tx nueva, evalúa si coincide con las existentes (±0.5% monto, ±3 días, nombre similar).
Si hay colisión, añade: "duplicate_score": 0.0, "duplicate_reasoning": "..."

## FORMATO DE SALIDA — SOLO JSON VÁLIDO, SIN MARKDOWN

{
  "transactions": [...],
  "summary": {
    "total_parsed": 0,
    "possible_duplicates": 0,
    "total_ingresos_pen": 0.0,
    "total_gastos_pen": 0.0,
    "currency_detected": "PEN | USD | MIXED"
  }
}
"""

# ── CLASIFICADOR LOCAL (fallback sin Gemini) ──────────────────

_LOCAL_RULES = [
    # (patrón regex, type, category, merchant_clean)
    (r"SUELDO|REMUNERACION|HABERES|MINEDU",          "INGRESO",              "Sueldo",              None),
    (r"GRATIFICACION",                                "INGRESO",              "Gratificación",       None),
    (r"CTS\b",                                        "INGRESO",              "CTS",                 None),
    (r"BM\.?\s*PAGO.?TARJET",                         "TRANSFERENCIA_INTERNA","Pago tarjeta propia", "BBVA"),
    (r"OPENPAY.*CANASTO|CANASTO",                     "GASTO",                "Supermercado",        "Canasto"),
    (r"IKF|INKAFARMA",                                "GASTO",                "Salud",               "InkaFarma"),
    (r"MIFARMA|FASA",                                 "GASTO",                "Salud",               "Mifarma"),
    (r"CORPORACION.LA.C|CHALUPA",                     "GASTO",                "Alimentación",        "La Chalupa"),
    (r"WONG|VIVANDA",                                 "GASTO",                "Supermercado",        "Wong"),
    (r"PLAZA.?VEA|SPSA|PVEA",                         "GASTO",                "Supermercado",        "Plaza Vea"),
    (r"METRO\b|CENCOSUD",                             "GASTO",                "Supermercado",        "Metro"),
    (r"TOTTUS",                                       "GASTO",                "Supermercado",        "Tottus"),
    (r"MASS\b|TAMBO",                                 "GASTO",                "Supermercado",        "Mass/Tambo"),
    (r"NETFLIX",                                      "GASTO",                "Suscripciones",       "Netflix"),
    (r"SPOTIFY",                                      "GASTO",                "Suscripciones",       "Spotify"),
    (r"APPLE\b|APPLE\.COM",                           "GASTO",                "Suscripciones",       "Apple"),
    (r"ENEL|LUZ.DEL.SUR",                             "GASTO",                "Servicios",           "Enel"),
    (r"SEDAPAL",                                      "GASTO",                "Servicios",           "Sedapal"),
    (r"CLARO|MOVISTAR|ENTEL",                         "GASTO",                "Servicios",           None),
    (r"UBER|CABIFY|INDRIVER",                         "GASTO",                "Transporte",          None),
    (r"PRIMAX|REPSOL|PECSA|GRIFO",                    "GASTO",                "Gasolina",            None),
    (r"PACIFICO|RIMAC|MAPFRE",                        "GASTO",                "Seguros",             None),
    (r"KFC|MC.?DONALD|BEMBOS|PIZZA|RESTAURAN|CHIFA",  "GASTO",               "Restaurante",         None),
    (r"SAGA|FALABELLA|RIPLEY|OECHSLE|ZARA",           "GASTO",                "Ropa",                None),
    (r"AMAZON|MERCADO.?LIBRE",                        "GASTO",                "Compras online",      None),
    (r"AGORA",                                        "TRANSFERENCIA_INTERNA","Ahorro programado",   "Agora"),
]

_DATE_PATS = [
    re.compile(r"^(\d{2})[/\-](\d{2})[/\-](\d{4})"),   # DD/MM/YYYY
    re.compile(r"^(\d{4})[/\-](\d{2})[/\-](\d{2})"),   # YYYY-MM-DD
    re.compile(r"^(\d{2})[/\-](\d{2})[/\-](\d{2})\b"), # DD/MM/YY
]

def _parse_date(token: str):
    """Intenta parsear un token como fecha → YYYY-MM-DD o None."""
    for pat in _DATE_PATS:
        m = pat.match(token)
        if m:
            g = m.groups()
            if len(g[0]) == 4:          # YYYY-MM-DD
                y, mo, d = g
            else:                        # DD/MM/YYYY o DD/MM/YY
                d, mo, y = g
                if len(y) == 2:
                    y = "20" + y
            try:
                datetime(int(y), int(mo), int(d))
                return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"
            except ValueError:
                pass
    return None

def _classify_local(description: str, amount: float):
    """Aplica reglas locales → (type, category, merchant_clean)."""
    desc_up = description.upper()
    for pattern, txtype, cat, merchant in _LOCAL_RULES:
        if re.search(pattern, desc_up):
            return txtype, cat, merchant or description[:40]
    # Fallback por monto
    if amount > 0:
        return "INGRESO", "Otro ingreso", description[:40]
    return "GASTO", "Otro gasto", description[:40]

def _local_parse(raw_text: str, period: str) -> dict:
    """
    Parser local basado en regex — no necesita Gemini.
    Lee línea a línea buscando fecha + descripción + monto.
    """
    transactions = []
    lines = raw_text.splitlines()

    for line in lines:
        line = line.strip()
        if not line:
            continue

        tokens = line.split()
        if not tokens:
            continue

        # Buscar fecha al inicio
        iso_date = _parse_date(tokens[0])
        if not iso_date:
            continue

        # Buscar montos al final (último o penúltimos tokens)
        amount = None
        desc_tokens = tokens[1:]
        for i in range(len(desc_tokens) - 1, -1, -1):
            raw = desc_tokens[i].replace(",", "").replace("S/", "").strip()
            try:
                val = float(raw)
                # Monto razonable (> 0.01 y < 1,000,000)
                if 0.01 < abs(val) < 1_000_000:
                    amount = val
                    desc_tokens = desc_tokens[:i]
                    break
            except ValueError:
                pass

        if amount is None or not desc_tokens:
            continue

        description = " ".join(desc_tokens).strip()
        if len(description) < 2:
            continue

        # Clasificar
        txtype, category, merchant = _classify_local(description, amount)
        # Signo: positivo = ingreso, negativo = gasto
        if txtype == "INGRESO" and amount < 0:
            amount = abs(amount)
        elif txtype == "GASTO" and amount > 0:
            amount = -amount

        transactions.append({
            "date":               iso_date,
            "description":        description,
            "merchant_clean":     merchant,
            "amount":             round(amount, 2),
            "currency":           "PEN",
            "type":               txtype,
            "category_suggestion": category,
            "confidence":         0.75,
        })

    total_in  = sum(t["amount"] for t in transactions if t["amount"] > 0)
    total_out = sum(abs(t["amount"]) for t in transactions if t["amount"] < 0)

    return {
        "transactions": transactions,
        "summary": {
            "total_parsed":       len(transactions),
            "possible_duplicates": 0,
            "total_ingresos_pen": round(total_in, 2),
            "total_gastos_pen":   round(total_out, 2),
            "currency_detected":  "PEN",
        },
        "_source": "LOCAL_FALLBACK",
    }


# ── SERVICIO ─────────────────────────────────────────────────

class GeminiService:

    def __init__(self):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise EnvironmentError("GEMINI_API_KEY no está definida en las variables de entorno.")
        self._api_key = api_key
        self.client   = genai.Client(api_key=api_key)

    async def parse_extracto(
        self,
        raw_text: str,
        asset_id: int,
        period: str,
        db: Session,
    ) -> dict:
        """
        Intenta parsear con Gemini.
        Si la cuota está agotada (429) usa el parser local como fallback.
        """
        # Transacciones existentes para detección de duplicados
        existing_summary = []
        try:
            from models import Transaction
            existing_txs = (
                db.query(Transaction)
                .filter(Transaction.period == period)
                .order_by(Transaction.date.desc())
                .limit(200)
                .all()
            )
            existing_summary = [
                {"date": str(t.date), "description": t.description, "amount": t.amount}
                for t in existing_txs
            ]
        except Exception:
            pass

        user_prompt = f"""
EXTRACTO A PROCESAR:
Cuenta / Activo ID: {asset_id}  |  Período: {period}

--- TEXTO CRUDO ---
{raw_text}
-------------------

TRANSACCIONES EXISTENTES (para detección de duplicados):
{json.dumps(existing_summary, ensure_ascii=False, indent=2)}
"""
        # ── Intento con Gemini ────────────────────────────────
        try:
            response = self.client.models.generate_content(
                model=MODEL_NAME,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT_PARSER,
                ),
            )
            raw_resp = response.text.strip()
            # Limpiar bloques markdown
            if raw_resp.startswith("```"):
                raw_resp = raw_resp.split("```")[1]
                if raw_resp.startswith("json"):
                    raw_resp = raw_resp[4:]
            raw_resp = raw_resp.rstrip("`").strip()

            result = json.loads(raw_resp)
            result["_source"] = "GEMINI"
            return result

        except ClientError as e:
            # 429 = cuota agotada → fallback local
            if getattr(e, 'status_code', None) == 429 or getattr(e, 'code', None) == 429 or "RESOURCE_EXHAUSTED" in str(e):
                import logging
                logging.warning(
                    "Gemini cuota agotada (429). Usando parser local de fallback. "
                    "Para resolver: habilita billing en https://aistudio.google.com"
                )
                result = _local_parse(raw_text, period)
                result["_warning"] = (
                    "⚠️ Gemini sin cuota disponible — resultado generado por el "
                    "clasificador local. Activa billing en Google AI Studio para "
                    "usar IA completa."
                )
                return result
            raise   # Otro error de cliente → propagar

        except json.JSONDecodeError:
            # Gemini devolvió algo que no es JSON válido → fallback
            result = _local_parse(raw_text, period)
            result["_warning"] = "⚠️ Gemini devolvió respuesta inválida. Se usó el parser local."
            return result
