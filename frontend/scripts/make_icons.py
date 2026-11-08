"""Renders the NAVDECK compass logo to PNG app icons (run once: python scripts/make_icons.py)."""
import math
from pathlib import Path

from PIL import Image, ImageDraw

S = 1024
OUT = Path(__file__).resolve().parent.parent / "public"
STOPS = [(0.0, (34, 211, 238)), (0.55, (99, 102, 241)), (1.0, (217, 70, 239))]


def grad(t):
    for (a, ca), (b, cb) in zip(STOPS, STOPS[1:]):
        if t <= b:
            k = (t - a) / (b - a)
            return tuple(round(ca[i] + (cb[i] - ca[i]) * k) for i in range(3))
    return STOPS[-1][1]


def render(rounded):
    img = Image.new("RGBA", (S, S))
    px = img.load()
    for y in range(S):
        for x in range(S):
            px[x, y] = grad((x + y) / (2 * (S - 1))) + (255,)
    if rounded:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 14 // 48, fill=255)
        img.putalpha(mask)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    u = S / 48
    c, r = 24 * u, 14 * u
    # Dashed compass ring: 2-unit dashes with 3-unit gaps along the circumference
    circ = 2 * math.pi * 14
    steps = int(circ // 5)
    for i in range(steps):
        a0 = i * 5 / 14
        a1 = a0 + 2 / 14
        d.arc([c - r, c - r, c + r, c + r], math.degrees(a0), math.degrees(a1), fill=(255, 255, 255, 90), width=round(1.5 * u))
    pt = lambda x, y: (x * u, y * u)
    d.polygon([pt(24, 9), pt(28, 24), pt(24, 21), pt(20, 24)], fill=(255, 255, 255, 255))
    d.polygon([pt(24, 39), pt(20, 24), pt(24, 27), pt(28, 24)], fill=(255, 255, 255, 140))
    d.ellipse([c - 2.2 * u, c - 2.2 * u, c + 2.2 * u, c + 2.2 * u], fill=(255, 255, 255, 255))
    return Image.alpha_composite(img, layer)


square = render(rounded=False)  # iOS rounds the corners itself
square.convert("RGB").resize((180, 180), Image.LANCZOS).save(OUT / "apple-touch-icon.png")
for size in (192, 512):
    square.convert("RGB").resize((size, size), Image.LANCZOS).save(OUT / f"icon-{size}.png")
render(rounded=True).resize((64, 64), Image.LANCZOS).save(OUT / "favicon.png")
print("icons written to", OUT)
