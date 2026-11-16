#!/usr/bin/env python3
"""PDF render of the pitch deck on macOS without LibreOffice.

Splits the pptx into one-slide decks (Quick Look paints stray shapes across slides otherwise),
renders each with macOS Quick Look to HTML, prints it with headless Chrome, and merges the pages.
Needs: qlmanage (macOS), Google Chrome, pdftocairo (poppler), python-pptx, pypdf.

Usage: python3 tools/deck_pdf.py [in.pptx] [out.pdf] [png_dir]
Defaults: docs/deck/palm-whorl-cities-pitch.pptx -> .pdf next to it; PNGs only if png_dir is given.
If LibreOffice is installed, `soffice --headless --convert-to pdf` works as well.
"""
import os, re, sys, glob, shutil, subprocess, tempfile
from pptx import Presentation
from pypdf import PdfWriter, PdfReader

CH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = sys.argv[1:]
src = args[0] if len(args) > 0 else os.path.join(ROOT, "docs", "deck", "palm-whorl-cities-pitch.pptx")
out_pdf = args[1] if len(args) > 1 else os.path.splitext(src)[0] + ".pdf"
png_dir = args[2] if len(args) > 2 else None
if png_dir:
    os.makedirs(png_dir, exist_ok=True)
work = tempfile.mkdtemp(prefix="deckrender-")
n = len(Presentation(src).slides)
CSS = ('<style>@page{size:959px 540px;margin:0}html,body{margin:0;padding:0;background:#14052b}'
       'div.slide{margin:0!important;-webkit-box-shadow:none!important}div.loading-slide{display:none}</style>')
pdfs = []
for i in range(n):
    prs = Presentation(src)
    lst = prs.slides._sldIdLst
    for j, sid in reversed(list(enumerate(list(lst)))):
        if j != i:
            prs.part.drop_rel(sid.rId)
            lst.remove(sid)
    one = os.path.join(work, f"s{i+1:02d}.pptx")
    prs.save(one)
    qd = os.path.join(work, f"ql{i+1:02d}")
    os.makedirs(qd)
    subprocess.run(["qlmanage", "-p", "-o", qd, one], capture_output=True, timeout=120)
    d = glob.glob(qd + "/*.qlpreview")[0]
    for f in glob.glob(d + "/Attachment*.pdf"):
        subprocess.run(["pdftocairo", "-png", "-transp", "-r", "200", "-singlefile", f, f[:-4]], check=True)
    h = open(d + "/Preview.html", encoding="utf-8").read()
    h = re.sub(r"(Attachment\d+)\.pdf", r"\1.png", h).replace("</head>", CSS + "</head>", 1)
    page = d + "/print.html"
    open(page, "w", encoding="utf-8").write(h)
    pdf = os.path.join(work, f"s{i+1:02d}.pdf")
    common = [CH, "--headless=new", "--disable-gpu", "--hide-scrollbars"]
    if png_dir:
        png = os.path.join(png_dir, f"s{i+1:02d}.png")
        subprocess.run(common + ["--force-device-scale-factor=2", "--window-size=959,540",
                                 f"--screenshot={png}", "file://" + page], capture_output=True, timeout=120)
    subprocess.run(common + ["--no-pdf-header-footer", f"--print-to-pdf={pdf}", "file://" + page],
                   capture_output=True, timeout=120)
    pdfs.append(pdf)
w = PdfWriter()
for p in pdfs:
    r = PdfReader(p)
    w.add_page(r.pages[0])
    if len(r.pages) > 1:
        print("warning: slide overflowed to", len(r.pages), "pages:", p)
with open(out_pdf, "wb") as f:
    w.write(f)
shutil.rmtree(work)
print("rendered", n, "slides ->", out_pdf)
