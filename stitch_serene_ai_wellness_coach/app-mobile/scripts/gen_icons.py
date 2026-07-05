"""Generate Serene brand assets (app icon, Android adaptive icon, splash).

Draws a calm "sprout" mark in the Serene palette. Supersampled 4x then
downscaled with LANCZOS for clean anti-aliased edges. Re-run to regenerate:

    python3 app-mobile/scripts/gen_icons.py
"""
import math
import os

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "assets")
os.makedirs(OUT, exist_ok=True)

# Serene palette (from theme/serene.ts)
MINT = (232, 255, 241, 255)        # #e8fff1 surface/background
FOREST = (15, 82, 56, 255)         # #0f5238 primary
CONTAINER = (45, 106, 79, 255)     # #2d6a4f primaryContainer
LIGHT = (177, 240, 206, 255)       # #b1f0ce primaryFixed (veins / highlight)

SS = 4  # supersample factor


def _leaf_points(length, width, n=80):
    """Leaf outline in local coords: bottom tip at (0,0), tip up at (0,length)."""
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        y = t * length
        hw = width * (math.sin(math.pi * t) ** 0.8)
        left.append((-hw, y))
        right.append((hw, y))
    return left + right[::-1]


def _rot_translate(points, angle_deg, ox, oy):
    a = math.radians(angle_deg)
    ca, sa = math.cos(a), math.sin(a)
    out = []
    for x, y in points:
        # rotate then place; image y grows downward, leaf grows upward -> negate y
        rx = x * ca - y * sa
        ry = x * sa + y * ca
        out.append((ox + rx, oy - ry))
    return out


def _draw_leaf(draw, angle, base, length, width, fill):
    pts = _rot_translate(_leaf_points(length, width), angle, base[0], base[1])
    draw.polygon(pts, fill=fill)
    # midrib vein from base to tip
    rib = _rot_translate([(0, length * 0.06), (0, length * 0.94)], angle, base[0], base[1])
    draw.line(rib, fill=LIGHT, width=max(2, int(width * 0.10)))


def make_sprout(size, scale, bg=None, pad_ratio=0.0):
    """Return an RGBA image `size`x`size` with the sprout centered.

    scale: fraction of `size` the whole mark occupies (height-wise).
    bg: background RGBA, or None for transparent.
    """
    S = size * SS
    img = Image.new("RGBA", (S, S), bg if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    cx = S / 2
    L = S * scale * 0.60      # leaf length
    W = L * 0.30              # leaf half-width (slimmer = more elegant)
    stem_h = S * scale * 0.26

    # Vertically center the whole mark. It spans from the stem bottom (base_y)
    # up to the crown-leaf tip ~ base_y - (stem_h + 0.80*L).
    mark_h = stem_h + 0.80 * L
    base_y = S / 2 + mark_h / 2

    # stem
    d.line([(cx, base_y), (cx, base_y - stem_h)], fill=CONTAINER,
           width=max(3, int(S * scale * 0.030)))
    sprout_base = (cx, base_y - stem_h * 0.35)

    # two side leaves (more upright) + a taller crown leaf
    _draw_leaf(d, -40, sprout_base, L * 0.90, W * 0.90, FOREST)
    _draw_leaf(d, 40, sprout_base, L * 0.90, W * 0.90, CONTAINER)
    _draw_leaf(d, 0, (cx, base_y - stem_h), L, W * 0.80, FOREST)

    return img.resize((size, size), Image.LANCZOS)


def main():
    # iOS / store icon — full-bleed mint background, mark ~64% (iOS masks corners)
    icon = make_sprout(1024, scale=1.04, bg=MINT)
    icon.convert("RGB").save(os.path.join(OUT, "icon.png"))

    # Android adaptive foreground — transparent, mark kept inside ~66% safe zone
    # (circular/squircle masks clip the outer third, so keep the mark small)
    adaptive = make_sprout(1024, scale=0.74)
    adaptive.save(os.path.join(OUT, "adaptive-icon.png"))

    # Splash — mint bg, smaller centered mark
    splash = make_sprout(1024, scale=0.66, bg=MINT)
    splash.convert("RGB").save(os.path.join(OUT, "splash.png"))

    # Web favicon
    fav = make_sprout(48, scale=1.0, bg=MINT)
    fav.convert("RGB").save(os.path.join(OUT, "favicon.png"))

    for f in ("icon.png", "adaptive-icon.png", "splash.png", "favicon.png"):
        p = os.path.join(OUT, f)
        print(f, Image.open(p).size, f"{os.path.getsize(p)//1024} KB")


if __name__ == "__main__":
    main()
