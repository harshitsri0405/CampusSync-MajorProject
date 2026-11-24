"""PDF files made with ReportLab: the syllabus download and the sample e-books / documents of the demo data."""
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

INK = colors.HexColor("#0F172A")
MUTED = colors.HexColor("#64748B")
LINE = colors.HexColor("#CBD5E1")
HEAD_BG = colors.HexColor("#F1F5F9")

_base = getSampleStyleSheet()
S = {
    "brand": ParagraphStyle("brand", parent=_base["Title"], fontName="Helvetica-Bold", fontSize=22,
                            textColor=INK, alignment=1, spaceAfter=2),
    "caption": ParagraphStyle("caption", parent=_base["Normal"], fontSize=10, textColor=MUTED,
                              alignment=1, spaceAfter=14),
    "h1": ParagraphStyle("h1", parent=_base["Heading1"], fontName="Helvetica-Bold", fontSize=16,
                         textColor=INK, spaceBefore=6, spaceAfter=6),
    "h2": ParagraphStyle("h2", parent=_base["Heading2"], fontName="Helvetica-Bold", fontSize=12,
                         textColor=INK, spaceBefore=10, spaceAfter=4),
    "body": ParagraphStyle("body", parent=_base["Normal"], fontSize=10, leading=14, textColor=INK, spaceAfter=6),
    "bullet": ParagraphStyle("bullet", parent=_base["Normal"], fontSize=10, leading=14, leftIndent=14,
                             bulletIndent=4, textColor=INK),
    "small": ParagraphStyle("small", parent=_base["Normal"], fontSize=8, leading=10, textColor=MUTED),
    "cell": ParagraphStyle("cell", parent=_base["Normal"], fontSize=9, leading=12, textColor=INK),
    "cellh": ParagraphStyle("cellh", parent=_base["Normal"], fontName="Helvetica-Bold", fontSize=9,
                            leading=12, textColor=INK),
}


def _t(text) -> str:
    """Text that is safe inside a ReportLab Paragraph (it reads a small HTML-like markup)."""
    return escape(str(text or "")).replace("\n", "<br/>")


def _build(story, title: str, footer: str) -> bytes:
    buf = BytesIO()

    def draw_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(20 * mm, 10 * mm, footer)
        canvas.drawRightString(A4[0] - 20 * mm, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()

    SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
        title=title, author="CampusSync",
    ).build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    return buf.getvalue()


def text_pdf(title: str, paragraphs: list[str], subtitle: str | None = None) -> bytes:
    """A simple document: a title and paragraphs. A paragraph that starts with '# ' becomes a heading."""
    story = [Paragraph("CampusSync", S["brand"])]
    if subtitle:
        story.append(Paragraph(_t(subtitle), S["caption"]))
    story.append(Paragraph(_t(title), S["h1"]))
    for p in paragraphs:
        if p.startswith("# "):
            story.append(Paragraph(_t(p[2:]), S["h2"]))
        else:
            story.append(Paragraph(_t(p), S["body"]))
    return _build(story, title, "CampusSync")


def _total(subject: dict):
    if subject.get("internal") is None and subject.get("external") is None:
        return None
    return (subject.get("internal") or 0) + (subject.get("external") or 0)


def _subject_story(s: dict) -> list:
    kind = "Practical" if s.get("type") == "practical" else "Theory"
    total = _total(s)
    line = f"{kind}  |  {s['credits']} credits"
    if total is not None:
        line += f"  |  Internal {s.get('internal') or 0}  |  External {s.get('external') or 0}  |  Total {total}"
    story = [
        Paragraph(_t(s["code"]), S["small"]),
        Paragraph(_t(s["name"]), S["h1"]),
        Paragraph(_t(line), S["body"]),
    ]
    if s.get("overview"):
        story += [Paragraph("About this subject", S["h2"]), Paragraph(_t(s["overview"]), S["body"])]

    story.append(Paragraph("Practical work" if kind == "Practical" else "Syllabus", S["h2"]))
    for n, u in enumerate(s.get("units", []), start=1):
        head = u["title"] if kind == "Practical" else f"Unit {n}: {u['title']}"
        if u.get("hours"):
            head += f"  ({u['hours']} hours)"
        story.append(Paragraph(f"<b>{_t(head)}</b>", S["body"]))
        for topic in u.get("topics", []):
            story.append(Paragraph(_t(topic), S["bullet"], bulletText="\u2022"))
        story.append(Spacer(1, 4))

    if s.get("books"):
        story.append(Paragraph("Reference books", S["h2"]))
        for i, book in enumerate(s["books"], start=1):
            story.append(Paragraph(_t(book), S["bullet"], bulletText=f"{i}."))
    return story


def syllabus_pdf(course: str, heading: str, subjects: list[dict], with_scheme: bool) -> bytes:
    """subjects: dicts with code, name, type, credits, internal, external, overview, books, units.
    with_scheme adds the table of all subjects on the first page (used for a whole semester)."""
    story = [Paragraph("CampusSync", S["brand"]), Paragraph(_t(f"Syllabus  |  {course}  |  {heading}"), S["caption"])]

    if with_scheme:
        header = [Paragraph(h, S["cellh"]) for h in ("Code", "Subject", "Type", "Credits", "Internal", "External", "Total")]
        rows = [header]
        for s in subjects:
            total = _total(s)
            rows.append([
                Paragraph(_t(s["code"]), S["cell"]),
                Paragraph(_t(s["name"]), S["cell"]),
                Paragraph("Practical" if s.get("type") == "practical" else "Theory", S["cell"]),
                Paragraph(str(s["credits"]), S["cell"]),
                Paragraph("-" if s.get("internal") is None else str(s["internal"]), S["cell"]),
                Paragraph("-" if s.get("external") is None else str(s["external"]), S["cell"]),
                Paragraph("-" if total is None else str(total), S["cell"]),
            ])
        table = Table(rows, colWidths=[18 * mm, 54 * mm, 22 * mm, 16 * mm, 20 * mm, 20 * mm, 20 * mm], repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), HEAD_BG),
            ("GRID", (0, 0), (-1, -1), 0.5, LINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story += [
            Paragraph("Scheme of the semester", S["h1"]),
            table,
            Spacer(1, 8),
            Paragraph(f"<b>Total credits: {sum(s['credits'] for s in subjects)}</b>", S["body"]),
            Paragraph("The complete syllabus of every subject follows, one subject on each page.", S["small"]),
        ]
        for s in subjects:
            story.append(PageBreak())
            story += _subject_story(s)
    else:
        for i, s in enumerate(subjects):
            if i:
                story.append(PageBreak())
            story += _subject_story(s)

    return _build(story, f"Syllabus - {course} - {heading}", f"CampusSync  |  {course}  |  {heading}")