#!/usr/bin/env python3
"""Pitch deck for Palm Whorl Cities (Meta VR Start Developer Competition 2026).

Build:   python3 tools/deck.py
Render:  python3 tools/deck_pdf.py   (macOS Quick Look + Chrome, writes docs/deck/palm-whorl-cities-pitch.pdf)
         or, with LibreOffice installed: soffice --headless --convert-to pdf --outdir docs/deck <pptx>

Artwork: drop the Veo key art at the paths in ARTWORK below. If a file exists it is
placed (cover-cropped to the slot); if not, a dark "ARTWORK (Veo)" placeholder is drawn.
"""
import os
import tempfile
from PIL import Image, ImageDraw
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.oxml.ns import qn

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "docs", "screenshots")
OUT = os.path.join(ROOT, "docs", "deck", "palm-whorl-cities-pitch.pptx")

# Veo key art. Placed if the file exists, otherwise a placeholder panel.
ARTWORK = {
    "cover": os.path.join(ROOT, "docs", "deck", "art", "cover.png"),
    "closing": os.path.join(ROOT, "docs", "deck", "art", "closing.png"),
}

PLAY_URL = "hey-look-its-tim-dries.github.io/td-devpost-hackathon-meta"
CODE_URL = "github.com/hey-look-its-tim-dries/td-devpost-hackathon-meta"
VIDEO_URL = "VIDEO LINK"

# Palette
BG = RGBColor(0x14, 0x05, 0x2B)
BG2 = RGBColor(0x26, 0x0B, 0x4A)
PANEL = RGBColor(0x1F, 0x0A, 0x3D)
PANEL_DARK = RGBColor(0x0B, 0x02, 0x1A)
CYAN = RGBColor(0x3F, 0xF3, 0xFF)
MAGENTA = RGBColor(0xFF, 0x4F, 0xE0)
PEACH = RGBColor(0xFF, 0xCF, 0xA8)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
SOFT = RGBColor(0xD9, 0xD0, 0xEE)  # body text, slightly off white
MUTED = RGBColor(0x9C, 0x8F, 0xBD)

SERIF = "Georgia"
SANS = "Helvetica"

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
SW, SH = 13.333, 7.5
BLANK = prs.slide_layouts[6]
TOTAL = 12


# ---------- helpers ----------

def shot(name):
    return os.path.join(SHOTS, name)


def rect(slide, x, y, w, h, fill=PANEL, line=None, shape=MSO_SHAPE.RECTANGLE, lw=1.0):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill is None:
        s.fill.background()
    else:
        s.fill.solid()
        s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(lw)
    s.shadow.inherit = False
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = 0.06
    return s


def text(slide, x, y, w, h, paras, size=18, font=SANS, color=SOFT, bold=False,
         align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=1.12, after=6, italic=False):
    """paras: str, or list of str / list of runs [(text, {overrides})]."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    tf.vertical_anchor = anchor
    for m in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, m, 0)
    if isinstance(paras, str):
        paras = [paras]
    for i, p in enumerate(paras):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = align
        para.line_spacing = spacing
        para.space_after = Pt(after)
        runs = p if isinstance(p, list) else [(p, {})]
        for t, o in runs:
            r = para.add_run()
            r.text = t
            f = r.font
            f.name = o.get("font", font)
            f.size = Pt(o.get("size", size))
            f.bold = o.get("bold", bold)
            f.italic = o.get("italic", italic)
            f.color.rgb = o.get("color", color)
    return tb


def background(slide):
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    bg.line.fill.background()
    bg.shadow.inherit = False
    bg.fill.gradient()
    bg.fill.gradient_angle = 120
    stops = bg.fill.gradient_stops
    stops[0].color.rgb = BG
    stops[0].position = 0.0
    stops[1].color.rgb = BG2
    stops[1].position = 1.0


def accent_rule(slide, x, y, w=1.6):
    rect(slide, x, y, w * 0.62, 0.05, fill=CYAN)
    rect(slide, x + w * 0.62, y, w * 0.38, 0.05, fill=MAGENTA)


def header(slide, kicker, title, x=0.7, y=0.55, w=12.0, size=36):
    text(slide, x, y, w, 0.3, kicker.upper(), size=12, color=PEACH, bold=True, font=SANS)
    text(slide, x, y + 0.32, w, 0.8, title, size=size, font=SERIF, color=WHITE)
    accent_rule(slide, x, y + 1.18)


def footer(slide, n):
    text(slide, 0.7, SH - 0.42, 6, 0.25, "PALM WHORL CITIES", size=9, color=MUTED, bold=True)
    text(slide, SW - 1.7, SH - 0.42, 1.0, 0.25, f"{n} / {TOTAL}", size=9, color=MUTED,
         align=PP_ALIGN.RIGHT)


def picture(slide, path, x, y, w, h, frame=True, focus=(0.5, 0.5)):
    """Place an image cover-cropped into the box. focus = (fx, fy) centre of the crop."""
    iw, ih = Image.open(path).size
    box = w / h
    img = iw / ih
    pic = slide.shapes.add_picture(path, Inches(x), Inches(y), Inches(w), Inches(h))
    if img > box:  # too wide: crop sides
        keep = box / img
        left = max(0.0, min(1.0 - keep, focus[0] - keep / 2))
        pic.crop_left, pic.crop_right = left, 1.0 - keep - left
    elif img < box:  # too tall: crop top/bottom
        keep = img / box
        top = max(0.0, min(1.0 - keep, focus[1] - keep / 2))
        pic.crop_top, pic.crop_bottom = top, 1.0 - keep - top
    if frame:
        pic.line.color.rgb = RGBColor(0x5A, 0x2F, 0x8C)
        pic.line.width = Pt(1.25)
    return pic


def caption(slide, x, y, w, t, h=0.5, size=12):
    text(slide, x, y, w, h, t, size=size, color=MUTED, italic=True)


def artwork(slide, key, x, y, w, h):
    path = ARTWORK[key]
    if os.path.exists(path):
        picture(slide, path, x, y, w, h, frame=False)
        return
    p = rect(slide, x, y, w, h, fill=PANEL_DARK, line=MAGENTA, lw=1.5)
    p.line.dash_style = MSO_LINE_DASH_STYLE.DASH
    text(slide, x, y + h / 2 - 0.45, w, 0.5, "ARTWORK (Veo)", size=26, font=SERIF,
         color=PEACH, align=PP_ALIGN.CENTER)
    rel = os.path.relpath(path, ROOT)
    text(slide, x, y + h / 2 + 0.15, w, 0.35, f"drop the image at {rel}", size=11,
         color=MUTED, align=PP_ALIGN.CENTER)


def new_slide():
    s = prs.slides.add_slide(BLANK)
    background(s)
    return s


def card(slide, x, y, w, h, title, body, tcolor=CYAN, tsize=17, bsize=14):
    rect(slide, x, y, w, h, fill=PANEL, line=RGBColor(0x3A, 0x1A, 0x66), shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    text(slide, x + 0.25, y + 0.2, w - 0.5, 0.4, title, size=tsize, color=tcolor, bold=True)
    text(slide, x + 0.25, y + 0.62, w - 0.5, h - 0.75, body, size=bsize, color=SOFT)


# ---------- slides ----------

# 1. Cover
s = new_slide()
artwork(s, "cover", 6.65, 0, SW - 6.65, SH)
text(s, 0.7, 1.45, 5.6, 0.3, "META VR START DEVELOPER COMPETITION 2026", size=12, color=PEACH, bold=True)
text(s, 0.7, 1.95, 5.8, 2.2, ["Palm Whorl", "Cities"], size=62, font=SERIF, color=WHITE,
     spacing=0.95, after=0)
accent_rule(s, 0.75, 4.15, 2.2)
text(s, 0.7, 4.45, 5.6, 1.0, "Sow the desert into bloom, together", size=24, font=SERIF,
     color=CYAN, italic=True)
text(s, 0.7, 5.5, 5.6, 0.8, "A live multiplayer world made of players' hands. "
     "Hands only on Meta Quest, and in any browser.", size=15, color=SOFT)
text(s, 0.7, SH - 0.75, 5.6, 0.3, "Made by Tim Dries", size=12, color=MUTED)

# 2. The idea
s = new_slide()
header(s, "The idea", "A world with no designed levels")
text(s, 0.7, 2.2, 4.9, 4.4, [
    "A palm already looks like a map. Its lines are rivers. A fingerprint is a hill drawn in contour lines.",
    "So we built the world out of hands. Ten founder Hands ring the Source, and every player who reads "
    "their own hand adds one more, live, for everyone.",
    [("Nobody designs the land. The players are the land.", {"color": PEACH, "font": SERIF, "size": 20,
                                                            "italic": True})],
], size=18, after=16)
picture(s, shot("22-lobby.jpg"), 6.1, 2.2, 6.55, 3.68)
caption(s, 6.1, 5.98, 6.55, "The lobby: the founder Hands around the Source, everyone flying right now, "
        "and the latest news from the world.")
footer(s, 2)

# 3. Hands only
s = new_slide()
header(s, "How you play in VR", "No controllers. Just your hands.")
picture(s, shot("24-sowing.jpg"), 0.7, 2.2, 5.6, 3.15, focus=(0.55, 0.5))
caption(s, 0.7, 5.45, 5.6, "You fly as a whorl: a creature of ink strands shaped by your own five "
        "fingerprints.", h=0.7)
rows = [
    ("\u2192", "Point", "Steer. Wrist to middle knuckle is the arrow. Dive for speed."),
    ("\u2022", "Pinch", "Sow the seed you hold along your path."),
    ("\u2248", "Sweep", "Scatter seed over a whole plot at once."),
    ("\u2193", "Flat palm", "Pour river water on a thirsty grove."),
    ("\u2191", "Palm up", "Open the atlas: map, herbarium, journal."),
]
y0, rh = 2.2, 0.8
for i, (glyph, g, d) in enumerate(rows):
    y = y0 + i * (rh + 0.1)
    rect(s, 6.8, y, 5.85, rh, fill=PANEL, line=RGBColor(0x3A, 0x1A, 0x66), shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    rect(s, 7.0, y + rh / 2 - 0.24, 0.48, 0.48, fill=CYAN if i % 2 == 0 else MAGENTA, shape=MSO_SHAPE.OVAL)
    text(s, 7.0, y + rh / 2 - 0.24, 0.48, 0.48, glyph, size=18, color=BG, bold=True,
         align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, after=0, spacing=1.0)
    text(s, 7.7, y, 1.4, rh, g, size=17, color=WHITE, bold=True, anchor=MSO_ANCHOR.MIDDLE, after=0)
    text(s, 9.1, y, 3.4, rh, d, size=14, color=SOFT, anchor=MSO_ANCHOR.MIDDLE, after=0)
footer(s, 3)

# 4. Early game
s = new_slide()
header(s, "Early game", "Your hand becomes land")
steps = [
    ("29-headset-palm-dome.jpg", "1  Read it",
     "In the palm reader's dome, by eye. Or with a phone that reads the photos, then deletes them.", (0.5, 0.45)),
    ("03-prints.jpg", "2  Match and trace",
     "Touch the fingerprint pattern on each fingertip. Trace your heart, head and life lines.", (0.5, 0.55)),
    ("07-rivers.jpg", "3  Watch it rise",
     "Your Hand rises out of the wilderness for every player: palm lines become rivers, fingertips terraced hills.",
     (0.5, 0.5)),
]
cw, gap = 3.85, 0.3
for i, (img, t, d, f) in enumerate(steps):
    x = 0.7 + i * (cw + gap)
    picture(s, shot(img), x, 2.2, cw, 2.6, focus=f)
    text(s, x, 5.0, cw, 0.4, t, size=19, color=CYAN, bold=True)
    text(s, x, 5.45, cw, 1.4, d, size=14, color=SOFT)
footer(s, 4)

# 5. Mid game
s = new_slide()
header(s, "Mid game", "A garden for everyone")
picture(s, shot("16-bloom-garden.png"), 0.7, 2.2, 7.3, 4.1, focus=(0.45, 0.5))
text(s, 8.45, 2.0, 4.3, 1.1, "712", size=60, font=SERIF, color=CYAN, after=0)
text(s, 8.45, 3.2, 4.3, 0.8, "real species: 403 flowers and trees to sow, plus mushrooms, birds, "
     "insects, fish and animals.", size=14, color=SOFT)
text(s, 8.45, 4.25, 4.3, 2.2, [
    "Plots bloom and wildlife moves in.",
    "Sandstorms parch what they cross, until someone waters it.",
    "Every four minutes, one golden seed and a race.",
    "Hyper sow: ten seconds of drawing with flowers.",
], size=15, color=WHITE, after=9)
footer(s, 5)

# 6. Late game
s = new_slide()
header(s, "Late game", "Foxfire and gnomes")
cols = [
    ("25-foxfire-seed-trail.jpg", "Foxfire", MAGENTA,
     "Eat a mushroom and the world turns neon synthwave. Rows of seeds ring up a musical scale as you fly "
     "through them. Giant gnome folk dance in visions, and wildlife grows ten times as big."),
    ("27-gnome-mission.jpg", "Gnomes", CYAN,
     "Gnomes live in mushrooms. One grabs your whorl and hangs under it like a parachutist with a wish. "
     "Grant it and it joins your team, or converts from a rival's. Drop it and it falls screaming."),
]
cw = 5.8
for i, (img, t, c, d) in enumerate(cols):
    x = 0.7 + i * (cw + 0.35)
    picture(s, shot(img), x, 2.2, cw, 2.9)
    text(s, x, 5.25, cw, 0.4, t, size=20, color=c, bold=True)
    text(s, x, 5.7, cw, 1.3, d, size=14, color=SOFT)
footer(s, 6)

# 7. Tuft
s = new_slide()
header(s, "Onboarding", "Grandfather Tuft shows you around")
# Frame 0 (rest) of Tuft's portrait sheet, set in a peach disc and masked to a circle.
D = 768
frame = Image.open(os.path.join(ROOT, "assets", "tuft.png")).convert("RGBA").crop((0, 0, 256, 256))
frame = frame.resize((D, D), Image.LANCZOS)
disc = Image.new("RGBA", (D, D), (0xFF, 0xCF, 0xA8, 255))
disc.alpha_composite(frame)
mask = Image.new("L", (D, D), 0)
ImageDraw.Draw(mask).ellipse((0, 0, D - 1, D - 1), fill=255)
disc.putalpha(mask)
tuft_path = os.path.join(tempfile.mkdtemp(), "tuft-frame0.png")
disc.save(tuft_path)
s.shapes.add_picture(tuft_path, Inches(0.7), Inches(2.25), Inches(2.4), Inches(2.4))
text(s, 3.4, 2.3, 3.2, 2.4, [
    [("“Oh. A new one. Try not to crash into anything I planted.”",
      {"font": SERIF, "italic": True, "size": 19, "color": PEACH})],
], size=19)
text(s, 0.7, 4.95, 5.9, 2.0, [
    "A grumpy old gnome, modelled in Blender and voiced by a local neural TTS model (Kokoro): 235 lines.",
    "He calls in through a Lylat Wars style window, runs the tutorial, and leaves short "
    "“what is what” notes through your first minutes.",
], size=14, after=10)
picture(s, shot("23-first-minutes-tuft.jpg"), 6.95, 2.25, 5.7, 3.2, focus=(0.6, 0.35))
caption(s, 6.95, 5.55, 5.7, "First minute: the tutorial card, Tuft's call-in, and a founder Hand below.")
footer(s, 7)

# 8. Multiplayer
s = new_slide()
header(s, "Multiplayer", "One live world, everyone in it")
picture(s, shot("31-community-hand-world.jpg"), 0.7, 2.2, 6.9, 3.88, focus=(0.5, 0.55))
caption(s, 0.7, 6.18, 6.9, "The Community Hand at the Source: every grove sown in the world is one pixel.")
text(s, 8.0, 2.15, 4.7, 4.6, [
    [("Meet", {"color": CYAN, "bold": True}), (": your whorls braid for two seconds and swap seeds.", {})],
    [("See", {"color": CYAN, "bold": True}), (": a live map of everyone flying, profile pictures over every whorl.", {})],
    [("Belong", {"color": CYAN, "bold": True}), (": Google sign-in, usernames, leaderboards for gardeners "
                                                "and gnome converters.", {})],
    [("Share", {"color": CYAN, "bold": True}), (": one garden for all. Anyone can water anyone's grove.", {})],
], size=16, after=14)
footer(s, 8)

# 9. Plays everywhere
s = new_slide()
header(s, "Plays everywhere", "One world, four ways in")
plat = [
    ("Meta Quest", "Hands only, passthrough dome, immersive VR and AR.", "28-gnome-on-compass.jpg", (0.5, 0.45)),
    ("Browser", "Keyboard on any laptop. No install, no build step.", "21-title-centrepiece.jpg", (0.5, 0.45)),
    ("Webcam", "Your webcam reads your hands: the same gestures as Quest.", None, None),
    ("Phone", "Tilt to steer with the gyroscope, touch buttons to sow.", "30-phone-gyroscope.jpg", (0.78, 0.5)),
]
cw, gap = 2.85, 0.2
for i, (t, d, img, f) in enumerate(plat):
    x = 0.7 + i * (cw + gap)
    if img:
        picture(s, shot(img), x, 2.2, cw, 2.1, focus=f)
    else:
        rect(s, x, 2.2, cw, 2.1, fill=PANEL_DARK, line=RGBColor(0x5A, 0x2F, 0x8C), lw=1.25)
        text(s, x, 2.2, cw, 2.1, [[("webcam", {"color": CYAN}), (" = ", {"color": WHITE}),
                                   ("hands", {"color": MAGENTA})]],
             size=24, font=SERIF, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, after=0)
    text(s, x, 4.5, cw, 0.4, t, size=19, color=CYAN if i % 2 == 0 else MAGENTA, bold=True)
    text(s, x, 4.95, cw, 1.4, d, size=14, color=SOFT)
text(s, 0.7, 6.35, 11.9, 0.4, "Everyone flies in the same world at the same time, whatever they hold.",
     size=15, color=PEACH, font=SERIF, italic=True)
footer(s, 9)

# 10. Privacy
s = new_slide()
header(s, "Privacy and safety", "We never need a picture of your hand")
cards = [
    ("Map DNA, never images", "We keep only a coarse hand map of a few hundred bytes. Phone photos "
     "are read in the phone's own browser and deleted."),
    ("Hand tracking stays live", "Joint positions steer and sow in the moment. They are never stored "
     "or sent."),
    ("A hash, not an account", "Google sign-in keeps only a hash of the account id."),
    ("Hardened", "A strict Content Security Policy and origin checks on every connection."),
]
for i, (t, b) in enumerate(cards):
    cx = 0.7 + (i % 2) * 3.3
    cy = 2.2 + (i // 2) * 2.2
    card(s, cx, cy, 3.1, 2.0, t, b, tcolor=CYAN if i in (0, 3) else MAGENTA, tsize=15, bsize=13)
picture(s, shot("32-atlas-me.jpg"), 7.45, 2.2, 5.2, 4.2, focus=(0.5, 0.5))
footer(s, 10)

# 11. Tech
s = new_slide()
header(s, "Tech and scale", "Small parts, built to grow")
BOX_LINE = RGBColor(0x5A, 0x2F, 0x8C)


def box(x, y, w, h, title, sub, c):
    rect(s, x, y, w, h, fill=PANEL, line=c, shape=MSO_SHAPE.ROUNDED_RECTANGLE, lw=1.5)
    text(s, x + 0.15, y + 0.14, w - 0.3, 0.35, title, size=15, color=WHITE, bold=True,
         align=PP_ALIGN.CENTER, after=0)
    text(s, x + 0.15, y + 0.52, w - 0.3, h - 0.6, sub.split("\n"), size=12, color=SOFT, align=PP_ALIGN.CENTER,
         spacing=1.05, after=0)


def arrow(x1, y1, x2, y2):
    c = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = PEACH
    c.line.width = Pt(1.75)
    ln = c.line._get_or_add_ln()
    tail = ln.makeelement(qn("a:tailEnd"), {"type": "triangle", "w": "med", "len": "med"})
    ln.append(tail)


bh = 1.15
box(0.7, 2.75, 2.6, bh, "Client", "three.js 0.186 + WebXR\nhand tracking, no build step", CYAN)
box(4.0, 2.75, 2.5, bh, "Worker", "Cloudflare Workers\norigin checks, CSP", CYAN)
box(7.2, 2.0, 2.6, bh, "World DO", "the one writer:\nHands and groves", MAGENTA)
box(7.2, 3.5, 2.6, bh, "Room DOs", "200 players each\nlive over WebSockets", MAGENTA)
box(10.5, 2.0, 2.15, bh, "D1", "the shared map,\nread Hand by Hand", PEACH)
arrow(3.3, 2.75 + bh / 2, 4.0, 2.75 + bh / 2)
arrow(6.5, 3.1, 7.2, 2.0 + bh / 2)
arrow(6.5, 3.55, 7.2, 3.5 + bh / 2)
arrow(9.8, 2.0 + bh / 2, 10.5, 2.0 + bh / 2)
text(s, 10.5, 3.55, 2.15, 1.1, "Seed clouds, storms and the golden seed come from the clock: nothing stored.",
     size=11, color=MUTED, italic=True, spacing=1.05)

stats = [
    ("340", "unit tests, plus headless browser checks end to end"),
    ("712", "species today, with room for 65,533"),
    ("200", "players per room, rooms scale out"),
]
for i, (n, d) in enumerate(stats):
    x = 0.7 + i * 4.05
    text(s, x, 5.0, 1.5, 0.8, n, size=40, font=SERIF, color=CYAN if i != 1 else MAGENTA, after=0)
    text(s, x + 1.55, 5.08, 2.3, 0.8, d, size=13, color=SOFT, spacing=1.05, after=0)
text(s, 0.7, 6.25, 11.9, 0.4, "Also: Blender (gnome model, Tuft bust), Kokoro TTS, ffmpeg, "
     "and the IWER Quest emulator for testing and filming.", size=13, color=PEACH)
footer(s, 11)

# 12. Closing
s = new_slide()
artwork(s, "closing", 6.65, 0, SW - 6.65, SH)
text(s, 0.7, 1.2, 5.6, 0.3, "COME SOW WITH US", size=12, color=PEACH, bold=True)
text(s, 0.7, 1.6, 5.7, 1.6, ["Add your hand", "to the world"], size=44, font=SERIF, color=WHITE,
     spacing=0.95, after=0)
accent_rule(s, 0.75, 3.25, 2.2)
links = [("PLAY", PLAY_URL, CYAN), ("CODE", CODE_URL, CYAN), ("VIDEO", VIDEO_URL, MAGENTA)]
for i, (k, v, c) in enumerate(links):
    y = 3.7 + i * 0.85
    text(s, 0.7, y, 5.6, 0.3, k, size=11, color=PEACH, bold=True, after=0)
    text(s, 0.7, y + 0.28, 5.7, 0.45, v, size=14, color=c, after=0)
text(s, 0.7, 6.35, 5.6, 0.4, "Made by Tim Dries", size=14, color=WHITE, font=SERIF, italic=True)

# Give every shape a deck-unique id (legal OOXML). Some renderers (macOS Quick Look)
# cache drawn shapes by id across slides and paint stray copies otherwise.
for si, sl in enumerate(prs.slides, 1):
    for k, el in enumerate(sl.shapes._spTree.iter(qn("p:cNvPr")), 1):
        el.set("id", str(si * 1000 + k))
        el.set("name", f"{el.get('name')} s{si}-{k}")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
prs.save(OUT)
print("wrote", OUT)
