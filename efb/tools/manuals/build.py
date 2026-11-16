"""Builds the NAVDECK simulator QRH and FCOM PDFs for every aircraft variant.

    python3 efb/tools/manuals/build.py [output folder] [--only KEY ...]

Writes <output>/<Family folder>/<Variant> QRH.pdf and <Variant> FCOM.pdf.
Needs Python 3 and Playwright with Chromium.
"""
import html
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fcom  # noqa: E402
import qrh  # noqa: E402
from fleet import VARIANTS  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = open(os.path.join(HERE, "..", "..", "web", "img", "logo.svg"), encoding="utf-8").read()
EDITION = "Edition 1, " + date.today().strftime("%B %Y")
SIM_ONLY = "For flight simulation only. Not for real-world flight operations."

FOLDERS = {"A220": "Airbus A220", "A320": "Airbus A320 family", "A330": "Airbus A330", "A340": "Airbus A340",
           "A350": "Airbus A350", "737": "Boeing 737", "757": "Boeing 757", "767": "Boeing 767", "777": "Boeing 777",
           "787": "Boeing 787"}

CSS = """
@page { size: A5; margin: 13mm 11mm 15mm 11mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: 'DejaVu Sans', 'Segoe UI', Arial, sans-serif; font-size: 8.4pt; line-height: 1.38; color: #1d1d24; margin: 0; }
h1, h2, h3 { margin: 0; }
.cover { height: 180mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always;
  background: linear-gradient(160deg, #26262e, #15151a); color: #fff; margin: -13mm -11mm 0; padding: 16mm 13mm 14mm; }
.cover .brand { display: flex; align-items: center; gap: 4mm; font-size: 10pt; letter-spacing: .18em; color: #c4b5fd; font-weight: 700; }
.cover .brand svg { width: 15mm; height: 15mm; }
.cover .kind { font-size: 9pt; letter-spacing: .25em; color: #a78bfa; font-weight: 700; margin-bottom: 3mm; }
.cover h1 { font-size: 25pt; line-height: 1.1; }
.cover .full { font-size: 11pt; color: #d6d3e0; margin-top: 2mm; }
.cover .bar { height: 1.4mm; width: 34mm; background: linear-gradient(90deg, #7c3aed, #c4b5fd); border-radius: 1mm; margin: 6mm 0; }
.cover .meta { font-size: 8pt; color: #b4b2c0; line-height: 1.6; }
.cover .warn { border: 0.3mm solid #a78bfa; border-radius: 2mm; padding: 3mm 4mm; font-size: 8pt; color: #ece9f7; }
.chap { page-break-before: always; }
.chap > h2 { font-size: 13pt; color: #fff; background: #2b2b33; border-left: 2.2mm solid #7c3aed; padding: 2.4mm 3.5mm; margin-bottom: 3.5mm; border-radius: 1mm; }
.chap > h2 .n { color: #c4b5fd; margin-right: 2.5mm; }
h3 { font-size: 9.6pt; color: #5b21b6; margin: 3.6mm 0 1.4mm; border-bottom: 0.25mm solid #ddd6fe; padding-bottom: 0.8mm; }
p { margin: 0 0 2mm; }
ul { margin: 0 0 2.4mm; padding-left: 4.5mm; } li { margin-bottom: 0.8mm; }
table { width: 100%; border-collapse: collapse; margin: 1mm 0 3mm; page-break-inside: avoid; }
th { background: #ede9fe; color: #3b2a6e; text-align: left; font-size: 7.6pt; padding: 1.2mm 1.8mm; }
td { border-bottom: 0.2mm solid #e4e4ea; padding: 1.1mm 1.8mm; vertical-align: top; }
tr:nth-child(even) td { background: #fafafc; }
.note { background: #f4f3f7; border-left: 1.2mm solid #8b8b99; padding: 2mm 3mm; margin: 1mm 0 3mm; font-size: 7.9pt; border-radius: 0.8mm; }
.note b { color: #4b4b57; }
.cl { border: 0.3mm solid #d4d4dc; border-radius: 1.6mm; margin: 0 0 3.5mm; page-break-inside: avoid; overflow: hidden; }
.cl .t { background: #2b2b33; color: #fff; padding: 1.8mm 3mm; font-weight: 700; font-size: 9.2pt; display: flex; justify-content: space-between; gap: 2mm; }
.cl .t .num { color: #c4b5fd; margin-right: 2mm; }
.cl.mem { border: 0.6mm solid #7c3aed; }
.cl.mem .t { background: #4c1d95; }
.cl .tag { font-size: 6.6pt; letter-spacing: .12em; background: #c4b5fd; color: #2e1065; border-radius: 0.8mm; padding: 0.4mm 1.5mm; align-self: center; white-space: nowrap; }
.cl .c { font-style: italic; color: #55555f; padding: 1.6mm 3mm 0.6mm; font-size: 7.8pt; }
.cl .s { padding: 0.6mm 3mm 2mm; }
.row { display: flex; align-items: baseline; gap: 1.2mm; padding: 0.55mm 0; }
.row .i { flex: 0 1 auto; }
.row .d { flex: 1 1 auto; border-bottom: 0.3mm dotted #9a9aa6; min-width: 4mm; transform: translateY(-0.7mm); }
.row .a { flex: 0 1 auto; font-weight: 700; text-align: right; max-width: 55%; }
.cl.mem .row .i, .cl.mem .row .a { font-weight: 700; }
.cl.mem .row .a { color: #4c1d95; }
.if { color: #5b21b6; font-weight: 700; margin-top: 1mm; padding: 0.4mm 0; }
.go { color: #3f3f4a; font-style: italic; padding: 0.4mm 0; }
.go:before { content: '\\25B8  '; color: #7c3aed; font-style: normal; }
.plain { padding: 0.4mm 0; }
.caut { background: #fff7e6; border-left: 1mm solid #d97706; padding: 1mm 2mm; margin: 1mm 0; font-size: 7.7pt; }
.end { text-align: center; color: #8b8b99; font-size: 6.8pt; letter-spacing: .3em; padding-top: 1.2mm; }
.toc { columns: 2; column-gap: 6mm; font-size: 7.8pt; }
.toc .ch { font-weight: 700; color: #5b21b6; margin-top: 2mm; break-after: avoid; }
.toc .it { display: flex; gap: 1.5mm; break-inside: avoid; }
.toc .it .n { color: #7c3aed; min-width: 7mm; }
.flow .row .a { color: #2e1065; }
"""


def e(s):
    return html.escape(str(s))


def cover(kind, v):
    f = v["f"]
    return f"""<section class="cover">
<div class="brand">{LOGO}<span>NAVDECK</span></div>
<div>
  <div class="kind">{e(kind)}</div>
  <h1>{e(v['title'])}</h1>
  <div class="full">{e('Quick Reference Handbook' if kind == 'QRH' else 'Flight Crew Operating Manual')} &middot; {e(v['engine'])}</div>
  <div class="bar"></div>
  <div class="meta">{e(f['name'])} &middot; {e(EDITION)}<br>Written by NAVDECK for the NAVDECK EFB virtual airline community.</div>
</div>
<div class="warn"><b>{e(SIM_ONLY)}</b><br>Original NAVDECK material written for desktop flight simulation. It is not a {e(f['maker'])} publication
and does not replace your simulator add-on's own documentation. Figures are typical values; check your aircraft.</div>
</section>"""


def row(i, a):
    return f'<div class="row"><span class="i">{e(i)}</span><span class="d"></span><span class="a">{e(a)}</span></div>'


def step_html(s):
    if isinstance(s, tuple):
        return row(*s)
    if s.startswith("!"):
        return f'<div class="caut">{e(s[1:])}</div>'
    if s.startswith("?"):
        return f'<div class="if">{e(s[1:])}</div>'
    if s.startswith(">"):
        return f'<div class="go">{e(s[1:])}</div>'
    return f'<div class="plain">{e(s.lstrip("-"))}</div>'


def checklist_html(num, c):
    tag = '<span class="tag">MEMORY ITEMS</span>' if c["memory"] else ""
    steps = "".join(step_html(s) for s in c["steps"])
    return (f'<div class="cl{" mem" if c["memory"] else ""}"><div class="t"><span><span class="num">{num}</span>{e(c["title"])}</span>{tag}</div>'
            f'<div class="c">Condition: {e(c["cond"])}</div><div class="s">{steps}<div class="end">&#9632; END &#9632;</div></div></div>')


def table_html(head, rows):
    h = "".join(f"<th>{e(x)}</th>" for x in head)
    b = "".join("<tr>" + "".join(f"<td>{e(x)}</td>" for x in r) + "</tr>" for r in rows)
    return f"<table><thead><tr>{h}</tr></thead><tbody>{b}</tbody></table>"


def build_qrh(v):
    f = v["f"]
    w = qrh.vocab(f, v)
    chapters = [(title, fn(f, v, w)) for title, fn in qrh.CHAPTERS]
    toc = []
    body = []
    for ci, (title, cls) in enumerate(chapters, 1):
        toc.append(f'<div class="ch">{ci}. {e(title)}</div>' + "".join(
            f'<div class="it"><span class="n">{ci}.{k}</span><span>{e(c["title"])}</span></div>' for k, c in enumerate(cls, 1)))
        body.append(f'<section class="chap"><h2><span class="n">{ci}</span>{e(title)}</h2>' +
                    "".join(checklist_html(f"{ci}.{k}", c) for k, c in enumerate(cls, 1)) + "</section>")
    qd = qrh.quick_data(f, v, w)
    n = len(chapters) + 1
    toc.append(f'<div class="ch">{n}. Quick data</div><div class="it"><span class="n">{n}.1</span><span>Limits, weights, flap speeds, pitch and thrust, landing factors</span></div>')
    body.append(f'<section class="chap"><h2><span class="n">{n}</span>Quick data</h2>'
                f'<div class="note"><b>Typical values.</b> Rounded figures for the {e(v["title"])}. Check your simulator add-on.</div>'
                '<h3>Weights</h3>' + table_html(["Item", "Value"], qd["weights"]) +
                '<h3>Speeds and limits</h3>' + table_html(["Item", "Value"], qd["speeds"]) +
                '<h3>Flap / slat limit speeds</h3>' + table_html(["Setting", "Max speed (kt)"], [(a, str(s)) for a, s in qd["flaps"]]) +
                '<h3>Pitch and thrust (unreliable airspeed)</h3>' + table_html(["Phase", "Pitch", "Thrust"], qd["pitch"]) +
                '<h3>Landing distance factors</h3>' + table_html(["Condition", "Factor x normal distance"], qd["landing"]) +
                '<h3>Approach speed additives</h3>' + table_html(["Failure", "Add to VREF"], qd["flap_add"]) + "</section>")
    how = f"""<section class="chap"><h2><span class="n">0</span>How to use this QRH</h2>
<p>This handbook holds the non-normal and emergency checklists for the {e(v['title'])} in your simulator.
{('On Airbus types the ECAM shows most failure procedures on screen. Use this book for the items ECAM does not show, and as a quick reference to understand the ECAM actions.' if w['airbus'] else
  f'Use the {e(f["alert"])} message to find the matching checklist.')}</p>
<ul><li><b>Memory items</b> (purple border) are done from memory, at once, then checked with the book when time allows.</li>
<li>Each checklist starts with its <b>condition</b>: what you see that tells you to use it.</li>
<li>Read the item on the left and do the action on the right. <span style="color:#5b21b6;font-weight:700">Purple lines</span> are decisions: follow the branch that applies.</li>
<li>Amber boxes are cautions. A line with &#9656; sends you to another checklist.</li>
<li>Fly the aircraft first. One pilot flies, the other reads and acts. Confirm critical switches (engine master or fuel control, fire switches, IDG disconnect) with both pilots before moving them.</li>
<li>Land at the nearest suitable airport after any fire, smoke that will not clear, engine shutdown or a failure that leaves only one system.</li></ul>
<div class="note"><b>{e(SIM_ONLY)}</b> NAVDECK's own wording, based on general airline practice.</div>
<h3>Contents</h3><div class="toc">{''.join(toc)}</div></section>"""
    return cover("QRH", v) + how + "".join(body)


def block_html(b):
    k = b[0]
    if k == "h":
        return f"<h3>{e(b[1])}</h3>"
    if k == "p":
        return f"<p>{e(b[1])}</p>"
    if k == "ul":
        return "<ul>" + "".join(f"<li>{e(x)}</li>" for x in b[1]) + "</ul>"
    if k == "t":
        return table_html(b[1], b[2])
    if k == "flow":
        return '<div class="flow" style="margin:0 0 3mm">' + "".join(row(i, a) for i, a in b[1]) + "</div>"
    if k == "note":
        return f'<div class="note"><b>Note.</b> {e(b[1])}</div>'
    raise ValueError(k)


def build_fcom(v):
    chapters = [(title, fn(v)) for title, fn in fcom.CHAPTERS]
    toc = "".join(f'<div class="it"><span class="n">{i}</span><span>{e(t)}</span></div>' for i, (t, _) in enumerate(chapters, 1))
    intro = f"""<section class="chap"><h2><span class="n">0</span>About this manual</h2>
<p>This is the NAVDECK simulator operating manual for the {e(v['title'])}. It gives the limits, the systems, and the normal
procedures in plain language so you can fly the aircraft the way airline crews do. Emergency and non-normal checklists are in the
separate {e(v['title'])} QRH.</p>
<div class="note"><b>{e(SIM_ONLY)}</b> Original NAVDECK material with typical published figures. It is not a manufacturer's FCOM.</div>
<h3>Contents</h3><div class="toc" style="columns:1">{toc}</div></section>"""
    body = "".join(f'<section class="chap"><h2><span class="n">{i}</span>{e(t)}</h2>' + "".join(block_html(b) for b in blocks) + "</section>"
                   for i, (t, blocks) in enumerate(chapters, 1))
    return cover("FCOM", v) + intro + body


def page(title, content):
    return f'<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>{e(title)}</title><style>{CSS}</style></head><body>{content}</body></html>'


FOOTER = ('<div style="width:100%;font-size:6.5pt;color:#8b8b99;padding:0 11mm;display:flex;justify-content:space-between;font-family:DejaVu Sans,Arial">'
          '<span>NAVDECK {doc} &middot; {title} &middot; Simulation only</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>')


def main():
    args = sys.argv[1:]
    only = None
    if "--only" in args:
        i = args.index("--only")
        only, args = set(args[i + 1:]), args[:i]
    out = args[0] if args else os.path.join(HERE, "out")
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page()
        for v in VARIANTS:
            if only and v["key"] not in only:
                continue
            folder = os.path.join(out, FOLDERS[v["family"]])
            os.makedirs(folder, exist_ok=True)
            for doc, builder in (("QRH", build_qrh), ("FCOM", build_fcom)):
                title = f"{v['title']} {doc}"
                pg.set_content(page(title, builder(v)), wait_until="load")
                path = os.path.join(folder, f"{v['key']} {doc}.pdf")
                pg.pdf(path=path, format="A5", print_background=True, display_header_footer=True,
                       header_template="<span></span>", footer_template=FOOTER.format(doc=doc, title=e(v["title"])),
                       margin=dict(top="13mm", bottom="15mm", left="11mm", right="11mm"), outline=True, tagged=True)
                print(path)
        browser.close()


if __name__ == "__main__":
    main()
