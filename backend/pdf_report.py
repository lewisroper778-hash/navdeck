import base64
import io
import os

import requests
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

APP_NAME = "navdeck"


def build_report_pdf(f: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm, topMargin=10 * mm, bottomMargin=10 * mm)
    ss = getSampleStyleSheet()
    t, fuel, w, s = f.get("times") or {}, f.get("fuel") or {}, f.get("weights") or {}, f.get("signoff") or {}
    notes = f.get("arrival_notes") or {}
    unit = w.get("ofp_units", "KG")
    title = Paragraph(f"<b>NAVDECK · End-of-Flight Report</b><br/>{f.get('callsign') or ''} · {f.get('origin')} → {f.get('destination')} · ALTN {f.get('alternate') or '—'} · {f.get('aircraft') or ''}", ss["Title"])
    logo = _logo((f.get("airline_icao") or "").upper())
    story = [Table([[title, logo or ""]], colWidths=[200 * mm, 60 * mm]), Spacer(1, 4 * mm)]

    v = lambda x: x if x not in (None, "") else "—"  # noqa: E731
    summary = [
        ["Gate out", "Takeoff", "Landing", "Gate in", "TSAT", "CTOT", "Landing rate", "Status"],
        [v(t.get("off")), v(t.get("takeoff")), v(t.get("landing")), v(t.get("on")), v(t.get("tsat")), v(t.get("ctot")),
         f"-{abs(float(f['landing_rate'])):.0f} fpm" if f.get("landing_rate") else "—", (f.get("status") or "").upper()],
        [f"Block fuel ({unit})", "Trip", "Min T/O fuel", "Final reserve", "Fuel at gate", "ZFW", "TOW", "LAW"],
        [v(fuel.get("block")), v(fuel.get("trip")), v(fuel.get("min_takeoff")), v(fuel.get("reserve")), v(f.get("arrival_fob")), v(w.get("zfw")), v(w.get("tow")), v(w.get("law"))],
    ]
    st = TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.grey), ("FONTSIZE", (0, 0), (-1, -1), 8),
                     ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e0e7ff")), ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#e0e7ff"))])
    story += [Table(summary, style=st), Spacer(1, 3 * mm), Paragraph(f"<b>Route</b> {f.get('route') or '—'}", ss["BodyText"])]

    rows, skipped_rows = [["Fix", "Awy", "FL", "Plan FOB", "ATA", "Act FOB", "Act ALT"]], []
    for wp in f.get("waypoints") or []:
        if wp.get("skipped"):
            skipped_rows.append(len(rows))
            rows.append([wp.get("ident"), "DCT (skipped)", "", "", "", "", ""])
            continue
        rows.append([wp.get("ident"), wp.get("airway") or "DCT", str(int(float(wp["altitude"]) / 100)) if wp.get("altitude") else "",
                     v(wp.get("fob")), wp.get("ata") or "", wp.get("actual_fob") or "", wp.get("actual_alt") or ""])
    grey = [("TEXTCOLOR", (0, r), (-1, r), colors.grey) for r in skipped_rows]
    story += [Spacer(1, 3 * mm), Table(rows, repeatRows=1, style=TableStyle([("GRID", (0, 0), (-1, -1), 0.3, colors.lightgrey), ("FONTSIZE", (0, 0), (-1, -1), 7), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ede9fe"))] + grey))]

    story += [Spacer(1, 4 * mm), Paragraph(f"<b>Arrival weather</b> {notes.get('metar') or '—'}<br/><b>Runway</b> {notes.get('runway') or '—'}<br/><b>Arrival notes</b> {notes.get('notes') or '—'}<br/><b>Remarks</b> {s.get('remarks') or 'Nil'}", ss["BodyText"])]
    sig = s.get("signature") or ""
    if sig.startswith("data:image"):
        img = ImageReader(io.BytesIO(base64.b64decode(sig.split(",", 1)[1])))
        iw, ih = img.getSize()
        story += [Spacer(1, 3 * mm), Image(io.BytesIO(base64.b64decode(sig.split(",", 1)[1])), width=60 * mm, height=60 * mm * ih / max(iw, 1))]
    story.append(Paragraph(f"Commander: <b>{s.get('signed_by') or '—'}</b> · signed {(s.get('signed_at') or '')[:16].replace('T', ' ')}z", ss["BodyText"]))
    doc.build(story)
    return buf.getvalue()
