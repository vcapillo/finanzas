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

# Reglas locales base — se combinan con las reglas de configuración en tiempo de ejecución
# Este array solo se usa como FALLBACK cuando no hay reglas en BD
_FALLBACK_RULES = [
    # (patrón regex, type, category, merchant_clean, es_movimiento_interno)
    (r"SUELDO|REMUNERACION|HABERES|MINEDU",          "INGRESO",              "Sueldo",              None,         False),
    (r"GRATIFICACION",                                "INGRESO",              "Gratificación",       None,         False),
    (r"CTS\b",                                        "INGRESO",              "CTS",                 None,         False),
    (r"BM\.?\s*PAGO.?TARJET",                         "GASTO",               "Tarjeta BBVA",        "BBVA",       False),
    (r"OPENPAY.*CANASTO|CANASTO",                     "GASTO",                "Supermercado",        "Canasto",    False),
    (r"IKF|INKAFARMA",                                "GASTO",                "Salud/Farmacia",      "InkaFarma",  False),
    (r"MIFARMA|FASA",                                 "GASTO",                "Salud/Farmacia",      "Mifarma",    False),
    (r"CORPORACION.LA.C|CHALUPA",                     "GASTO",                "Alimentación",        "La Chalupa", False),
    (r"WONG|VIVANDA",                                 "GASTO",                "Alimentación",        "Wong",       False),
    (r"PLAZA.?VEA|SPSA|PVEA",                         "GASTO",                "Alimentación",        "Plaza Vea",  False),
    (r"METRO\b|CENCOSUD",                             "GASTO",                "Alimentación",        "Metro",      False),
    (r"TOTTUS",                                       "GASTO",                "Alimentación",        "Tottus",     False),
    (r"MASS\b|TAMBO",                                 "GASTO",                "Alimentación",        "Mass/Tambo", False),
    (r"NETFLIX",                                      "GASTO",                "Suscripciones",       "Netflix",    False),
    (r"SPOTIFY",                                      "GASTO",                "Suscripciones",       "Spotify",    False),
    (r"APPLE\b|APPLE\.COM",                           "GASTO",                "Suscripciones",       "Apple",      False),
    (r"ENEL|LUZ.DEL.SUR",                             "GASTO",                "Servicios",           "Enel",       False),
    (r"SEDAPAL",                                      "GASTO",                "Servicios",           "Sedapal",    False),
    (r"CLARO|MOVISTAR|ENTEL",                         "GASTO",                "Servicios",           None,         False),
    (r"UBER|CABIFY|INDRIVER",                         "GASTO",                "Transporte",          None,         False),
    (r"PRIMAX|REPSOL|PECSA|GRIFO",                    "GASTO",                "Gasolina",            None,         False),
    (r"PACIFICO|RIMAC|MAPFRE",                        "GASTO",                "Seguros",             None,         False),
    (r"KFC|MC.?DONALD|BEMBOS|PIZZA|RESTAURAN|CHIFA",  "GASTO",               "Restaurante",         None,         False),
    (r"SAGA|FALABELLA|RIPLEY|OECHSLE|ZARA",           "GASTO",                "Ropa",                None,         False),
    (r"AMAZON|MERCADO.?LIBRE",                        "GASTO",                "Compras online",      None,         False),
    (r"AGORA",                                        "TRANSFERENCIA_INTERNA","Ahorro programado",   "Agora",      True),
]


def _build_local_rules(settings_rules: list = None) -> list:
    """
    Combina las reglas de configuración (desde BD) con las reglas fallback.
    Las reglas de configuración tienen MAYOR prioridad.
    Retorna lista de tuplas (pattern, type, category, merchant, es_movimiento_interno).
    """
    combined = []

    if settings_rules:
        # Filtrar solo activas, ordenar por prioridad (menor = primero)
        active = sorted(
            [r for r in settings_rules if r.get("activa", True)],
            key=lambda r: r.get("prioridad", 50)
        )
        for rule in active:
            combined.append((
                rule.get("pattern", ""),
                rule.get("type", "GASTO").upper() if rule.get("type") not in ("INGRESO","GASTO","TRANSFERENCIA_INTERNA","COMISION") else rule.get("type", "GASTO"),
                rule.get("category", ""),
                rule.get("label"),
                rule.get("es_movimiento_interno", False),
            ))

    # Agregar fallback solo para patrones que no estén en las reglas de configuración
    if not settings_rules:
        combined.extend(_FALLBACK_RULES)

    return combined

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

def _classify_local(description: str, amount: float, rules: list = None):
    """Aplica reglas dinámicas → (type, category, merchant_clean, es_movimiento_interno)."""
    active_rules = rules if rules is not None else _FALLBACK_RULES
    desc_up = description.upper()
    for item in active_rules:
        pattern = item[0]; txtype = item[1]; cat = item[2]; merchant = item[3]
        es_interno = item[4] if len(item) > 4 else False
        if re.search(pattern, desc_up):
            return txtype, cat, merchant or description[:40], es_interno
    # Fallback por monto
    if amount > 0:
        return "INGRESO", "Otro ingreso", description[:40], False
    return "GASTO", "Otro gasto", description[:40], False

def _local_parse(raw_text: str, period: str, settings_rules: list = None) -> dict:
    """
    Parser local basado en regex — no necesita Gemini.
    Lee línea a línea buscando fecha + descripción + monto.
    Acepta reglas dinámicas desde la configuración del usuario.
    """
    active_rules = _build_local_rules(settings_rules)
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

        # Clasificar con reglas dinámicas
        txtype, category, merchant, es_interno = _classify_local(description, amount, active_rules)
        # Signo: positivo = ingreso, negativo = gasto
        if txtype == "INGRESO" and amount < 0:
            amount = abs(amount)
        elif txtype in ("GASTO", "TRANSFERENCIA_INTERNA") and amount > 0:
            amount = -amount

        transactions.append({
            "date":                  iso_date,
            "description":           description,
            "merchant_clean":        merchant,
            "amount":                round(amount, 2),
            "currency":              "PEN",
            "type":                  txtype,
            "category_suggestion":   category,
            "confidence":            0.75,
            "es_movimiento_interno": es_interno,
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

# ── Excepciones del servicio ─────────────────────────────────

class GeminiQuotaExceeded(Exception):
    """Ambas keys (principal y alternativa) superaron la cuota de Gemini."""
    pass

class GeminiError(Exception):
    """Error genérico de Gemini no relacionado a cuota."""
    pass


class GeminiService:

    def __init__(self):
        api_key     = os.environ.get("GEMINI_API_KEY")
        api_key_alt = os.environ.get("GEMINI_API_KEY_ALT")

        if not api_key:
            raise EnvironmentError("GEMINI_API_KEY no está definida en las variables de entorno.")

        self._key_primary = api_key
        self._key_alt     = api_key_alt

        # Clientes separados por key — se crean una vez y se reutilizan
        self._client_primary = genai.Client(api_key=api_key)
        self._client_alt     = genai.Client(api_key=api_key_alt) if api_key_alt else None

        import logging as _logging
        self._log = _logging.getLogger("gemini_service")
        if api_key_alt:
            self._log.info("[Gemini] Key alternativa configurada — fallback automático activo")
        else:
            self._log.info("[Gemini] Solo key principal configurada (sin GEMINI_API_KEY_ALT)")

    # ── Método base: generate_text con fallback de keys ──────────
    def generate_text(self, system_prompt: str, user_prompt: str) -> tuple[str, str]:
        """
        Llama a Gemini con fallback automático de key.
        Retorna (texto_respuesta, fuente) donde fuente = 'GEMINI_PRIMARY' | 'GEMINI_ALT'.
        Lanza GeminiQuotaExceeded si ambas keys están agotadas.
        Lanza GeminiError para errores no relacionados a cuota.
        """
        keys = [("GEMINI_PRIMARY", self._client_primary)]
        if self._client_alt:
            keys.append(("GEMINI_ALT", self._client_alt))

        last_error = None

        for label, client in keys:
            try:
                self._log.info(f"[Gemini] Llamada con key {label}")
                response = client.models.generate_content(
                    model=MODEL_NAME,
                    contents=user_prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system_prompt,
                    ),
                )
                self._log.info(f"[Gemini] Respuesta OK con key {label}")
                return response.text.strip(), label

            except ClientError as e:
                is_quota = (
                    getattr(e, "status_code", None) == 429
                    or getattr(e, "code", None) == 429
                    or "RESOURCE_EXHAUSTED" in str(e)
                    or "429" in str(e)
                )
                if is_quota:
                    self._log.warning(
                        f"[Gemini] Cuota agotada en key {label}."
                        f"{' Intentando key alternativa...' if label == 'GEMINI_PRIMARY' and self._client_alt else ' Sin más opciones.'}"
                    )
                    last_error = e
                    continue  # Probar con la siguiente key
                else:
                    self._log.error(f"[Gemini] Error no recuperable con key {label}: {e}")
                    raise GeminiError(str(e)) from e

            except Exception as e:
                self._log.error(f"[Gemini] Error inesperado con key {label}: {e}")
                raise GeminiError(str(e)) from e

        # Ambas keys agotadas
        msg = (
            "Cuota de Gemini superada en todas las keys configuradas. "
            "Espera unos minutos o agrega GEMINI_API_KEY_ALT en el .env con una segunda cuenta Google."
        )
        raise GeminiQuotaExceeded(msg)

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
        # Intento con Gemini (fallback automatico de key incluido)
        try:
            raw_resp, fuente = self.generate_text(SYSTEM_PROMPT_PARSER, user_prompt)

            # Limpiar bloques markdown
            if raw_resp.startswith("```"):
                raw_resp = raw_resp.split("```")[1]
                if raw_resp.startswith("json"):
                    raw_resp = raw_resp[4:]
            raw_resp = raw_resp.rstrip("`").strip()

            result = json.loads(raw_resp)
            result["_source"] = fuente
            return result

        except GeminiQuotaExceeded as e:
            import logging
            logging.warning(f"[Gemini] {e} - Usando parser local de fallback.")
            result = _local_parse(raw_text, period)
            result["_warning"] = (
                "Cuota de Gemini agotada en todas las keys - resultado generado por el "
                "clasificador local. Agrega GEMINI_API_KEY_ALT en el .env para ampliar la cuota."
            )
            return result

        except GeminiError as e:
            import logging
            logging.error(f"[Gemini] Error no recuperable: {e}")
            result = _local_parse(raw_text, period)
            result["_warning"] = f"Error de Gemini: {e}. Se uso el parser local."
            return result

        except json.JSONDecodeError:
            result = _local_parse(raw_text, period)
            result["_warning"] = "Gemini devolvio respuesta invalida. Se uso el parser local."
            return result
