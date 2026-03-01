"""
FinanzasVH — services/pdf_service.py
F-08: Generación de Reportes PDF con Gráficos

Genera el resumen mensual de salud financiera como PDF con marca FinanzasVH.
Incluye 4 gráficos nativos ReportLab intercalados en cada sección:
  1. Barras horizontales de KPIs con semáforo  → después de KPIs
  2. Radar de salud financiera (6 dimensiones) → después de diagnóstico
  3. Torta de distribución de gastos           → después de top categorías
  4. Barras comparativas mes actual vs anterior → en sección comparativa

Uso:
    from services.pdf_service import generar_pdf_resumen
    pdf_bytes = generar_pdf_resumen(period, contenido, datos_graficos)
"""

import io
import logging
import math
from datetime import datetime

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.piecharts import Pie
# SpiderChart no se usa — radar implementado manualmente con Drawing
from reportlab.graphics.shapes import (
    Drawing,
    Line,
    Rect,
    String,
    Circle,
    Group,
)
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

logger = logging.getLogger("pdf_service")

# ─── Paleta FinanzasVH ────────────────────────────────────────
C_BRAND     = colors.HexColor("#a78bfa")
C_BRAND2    = colors.HexColor("#38bdf8")
C_GREEN     = colors.HexColor("#22c55e")
C_YELLOW    = colors.HexColor("#f59e0b")
C_RED       = colors.HexColor("#ef4444")
C_TEXT      = colors.HexColor("#1a1a2e")
C_MUTED     = colors.HexColor("#6b7280")
C_LINE      = colors.HexColor("#e5e5ea")
C_CARD_BG   = colors.HexColor("#f8f8fc")
C_HEADER_BG = colors.HexColor("#1e1b4b")

# Paleta para torta (categorías)
PALETTE = [
    colors.HexColor("#a78bfa"),
    colors.HexColor("#38bdf8"),
    colors.HexColor("#f59e0b"),
    colors.HexColor("#22c55e"),
    colors.HexColor("#ef4444"),
    colors.HexColor("#fb923c"),
    colors.HexColor("#e879f9"),
    colors.HexColor("#34d399"),
]

# Ancho útil en puntos (A4 − márgenes 1.8cm c/u)
W_DRAW = int(A4[0] - 2 * 1.8 * cm)   # ≈ 493 pt


# ═══════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════

def _sem_color(semaforo: str) -> colors.Color:
    return {"verde": C_GREEN, "amarillo": C_YELLOW, "rojo": C_RED}.get(semaforo, C_YELLOW)

def _score_color(score: float) -> colors.Color:
    if score >= 70: return C_GREEN
    if score >= 40: return C_YELLOW
    return C_RED

def _fmt_pen(v: float) -> str:
    try:    return f"S/ {v:,.0f}"
    except: return "S/ 0"

def _fmt_pct(v: float) -> str:
    try:    return f"{v:.1f}%"
    except: return "0.0%"

def _period_label(period: str) -> str:
    meses = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
             "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
    try:
        y, m = int(period[:4]), int(period[5:7])
        return f"{meses[m]} {y}"
    except:
        return period

def _period_short(period: str) -> str:
    meses = ["","Ene","Feb","Mar","Abr","May","Jun",
             "Jul","Ago","Sep","Oct","Nov","Dic"]
    try:
        y, m = int(period[:4]), int(period[5:7])
        return f"{meses[m]}.{str(y)[2:]}"
    except:
        return period


# ═══════════════════════════════════════════════════════════════
# ESTILOS
# ═══════════════════════════════════════════════════════════════

def _build_styles() -> dict:
    return {
        "section": ParagraphStyle("section", fontName="Helvetica-Bold", fontSize=10,
                                  textColor=C_MUTED, leading=13, letterSpacing=1),
        "body":    ParagraphStyle("body",    fontName="Helvetica",      fontSize=10,
                                  textColor=C_TEXT, leading=15, spaceAfter=2),
        "kpi_label": ParagraphStyle("kpi_label", fontName="Helvetica",  fontSize=8,
                                    textColor=C_MUTED, alignment=TA_CENTER, leading=11),
        "kpi_meta":  ParagraphStyle("kpi_meta",  fontName="Helvetica",  fontSize=7,
                                    textColor=colors.HexColor("#888899"), alignment=TA_CENTER, leading=10),
        "rec_num":   ParagraphStyle("rec_num",   fontName="Helvetica-Bold", fontSize=10,
                                    textColor=C_BRAND, alignment=TA_CENTER, leading=13),
        "rec_text":  ParagraphStyle("rec_text",  fontName="Helvetica",  fontSize=10,
                                    textColor=C_TEXT, leading=14),
        "footer":    ParagraphStyle("footer",    fontName="Helvetica",  fontSize=8,
                                    textColor=colors.HexColor("#aaaabc"), alignment=TA_CENTER, leading=11),
        "quote":     ParagraphStyle("quote",     fontName="Helvetica-Oblique", fontSize=9,
                                    textColor=C_MUTED, alignment=TA_CENTER, leading=13),
        "tag":       ParagraphStyle("tag",       fontName="Helvetica-Bold", fontSize=8,
                                    textColor=colors.white, alignment=TA_CENTER, leading=11),
        "chart_note": ParagraphStyle("chart_note", fontName="Helvetica", fontSize=7,
                                     textColor=C_MUTED, alignment=TA_CENTER, leading=10),
    }


# ═══════════════════════════════════════════════════════════════
# GRÁFICO 1 — Barras horizontales KPIs con semáforo
# ═══════════════════════════════════════════════════════════════

def _chart_kpi_bars(kpis: list) -> Drawing:
    """
    Barras horizontales para cada KPI (score 0-100) con:
    - Fondo gris de la barra completa
    - Barra coloreada según semáforo (verde/amarillo/rojo)
    - Línea de meta a 70 puntos
    - Etiqueta de valor real y score
    """
    bar_h     = 16
    gap       = 14
    label_w   = 95
    val_w     = 52
    bar_area  = W_DRAW - label_w - val_w - 10
    n         = len(kpis)
    height    = n * (bar_h + gap) + gap + 20
    d         = Drawing(W_DRAW, height)

    # Línea de meta (70%) — trazada una sola vez sobre todas las barras
    meta_x = label_w + bar_area * 0.70
    d.add(Line(meta_x, gap - 4, meta_x, height - 10,
               strokeColor=colors.HexColor("#9ca3af"),
               strokeWidth=0.8, strokeDashArray=[3, 3]))
    d.add(String(meta_x + 2, height - 8, "meta",
                 fontName="Helvetica", fontSize=6.5,
                 fillColor=colors.HexColor("#9ca3af"), textAnchor="start"))

    for i, kpi in enumerate(kpis):
        # Coordenada y desde arriba hacia abajo
        y0 = height - gap - 12 - i * (bar_h + gap)

        score = float(kpi.get("score", 0))
        color = _score_color(score)

        # Etiqueta del KPI
        d.add(String(0, y0 + bar_h * 0.3, kpi.get("label", ""),
                     fontName="Helvetica", fontSize=8.5,
                     fillColor=C_TEXT, textAnchor="start"))

        # Fondo de barra
        d.add(Rect(label_w, y0, bar_area, bar_h,
                   fillColor=colors.HexColor("#e9ecef"),
                   strokeColor=None))

        # Barra de score
        filled = bar_area * score / 100
        if filled > 0:
            d.add(Rect(label_w, y0, filled, bar_h,
                       fillColor=color, strokeColor=None,
                       rx=2, ry=2))

        # Valor y score a la derecha
        val_str  = f"{kpi.get('value', 0)}{kpi.get('unit', '%')}"
        scr_str  = f"({score:.0f}/100)"
        d.add(String(label_w + bar_area + 8, y0 + bar_h * 0.55,
                     val_str,
                     fontName="Helvetica-Bold", fontSize=8,
                     fillColor=color, textAnchor="start"))
        d.add(String(label_w + bar_area + 8, y0 + bar_h * 0.1,
                     scr_str,
                     fontName="Helvetica", fontSize=7,
                     fillColor=C_MUTED, textAnchor="start"))

    return d


# ═══════════════════════════════════════════════════════════════
# GRÁFICO 2 — Radar de salud financiera (Drawing manual)
# Sin depender de SpiderChart — implementado con polígonos y trig.
# ═══════════════════════════════════════════════════════════════

def _chart_radar(radar_data: list, semaforo: str) -> Drawing:
    """
    Radar/Spider chart manual con 6 dimensiones de salud financiera.
    Dibuja grillas, ejes, zona meta y zona score con primitivas Drawing.
    radar_data: list de dicts con 'label' y 'score' (0-100)
    """
    from reportlab.graphics.shapes import Polygon, PolyLine

    draw_h  = 240
    d       = Drawing(W_DRAW, draw_h)

    n        = len(radar_data)
    cx       = W_DRAW * 0.38          # centro X
    cy       = draw_h / 2 - 5         # centro Y
    R        = min(W_DRAW * 0.30, draw_h * 0.42)  # radio máximo
    LEVELS   = 5                       # anillos de grilla
    fill_col = _sem_color(semaforo)

    # Ángulo inicial: arriba (90°), sentido anti-horario
    def angle(i: int) -> float:
        return math.pi / 2 + 2 * math.pi * i / n

    def pt(i: int, r: float):
        """Punto en el eje i a radio r."""
        a = angle(i)
        return cx + r * math.cos(a), cy + r * math.sin(a)

    # ── Grilla (polígonos concéntricos) ──────────────────────
    for lv in range(1, LEVELS + 1):
        r_lv = R * lv / LEVELS
        pts  = []
        for i in range(n):
            x, y = pt(i, r_lv)
            pts.extend([x, y])
        pts.extend(pts[:2])   # cerrar
        d.add(PolyLine(
            pts,
            strokeColor = colors.HexColor("#d1d5db"),
            strokeWidth = 0.4,
        ))

    # ── Ejes radiales ─────────────────────────────────────────
    for i in range(n):
        x1, y1 = pt(i, R)
        d.add(Line(cx, cy, x1, y1,
                   strokeColor=colors.HexColor("#d1d5db"),
                   strokeWidth=0.5))

    # ── Zona meta (70%) — polígono gris ───────────────────────
    meta_pts = []
    for i in range(n):
        x, y = pt(i, R * 0.70)
        meta_pts.extend([x, y])
    d.add(Polygon(
        meta_pts,
        fillColor   = colors.Color(0.88, 0.90, 0.92, alpha=0.30),
        strokeColor = colors.HexColor("#9ca3af"),
        strokeWidth = 0.8,
    ))

    # ── Zona score real — polígono semáforo ───────────────────
    score_pts = []
    for i, item in enumerate(radar_data):
        r_s  = R * float(item.get("score", 0)) / 100
        x, y = pt(i, r_s)
        score_pts.extend([x, y])
    d.add(Polygon(
        score_pts,
        fillColor   = colors.Color(fill_col.red, fill_col.green, fill_col.blue, alpha=0.20),
        strokeColor = fill_col,
        strokeWidth = 1.8,
    ))

    # Puntos en cada vértice del score
    for i, item in enumerate(radar_data):
        r_s  = R * float(item.get("score", 0)) / 100
        x, y = pt(i, r_s)
        d.add(Circle(x, y, 3.5,
                     fillColor=fill_col, strokeColor=colors.white,
                     strokeWidth=0.8))

    # ── Etiquetas de los ejes (fuera del radar) ───────────────
    label_offset = 14
    for i, item in enumerate(radar_data):
        a    = angle(i)
        lx   = cx + (R + label_offset) * math.cos(a)
        ly   = cy + (R + label_offset) * math.sin(a)
        sc   = float(item.get("score", 0))
        lbl  = item.get("label", "")

        # Alinear texto según posición
        if   lx > cx + 5:  anchor = "start"
        elif lx < cx - 5:  anchor = "end"
        else:              anchor = "middle"

        d.add(String(lx, ly + 4, lbl,
                     fontName="Helvetica-Bold", fontSize=8,
                     fillColor=C_TEXT, textAnchor=anchor))
        d.add(String(lx, ly - 5, f"{sc:.0f}pts",
                     fontName="Helvetica", fontSize=7,
                     fillColor=_score_color(sc), textAnchor=anchor))

    # ── Leyenda lateral ───────────────────────────────────────
    leg_x = int(W_DRAW * 0.76)
    leg_y = draw_h - 22
    items = [
        (fill_col, "Tu score"),
        (colors.HexColor("#9ca3af"), "Meta (70 pts)"),
    ]
    for j, (col, lbl) in enumerate(items):
        ly = leg_y - j * 18
        d.add(Rect(leg_x, ly - 5, 12, 10,
                   fillColor=col, strokeColor=None, rx=2, ry=2))
        d.add(String(leg_x + 16, ly - 1, lbl,
                     fontName="Helvetica", fontSize=8,
                     fillColor=C_TEXT, textAnchor="start"))

    # Mini tabla de scores
    for j, item in enumerate(radar_data):
        sc     = float(item.get("score", 0))
        sc_col = _score_color(sc)
        ty     = leg_y - 50 - j * 14
        d.add(String(leg_x, ty, f"{item['label'][:13]}:",
                     fontName="Helvetica", fontSize=7.5,
                     fillColor=C_MUTED, textAnchor="start"))
        d.add(String(leg_x + 100, ty, f"{sc:.0f}",
                     fontName="Helvetica-Bold", fontSize=7.5,
                     fillColor=sc_col, textAnchor="end"))

    return d


# ═══════════════════════════════════════════════════════════════
# GRÁFICO 3 — Torta de distribución de gastos
# ═══════════════════════════════════════════════════════════════

def _chart_pie(top_cats: list) -> Drawing:
    """
    Pie chart de top categorías de gasto con leyenda lateral.
    top_cats: list de dicts con 'nombre' y 'monto'
    """
    if not top_cats:
        return Drawing(W_DRAW, 10)

    draw_h   = 210
    pie_size = 140
    pie_x    = 30
    pie_y    = (draw_h - pie_size) // 2
    d        = Drawing(W_DRAW, draw_h)

    chart         = Pie()
    chart.x       = pie_x
    chart.y       = pie_y
    chart.width   = pie_size
    chart.height  = pie_size
    chart.data    = [float(c.get("monto", 0)) for c in top_cats]
    chart.labels  = [""] * len(top_cats)   # etiquetas en leyenda lateral
    chart.slices.strokeWidth = 0.6
    chart.slices.strokeColor = colors.white

    total = sum(chart.data) or 1

    for i in range(len(top_cats)):
        chart.slices[i].fillColor  = PALETTE[i % len(PALETTE)]
        chart.slices[i].labelRadius = 1.15
        chart.slices[i].fontSize   = 0   # sin etiqueta en el slice

    d.add(chart)

    # Leyenda derecha
    leg_x  = pie_x + pie_size + 24
    leg_y0 = draw_h - 20

    for i, cat in enumerate(top_cats):
        ly  = leg_y0 - i * 22
        pct = cat.get("monto", 0) / total * 100

        # Cuadro de color
        d.add(Rect(leg_x, ly - 7, 12, 12,
                   fillColor=PALETTE[i % len(PALETTE)],
                   strokeColor=None, rx=2, ry=2))

        # Nombre
        nombre = str(cat.get("nombre", ""))[:22]
        d.add(String(leg_x + 16, ly - 3, nombre,
                     fontName="Helvetica", fontSize=8,
                     fillColor=C_TEXT, textAnchor="start"))

        # Monto y porcentaje
        d.add(String(leg_x + 16, ly - 12,
                     f"{_fmt_pen(cat.get('monto', 0))}  ({pct:.1f}%)",
                     fontName="Helvetica", fontSize=7.5,
                     fillColor=C_MUTED, textAnchor="start"))

    return d


# ═══════════════════════════════════════════════════════════════
# GRÁFICO 4 — Barras comparativas mes actual vs anterior
# ═══════════════════════════════════════════════════════════════

def _chart_comparativa(act: dict, ant: dict,
                        period: str, prev_period: str) -> Drawing:
    """
    Barras agrupadas verticales comparando:
    Ingresos · Gastos fijos · Gastos variables · Deudas · Ahorros
    entre el mes actual y el mes anterior.
    """
    draw_h = 210
    d      = Drawing(W_DRAW, draw_h)

    categorias  = ["Ingresos", "Gts. Fijos", "Gts. Var.", "Deudas", "Ahorros"]
    keys        = ["ingresos", "gastos_fijos", "gastos_variables", "deudas", "ahorros"]
    data_actual = [float(act.get(k, 0)) for k in keys]
    data_ant    = [float(ant.get(k, 0)) for k in keys]

    # Evitar gráfico vacío
    if max(data_actual + data_ant) == 0:
        d.add(String(W_DRAW // 2, draw_h // 2,
                     "Sin datos del mes anterior",
                     fontName="Helvetica", fontSize=9,
                     fillColor=C_MUTED, textAnchor="middle"))
        return d

    chart = VerticalBarChart()
    chart.x       = 55
    chart.y       = 38
    chart.width   = W_DRAW - 80
    chart.height  = draw_h - 70

    chart.data              = [data_actual, data_ant]
    chart.groupSpacing      = 8
    chart.barSpacing        = 2
    chart.barWidth          = 18

    chart.bars[0].fillColor = C_BRAND
    chart.bars[1].fillColor = C_BRAND2

    chart.categoryAxis.categoryNames = categorias
    chart.categoryAxis.labels.fontName  = "Helvetica"
    chart.categoryAxis.labels.fontSize  = 7.5
    chart.categoryAxis.labels.fillColor = C_TEXT
    chart.categoryAxis.labels.angle     = 0

    chart.valueAxis.labels.fontName   = "Helvetica"
    chart.valueAxis.labels.fontSize   = 7
    chart.valueAxis.labels.fillColor  = C_MUTED
    chart.valueAxis.forceZero         = True
    chart.valueAxis.labelTextFormat   = lambda v: f"S/{v/1000:.0f}k" if v >= 1000 else f"S/{v:.0f}"

    chart.valueAxis.gridStrokeColor   = colors.HexColor("#e5e7eb")
    chart.valueAxis.gridStrokeWidth   = 0.4
    chart.valueAxis.visibleGrid       = True

    d.add(chart)

    # Leyenda
    leg_items = [
        (C_BRAND,  _period_short(period)),
        (C_BRAND2, _period_short(prev_period)),
    ]
    leg_x = chart.x
    for i, (col, lbl) in enumerate(leg_items):
        lx = leg_x + i * 100
        d.add(Rect(lx, 10, 14, 10,
                   fillColor=col, strokeColor=None, rx=2, ry=2))
        d.add(String(lx + 18, 14, lbl,
                     fontName="Helvetica", fontSize=8,
                     fillColor=C_TEXT, textAnchor="start"))

    return d


# ═══════════════════════════════════════════════════════════════
# HEADER / FOOTER DE PÁGINA
# ═══════════════════════════════════════════════════════════════

class _DocWithHeaderFooter(BaseDocTemplate):

    def __init__(self, buf, period_label: str, generated_at: str, **kwargs):
        super().__init__(buf, **kwargs)
        self.period_label = period_label
        self.generated_at = generated_at

        frame = Frame(
            self.leftMargin, self.bottomMargin,
            self.width, self.height, id="main"
        )
        template = PageTemplate(id="main", frames=[frame], onPage=self._draw_page)
        self.addPageTemplates([template])

    def _draw_page(self, canvas, doc):
        canvas.saveState()
        W, H = A4

        # Header oscuro
        canvas.setFillColor(C_HEADER_BG)
        canvas.rect(0, H - 2.4 * cm, W, 2.4 * cm, fill=1, stroke=0)

        canvas.setFillColor(C_BRAND)
        canvas.setFont("Helvetica-Bold", 15)
        canvas.drawString(1.8 * cm, H - 1.3 * cm, "FinanzasVH")

        canvas.setFillColor(colors.HexColor("#c4b5fd"))
        canvas.setFont("Helvetica", 9)
        canvas.drawString(1.8 * cm, H - 1.9 * cm, "Sistema de Gestión Financiera Personal")

        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 11)
        canvas.drawRightString(W - 1.8 * cm, H - 1.35 * cm, self.period_label)

        canvas.setFillColor(colors.HexColor("#9090aa"))
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(W - 1.8 * cm, H - 1.9 * cm, f"Generado: {self.generated_at}")

        # Línea acento
        canvas.setStrokeColor(C_BRAND)
        canvas.setLineWidth(1.5)
        canvas.line(0, H - 2.4 * cm, W, H - 2.4 * cm)

        # Footer
        canvas.setStrokeColor(C_LINE)
        canvas.setLineWidth(0.5)
        canvas.line(1.8 * cm, 1.4 * cm, W - 1.8 * cm, 1.4 * cm)

        canvas.setFillColor(colors.HexColor("#aaaabc"))
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(1.8 * cm, 0.9 * cm,
                          "FinanzasVH  •  Victor Hugo Capillo  •  Uso exclusivo personal")
        canvas.drawRightString(W - 1.8 * cm, 0.9 * cm, f"Página {doc.page}")

        canvas.restoreState()


# ═══════════════════════════════════════════════════════════════
# FUNCIÓN PRINCIPAL
# ═══════════════════════════════════════════════════════════════

def generar_pdf_resumen(period: str, contenido: dict,
                         datos_graficos: dict | None = None) -> bytes:
    """
    Genera el PDF del resumen mensual con 4 gráficos intercalados.

    Args:
        period:         Período 'YYYY-MM'
        contenido:      dict del resumen (estructura de resumen_service / Gemini)
        datos_graficos: dict con datos para los 4 gráficos (calculado en el router)

    Returns:
        bytes del PDF generado
    """
    buf          = io.BytesIO()
    st           = _build_styles()
    period_label = _period_label(period)
    semaforo     = contenido.get("semaforo", "amarillo")
    sem_color    = _sem_color(semaforo)
    sem_labels   = {"verde": "SALUDABLE", "amarillo": "EN OBSERVACION", "rojo": "REQUIERE ACCION"}
    sem_label    = sem_labels.get(semaforo, "EN OBSERVACION")

    try:
        from utils.timezone_utils import now_lima
        generated_at = now_lima().strftime("%d/%m/%Y %H:%M")
    except Exception:
        generated_at = datetime.utcnow().strftime("%d/%m/%Y %H:%M")

    doc = _DocWithHeaderFooter(
        buf,
        period_label = period_label,
        generated_at = generated_at,
        pagesize     = A4,
        leftMargin   = 1.8 * cm,
        rightMargin  = 1.8 * cm,
        topMargin    = 3.2 * cm,
        bottomMargin = 1.8 * cm,
        title        = f"FinanzasVH — Resumen {period_label}",
        author       = "Victor Hugo Capillo",
    )

    story = []
    dg    = datos_graficos or {}   # datos para gráficos (puede ser vacío)

    def sp(h_mm=4):
        story.append(Spacer(1, h_mm * mm))

    def hr(color=C_LINE, thickness=0.5):
        story.append(HRFlowable(width="100%", thickness=thickness,
                                color=color, spaceAfter=3 * mm))

    def section_title(text: str):
        sp(5)
        story.append(Paragraph(text.upper(), st["section"]))
        story.append(HRFlowable(width="100%", thickness=0.4,
                                color=C_LINE, spaceBefore=1 * mm, spaceAfter=3 * mm))

    def note(text: str):
        story.append(Paragraph(text, st["chart_note"]))
        sp(3)

    # ── 1. TAG SEMÁFORO + TÍTULO ──────────────────────────────
    sp(2)

    tag_tbl = Table([[Paragraph(f"● {sem_label}", st["tag"])]], colWidths=[5 * cm])
    tag_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), sem_color),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
    ]))
    story.append(tag_tbl)
    sp(3)

    story.append(Paragraph(f"Resumen Mensual · {period_label}",
                            ParagraphStyle("mt", fontName="Helvetica-Bold",
                                           fontSize=18, textColor=C_TEXT, leading=22)))
    sp(2)

    resumen_ej = contenido.get("resumen_ejecutivo", "")
    if resumen_ej:
        story.append(Paragraph(resumen_ej, st["body"]))

    sp(4)
    hr(C_BRAND, 1)

    # ── 2. KPIs + BARRAS HORIZONTALES ────────────────────────
    section_title("Indicadores Clave")

    tasa  = float(contenido.get("tasa_ahorro_pct", 0) or 0)
    deuda = float(contenido.get("ratio_deuda_ingreso_pct", 0) or 0)
    saldo = float(contenido.get("saldo_neto", 0) or 0)

    c_tasa  = C_GREEN if tasa  >= 20  else (C_YELLOW if tasa  >= 10  else C_RED)
    c_deuda = C_GREEN if deuda <= 20  else (C_YELLOW if deuda <= 30  else C_RED)
    c_saldo = C_GREEN if saldo >= 0   else C_RED

    # Tabla numérica de KPIs
    col_w = (W_DRAW - 4 * mm) / 3

    def kpi_cell(lbl, val, meta, col):
        return [
            Paragraph(lbl, st["kpi_label"]),
            Paragraph(val, ParagraphStyle("kv", fontName="Helvetica-Bold",
                                          fontSize=18, textColor=col,
                                          alignment=TA_CENTER, leading=22)),
            Paragraph(meta, st["kpi_meta"]),
        ]

    kpi_tbl = Table([[
        kpi_cell("TASA DE AHORRO",     _fmt_pct(tasa),  "Meta ≥ 20%",    c_tasa),
        kpi_cell("RATIO DEUDA/INGRESO", _fmt_pct(deuda), "Límite < 30%",  c_deuda),
        kpi_cell("SALDO NETO",          _fmt_pen(saldo), "Positivo = bien", c_saldo),
    ]], colWidths=[col_w, col_w, col_w])
    kpi_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_CARD_BG),
        ("BOX",           (0, 0), (-1, -1), 0.5, C_LINE),
        ("INNERGRID",     (0, 0), (-1, -1), 0.5, C_LINE),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(kpi_tbl)
    sp(4)

    # Gráfico 1: barras horizontales
    kpis_g = dg.get("kpis")
    if kpis_g:
        story.append(_chart_kpi_bars(kpis_g))
        note("Barras de score (0–100). Línea punteada = mínimo saludable (70 pts)")
    sp(2)

    # ── 3. DIAGNÓSTICO + RADAR ────────────────────────────────
    diagnostico = contenido.get("diagnostico", "")
    if diagnostico:
        section_title("Diagnóstico de Salud Financiera")

        diag_tbl = Table([[Paragraph(diagnostico, st["body"])]], colWidths=[W_DRAW])
        diag_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), C_CARD_BG),
            ("BOX",           (0, 0), (-1, -1), 0.5, C_LINE),
            ("TOPPADDING",    (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LEFTPADDING",   (0, 0), (-1, -1), 12),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ]))
        story.append(diag_tbl)
        sp(4)

    # Gráfico 2: radar
    radar_g = dg.get("radar")
    if radar_g:
        story.append(_chart_radar(radar_g, semaforo))
        note("Radar de Salud Financiera (G-08) · 6 dimensiones en escala 0–100")

    # ── 4. RECOMENDACIONES ────────────────────────────────────
    recs = contenido.get("recomendaciones", [])
    if recs:
        section_title("Recomendaciones Priorizadas")

        rec_rows = []
        for i, rec in enumerate(recs, 1):
            rec_rows.append([
                Paragraph(str(i), st["rec_num"]),
                Paragraph(rec, st["rec_text"]),
            ])

        rec_tbl = Table(rec_rows, colWidths=[1 * cm, W_DRAW - 1.2 * cm])
        rec_tbl.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING",   (0, 0), (-1, -1), 4),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
            ("LINEBELOW",     (0, 0), (-1, -2), 0.4, C_LINE),
            ("BACKGROUND",    (0, 0), (0, -1),  colors.HexColor("#f3f0ff")),
        ]))
        story.append(rec_tbl)

    # ── 5. TOP CATEGORÍAS + TORTA ─────────────────────────────
    top_cats = contenido.get("top_categorias_gasto", [])
    if top_cats:
        section_title("Distribución de Gastos por Categoría")

        # Tabla de categorías
        cat_header = [
            Paragraph("CATEGORÍA", st["section"]),
            Paragraph("MONTO",     st["section"]),
            Paragraph("% INGRESO", st["section"]),
        ]
        cat_rows = [cat_header]
        for cat in top_cats:
            cat_rows.append([
                Paragraph(str(cat.get("nombre", "")), st["body"]),
                Paragraph(_fmt_pen(cat.get("monto", 0)),
                          ParagraphStyle("cm", fontName="Helvetica-Bold", fontSize=10,
                                         textColor=C_RED, alignment=TA_RIGHT, leading=13)),
                Paragraph(_fmt_pct(cat.get("porcentaje_ingreso", 0)),
                          ParagraphStyle("cp", fontName="Helvetica", fontSize=9,
                                         textColor=C_MUTED, alignment=TA_CENTER, leading=13)),
            ])

        cat_tbl = Table(cat_rows,
                        colWidths=[W_DRAW * 0.55, W_DRAW * 0.28, W_DRAW * 0.17])
        cat_tbl.setStyle(TableStyle([
            ("BACKGROUND",     (0, 0), (-1, 0), C_CARD_BG),
            ("BOX",            (0, 0), (-1, -1), 0.5, C_LINE),
            ("INNERGRID",      (0, 0), (-1, -1), 0.3, C_LINE),
            ("VALIGN",         (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",     (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING",  (0, 0), (-1, -1), 6),
            ("LEFTPADDING",    (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",   (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, C_CARD_BG]),
        ]))
        story.append(cat_tbl)
        sp(4)

        # Gráfico 3: torta
        story.append(_chart_pie(top_cats))
        note("Distribución porcentual de gastos del período")

    # ── 6. COMPARATIVA + BARRAS ───────────────────────────────
    comparativa = contenido.get("comparativa_mes_anterior")
    act_g       = dg.get("act")
    ant_g       = dg.get("ant")
    prev_period = dg.get("prev_period", "")

    if comparativa or (act_g and ant_g):
        section_title("Comparativa con el Mes Anterior")

        if comparativa:
            story.append(Paragraph(comparativa, st["body"]))
            sp(3)

        # Gráfico 4: barras comparativas
        if act_g and ant_g and prev_period:
            story.append(_chart_comparativa(act_g, ant_g, period, prev_period))
            note(f"Comparativa {_period_short(period)} vs {_period_short(prev_period)} — montos en S/")

    # ── 7. PROYECCIÓN ANUAL ───────────────────────────────────
    proyeccion = contenido.get("proyeccion_anual")
    if proyeccion:
        section_title("Proyección Anual")

        proy_tbl = Table([[Paragraph(proyeccion, st["body"])]], colWidths=[W_DRAW])
        proy_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), colors.HexColor("#f0f9ff")),
            ("BOX",           (0, 0), (-1, -1), 0.5, colors.HexColor("#bae6fd")),
            ("TOPPADDING",    (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LEFTPADDING",   (0, 0), (-1, -1), 12),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ]))
        story.append(proy_tbl)

    # ── 8. FRASE MOTIVADORA ───────────────────────────────────
    frase = contenido.get("frase_motivadora")
    if frase:
        sp(6)
        hr(C_LINE, 0.5)
        sp(2)
        story.append(Paragraph(f'"{frase}"', st["quote"]))
        sp(2)
        story.append(Paragraph("— FinanzasVH · Victor Hugo · 2026",
                                ParagraphStyle("attr", fontName="Helvetica", fontSize=8,
                                               textColor=colors.HexColor("#ccccdd"),
                                               alignment=TA_CENTER, leading=11)))

    # ── METADATA FINAL ────────────────────────────────────────
    meta   = contenido.get("_meta", {})
    fuente = meta.get("fuente", "")
    fuente_map = {"LOCAL_FALLBACK": "Generado localmente"}
    fuente_label = fuente_map.get(fuente, f"Generado con {fuente}" if fuente else "")

    sp(8)
    hr(C_LINE, 0.3)
    story.append(Paragraph(
        f"Período: {period_label}  •  {fuente_label}  •  finanzas.alias.nom.pe",
        st["footer"]
    ))

    # ── BUILD ─────────────────────────────────────────────────
    try:
        doc.build(story)
        return buf.getvalue()
    except Exception as e:
        logger.error(f"[PDF] Error generando PDF: {e}", exc_info=True)
        raise
