#!/usr/bin/env python3
"""Measure the colour in a visual so a critique can quote numbers instead of impressions.

  python3 color.py measure <image> [--route graphic|landing|app] [--accent COLOUR] [--focus BOX] [--crop BOX]
                           [--scale N] [--dom dom.json] [--no-text] [--out DIR]
  python3 color.py measure --dom dom.json [--route landing|app] [--out DIR]
  python3 color.py sample <image> BOX [BOX ...]
  python3 color.py palette <[role:]COLOUR[@share]> ... [--route ...] [--grade COLOUR@amount] [--name NAME] [--out DIR]
  python3 color.py contrast <text-COLOUR> <surface-COLOUR>
  python3 color.py recolor <image> [--map FROM:TO ...] [--grade COLOUR@amount] [--region BOX] [--range DEG]
                           [--radius dE] [--lwin dL] [--before IMAGE] [--out FILE]
  python3 color.py shot <page.html> [--size 1440x900] [--scale 2] [--dom] --out shot.png

COLOUR is hex (#E65BC4) or oklch(0.62 0.21 341). BOX is x0,y0,x1,y1, as fractions of the image (0-1) or pixels.

measure  palette by area, the 60/30/10 split, vivid hue peaks, an accent guess (or --accent), lightness structure,
         temperature, relations between the main colours, the loudest spots (and where --focus ranks), text contrast
         per line read by macOS Vision, and colour-blind views. Writes <out>/<name>.json and <name>.board.png.
         --dom adds exact text/surface pairs, control boundaries, coloured shadows and the paint inventory from
         scripts/dom_colors.js (and crops the screenshot to its COLOR_ROOT box when --crop isn't given).
sample   the median colour of each box: read a designed colour off an image, or compare one patch before and after.
palette  the same relations for a list of colours. Roles change the checks: accent/primary/cta/brand = the accent
         family; success/warning/danger/error/info = status (kept out of pop/harmony); content/photo/product =
         content; peer/series/tag/category = peers (equal L and C); text/ink/label and bg/field/surface/card = text and
         surfaces (contrast printed for every pair).
contrast APCA Lc and WCAG ratio for one pair, and the smallest lightness-only move of the text (either polarity) or of
         the surface (keeping polarity) that reaches |Lc| 30, 45, 60, 75 and 90.
recolor  a preview of colour moves on an image. A coloured source moves every pixel of its hue (scaled to each pixel's
         own chroma); a near-neutral source moves pixels near it. Each pixel follows the one map that fits it best.
         --region confines the change; chain runs for several regions (--before keeps the original in the strip);
         --grade tints everything toward one colour with lightness kept. Untouched pixels stay byte-identical.
shot     render a local HTML file (a stand-in screen for a palette) with headless Chrome; --dom also saves the
         dom_colors.js JSON beside the PNG.

All maths is OKLab/OKLCH. Needs numpy and Pillow.
"""
import argparse
import hashlib
import html as htmllib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
LANCZOS = getattr(Image, "Resampling", Image).LANCZOS
DEFAULT_OUT = Path(tempfile.gettempdir()) / "color-analysis"

# 60/30/10 accent band (% of frame) and APCA floors per route: (minimum, preferred) |Lc| for small and large text.
ROUTES = {
    "graphic": {"accent": (8, 20), "small": (60, 60), "large": (45, 45), "families": 3},
    "landing": {"accent": (5, 12), "small": (60, 75), "large": (45, 60), "families": 4},
    "app": {"accent": (0, 10), "small": (60, 75), "large": (45, 60), "families": 1},
}
KINDS = {
    "accent": {"accent", "primary", "cta", "brand", "action", "pop", "energy", "highlight"},
    "status": {"success", "warning", "danger", "error", "info", "status", "positive", "negative", "alert"},
    "content": {"content", "photo", "product", "subject", "skin", "image"},
    "text": {"text", "ink", "body", "label", "type", "heading", "headline", "copy"},
    "surface": {"bg", "background", "field", "surface", "card", "page", "base", "canvas", "sheet"},
    "light": {"light"},
    "peer": {"peer", "series", "tag", "category", "chart"},
}
NEUTRAL_C = 0.025      # below this a colour is a neutral (grey, cream, off-black) in the 60/30/10 split

# ---------------------------------------------------------------- colour maths
_M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
                [0.2119034982, 0.6806995451, 0.1073969566],
                [0.0883024619, 0.2817188376, 0.6299787005]])
_M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
                [1.9779984951, -2.4285922050, 0.4505937099],
                [0.0259040371, 0.7827717662, -0.8086757660]])
_M2_INV = np.array([[1.0, 0.3963377774, 0.2158037573],
                    [1.0, -0.1055613458, -0.0638541728],
                    [1.0, -0.0894841775, -1.2914855480]])
_M1_INV = np.array([[4.0767416621, -3.3077115913, 0.2309699292],
                    [-1.2684380046, 2.6097574011, -0.3413193965],
                    [-0.0041960863, -0.7034186147, 1.7076147010]])
# Machado et al. 2009, severity 1, applied to linear RGB.
CVD = {
    "deuteranopia": np.array([[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]]),
    "protanopia": np.array([[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]),
    "tritanopia": np.array([[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]),
}


def to_linear(rgb):
    c = np.asarray(rgb, float) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def from_linear(lin):
    c = np.clip(lin, 0, 1)
    return 255 * np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)


def lab(rgb):
    return np.cbrt(to_linear(rgb) @ _M1.T) @ _M2.T


def lab_to_linear(x):
    return ((np.asarray(x, float) @ _M2_INV.T) ** 3) @ _M1_INV.T


def lch(x):
    x = np.asarray(x, float)
    return x[..., 0], np.hypot(x[..., 1], x[..., 2]), np.degrees(np.arctan2(x[..., 2], x[..., 1])) % 360


def lab_from_lch(L, C, H):
    h = np.radians(H)
    L, C = np.broadcast_arrays(np.asarray(L, float), np.asarray(C, float))
    return np.stack([L, C * np.cos(h), C * np.sin(h)], -1)


def hue_dist(a, b):
    d = np.abs(np.asarray(a, float) - b) % 360
    return np.minimum(d, 360 - d)


_CEIL = None


def ceiling(L, H):
    """The most chroma sRGB can show at this OKLCH lightness and hue (bilinear lookup in a 101 x 361 table)."""
    global _CEIL
    if _CEIL is None:
        Lg, Hg = np.meshgrid(np.linspace(0, 1, 101), np.arange(0, 361, 1.0), indexing="ij")
        lo, hi = np.zeros_like(Lg), np.full_like(Lg, 0.4)
        for _ in range(22):
            mid = (lo + hi) / 2
            lin = lab_to_linear(lab_from_lch(Lg, mid, Hg))
            ok = np.all((lin >= -1e-4) & (lin <= 1 + 1e-4), axis=-1)
            lo, hi = np.where(ok, mid, lo), np.where(ok, hi, mid)
        _CEIL = lo
    L = np.clip(np.asarray(L, float), 0, 1) * 100
    H = np.asarray(H, float) % 360
    i, j = np.clip(np.floor(L).astype(int), 0, 99), np.clip(np.floor(H).astype(int), 0, 359)
    fl, fh, t = L - i, H - j, _CEIL
    return (t[i, j] * (1 - fl) * (1 - fh) + t[i + 1, j] * fl * (1 - fh) + t[i, j + 1] * (1 - fl) * fh + t[i + 1, j + 1] * fl * fh)


_OKLCH = re.compile(r"^oklch\(\s*([\d.]+)(%?)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:deg)?\s*(?:/\s*[\d.]+%?\s*)?\)$", re.I)


def parse_colour(s):
    """#RGB, #RRGGBB or oklch(L C H) (L as 0-1 or %) -> sRGB 0-255, rounded to 8 bits like a hex value."""
    t = s.strip()
    m = _OKLCH.match(t)
    if m:
        L = float(m.group(1)) / (100 if m.group(2) else 1)
        return np.round(lch_rgb(L, float(m.group(3)), float(m.group(4))))
    h = t.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if not re.fullmatch(r"[0-9a-fA-F]{6}", h):
        raise ValueError(f"not a colour: {s!r} (use #RRGGBB or oklch(L C H), each colour as its own quoted argument)")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


def rgb_hex(rgb):
    return "#" + "".join(f"{int(round(float(v))):02X}" for v in np.clip(rgb, 0, 255))


def lch_rgb(L, C, H):
    C = min(float(C), float(ceiling(L, H)))
    return from_linear(lab_to_linear(lab_from_lch(L, C, H)))


def lch_of(rgb):
    L, C, H = lch(lab(np.asarray(rgb, float)))
    return float(L), float(C), float(H)


HUES = [(18, "pink-red"), (42, "red"), (65, "orange"), (90, "amber"), (112, "yellow"), (133, "chartreuse"),
        (165, "green"), (205, "teal"), (240, "azure"), (272, "blue"), (300, "indigo"), (322, "violet"),
        (345, "magenta"), (361, "pink-red")]


def temp(H, C):
    if C < 0.04:
        return "neutral"
    return "warm" if H < 110 or H >= 350 else "cool" if 150 <= H < 300 else "mid"


def name(L, C, H):
    if C < 0.01:
        return "black" if L < 0.2 else "white" if L > 0.97 else "grey"
    if C < 0.03:
        if L < 0.2:
            return "black"
        if 20 <= H < 110:
            return "cream" if L > 0.85 else "warm grey"
        if 110 <= H < 150:
            return "olive grey"
        if 150 <= H < 300:
            return "cool grey"
        return "blush" if L > 0.85 else "mauve grey"
    hue = next(n for lim, n in HUES if H < lim)
    if 25 <= H < 90 and L < 0.55 and C < 0.12:
        return "brown"
    if 50 <= H < 110 and L > 0.85 and C < 0.08:
        return "cream"
    if L > 0.85:
        return "pale " + hue
    if L < 0.35:
        return "deep " + hue
    if C < 0.08:
        return "muted " + hue
    return hue


def describe(rgb):
    L, C, H = lch_of(rgb)
    if C < 0.003:
        C, H = 0.0, 0.0
    return {"hex": rgb_hex(rgb), "oklch": f"oklch({L:.3f} {C:.3f} {H:.1f})", "L": round(L, 3), "C": round(C, 3),
            "H": round(H, 1), "vividness": round(C / max(float(ceiling(L, H)), 0.02), 2), "temp": temp(H, C),
            "name": name(L, C, H)}


def kind_of(role):
    r = (role or "").lower().strip()
    r = re.sub(r"[-_ ]?\d+$", "", r)
    for k, words in KINDS.items():
        if r in words or r.split("-")[0] in words or r.split("_")[0] in words:
            return k
    return "other"


def apca(text, bg):
    """APCA 0.0.98G Lc of text on bg (sRGB 0-255). Negative = light text on dark."""
    def y(rgb):
        c = (np.asarray(rgb, float) / 255.0) ** 2.4
        v = 0.2126729 * c[0] + 0.7151522 * c[1] + 0.0721750 * c[2]
        return v + (0.022 - v) ** 1.414 if v < 0.022 else v
    yt, yb = y(text), y(bg)
    if abs(yb - yt) < 0.0005:
        return 0.0
    if yb > yt:
        s = (yb ** 0.56 - yt ** 0.57) * 1.14
        return 0.0 if s < 0.1 else round((s - 0.027) * 100, 1)
    s = (yb ** 0.65 - yt ** 0.62) * 1.14
    return 0.0 if s > -0.1 else round((s + 0.027) * 100, 1)


def wcag(a, b):
    lum = lambda rgb: float(to_linear(rgb) @ np.array([0.2126, 0.7152, 0.0722]))
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return round((hi + 0.05) / (lo + 0.05), 2)


def floors_for(route, size_class, px=None):
    """APCA floors (minimum, preferred). Text under 12 px needs 15 more: APCA's size table climbs steeply there."""
    lo, pref = ROUTES[route][size_class]
    if px is not None and px < 12:
        lo, pref = min(lo + 15, 90), min(pref + 15, 90)
    return lo, pref


def reach(target, fixed, moving, moving_is_text):
    """The smallest move of `moving`'s OKLCH lightness (chroma clamped to sRGB) giving |Lc| >= target. The text may
    flip polarity (a different ink); a surface only moves away from the text, so it keeps its polarity."""
    L0, C, H = lch_of(moving)
    Lf = lch_of(fixed)[0]
    steps = (-0.004, 0.004) if moving_is_text else ((0.004,) if L0 >= Lf else (-0.004,))
    best = None
    for step in steps:
        L = L0
        while 0 <= L <= 1:
            rgb = np.round(lch_rgb(L, C, H))
            lc = apca(rgb, fixed) if moving_is_text else apca(fixed, rgb)
            if abs(lc) >= target:
                if best is None or abs(L - L0) < abs(best[0] - L0):
                    best = (L, rgb, lc)
                break
            L += step
    if best is None:
        return None
    L, rgb, lc = best
    d, d0 = describe(rgb), describe(moving)
    notes = []
    if d["C"] < C - 0.006:
        notes.append("chroma clamped to fit sRGB")
    if moving_is_text and (d["L"] - Lf) * (L0 - Lf) < 0:
        notes.append("flips to " + ("light" if d["L"] > Lf else "dark") + " text")
    if d["vividness"] >= 0.9 and d["vividness"] - d0["vividness"] >= 0.1:
        notes.append(f"vividness {d0['vividness']} -> {d['vividness']}: lower C too if it turns loud")
    return {"hex": d["hex"], "oklch": d["oklch"], "Lc": lc, "moved_L": round(d["L"] - L0, 3), "notes": notes}


def simulate(rgb, kind):
    return from_linear(to_linear(rgb) @ CVD[kind].T)


def de(a, b):
    return float(np.linalg.norm(lab(np.asarray(a, float)) - lab(np.asarray(b, float))))


# ---------------------------------------------------------------- image analysis
def load(path):
    return np.asarray(Image.open(path).convert("RGB"), dtype=float)


def shrink(rgb, long_side):
    img = Image.fromarray(np.clip(np.round(rgb), 0, 255).astype(np.uint8))
    if max(img.size) > long_side:
        s = long_side / max(img.size)
        img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), LANCZOS)
    return np.asarray(img, dtype=float)


def parse_box(s, W, H):
    v = [float(x) for x in re.split(r"[,\s]+", s.strip())]
    if len(v) != 4:
        raise ValueError(f"a box is x0,y0,x1,y1, got {s!r}")
    if max(v) > 1:
        x0, y0, x1, y1 = v
    else:
        x0, y0, x1, y1 = v[0] * W, v[1] * H, v[2] * W, v[3] * H
    x0, y0 = int(np.clip(round(x0), 0, W - 1)), int(np.clip(round(y0), 0, H - 1))
    return x0, y0, int(np.clip(round(x1), x0 + 1, W)), int(np.clip(round(y1), y0 + 1, H))


def grade_lab(X, colour, amount):
    """A colour grade: every colour's a/b pulled toward the grade colour's by `amount` (a number, or one per pixel),
    lightness kept: a 'color' overlay at low opacity, done perceptually. Shared tint glues colours into one scene."""
    g = lab(colour)
    out = np.array(X, float, copy=True)
    amt = np.asarray(amount, float)
    if amt.ndim:
        amt = amt[:, None]
    out[..., 1:] += amt * (g[1:] - out[..., 1:])
    return out


def kmeans(X, k, seed=7, iters=25):
    rng = np.random.default_rng(seed)
    centres = [X[rng.integers(len(X))]]
    for _ in range(1, k):
        d2 = np.min(((X[:, None, :] - np.array(centres)[None]) ** 2).sum(-1), axis=1)
        if d2.sum() <= 0:
            break
        centres.append(X[rng.choice(len(X), p=d2 / d2.sum())])
    C = np.array(centres)
    for _ in range(iters):
        labels = ((X[:, None, :] - C[None]) ** 2).sum(-1).argmin(1)
        new = np.array([X[labels == j].mean(0) if np.any(labels == j) else C[j] for j in range(len(C))])
        if np.allclose(new, C, atol=1e-5):
            break
        C = new
    return labels


def palette_of(rgb, most=10):
    """K-means in OKLab (hue weighted double so small colours get their own cluster). Near-duplicates merge; colours of
    different hues only merge as a last resort, so pastels of four hues never average into one grey."""
    X = lab(rgb.reshape(-1, 3))
    labels = kmeans(X * np.array([1.0, 2.0, 2.0]), 14)
    cl = [{"n": int((labels == j).sum()), "lab": X[labels == j].mean(0)} for j in np.unique(labels)]

    def cost(a, b):
        d = float(np.linalg.norm(a["lab"] - b["lab"]))
        (_, ca, ha), (_, cb, hb) = lch(a["lab"]), lch(b["lab"])
        return d + (0.1 if ca >= 0.02 and cb >= 0.02 and hue_dist(ha, hb) >= 35 else 0)

    while len(cl) > 1:
        c, i, j = min((cost(cl[i], cl[j]), i, j) for i in range(len(cl)) for j in range(i + 1, len(cl)))
        if c >= 0.045 and len(cl) <= most:
            break
        a, b = cl[i], cl[j]
        n = a["n"] + b["n"]
        cl[i] = {"n": n, "lab": (a["lab"] * a["n"] + b["lab"] * b["n"]) / n}
        del cl[j]
    out = []
    for c in sorted(cl, key=lambda c: -c["n"]):
        share = 100 * c["n"] / len(X)
        if share < 0.5:
            continue
        L, C, H = (float(v) for v in lch(c["lab"]))
        out.append({**describe(np.round(lch_rgb(L, C, H))), "share": round(share, 1)})
    return out


def vivid_peaks(rgb):
    """Hue peaks among strongly coloured pixels: the accent candidates, with their true (unaveraged) colour. `share` is
    the whole hue family's area (every pixel of that hue at half its chroma or more), not one element's."""
    X = lab(rgb.reshape(-1, 3))
    L, C, H = lch(X)
    viv = C / np.maximum(ceiling(L, H), 0.02)
    vivid = (C >= 0.06) & (viv >= 0.45)
    if vivid.sum() < 0.002 * len(X):
        return []
    hist, _ = np.histogram(H[vivid], bins=72, range=(0, 360))
    sm = (np.roll(hist, 1) + hist + np.roll(hist, -1)) / 3
    out = []
    for i in sorted(range(72), key=lambda i: -sm[i]):
        if sm[i] <= 0 or sm[i] < sm[i - 1] or sm[i] < sm[(i + 1) % 72]:
            continue
        h = i * 5 + 2.5
        if any(hue_dist(h, o["H"]) < 25 for o in out):
            continue
        members = vivid & (hue_dist(H, h) < 20)
        if members.mean() * 100 < 0.3:
            continue
        top = members & (C >= np.percentile(C[members], 70))
        Lr, Cr, Hr = (float(v) for v in lch(X[top].mean(0)))
        body = (hue_dist(H, Hr) < 22) & (C >= 0.5 * Cr)
        out.append({**describe(np.round(lch_rgb(Lr, Cr, Hr))), "share": round(float(body.mean() * 100), 1),
                    "peak_vividness": round(float(np.percentile(viv[members], 90)), 2)})
        if len(out) == 4:
            break
    return out


def box_blur(a, r):
    p = np.pad(a, r, mode="edge")
    c = np.pad(p.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    k = 2 * r + 1
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def components(mask):
    h, w = mask.shape
    seen = np.zeros_like(mask, bool)
    comps = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            stack, cells = [(y, x)], []
            seen[y, x] = True
            while stack:
                cy, cx = stack.pop()
                cells.append((cy, cx))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
            comps.append(cells)
    return comps


def loudness_map(rgb):
    """Per cell of a 120-wide grid: strongly coloured, or far lighter/darker than its surroundings."""
    small = shrink(rgb, 120)
    h, w, _ = small.shape
    L, C, H = lch(lab(small.reshape(-1, 3)))
    Lm = L.reshape(h, w)
    local = np.abs(Lm - box_blur(Lm, max(2, w // 12)))
    score = 0.55 * np.clip(C / 0.2, 0, 1).reshape(h, w) + 0.45 * np.clip(local / 0.35, 0, 1)
    return small, score, C.reshape(h, w), local


def loud_spots(rgb):
    """Where the eye goes first. Fragments of one element are joined; thin full-width or full-height lines (section
    edges) are dropped; each spot is named by its most colourful (or most contrasting) pixels, not its average.
    Top 3; a dark subject carried by value doesn't rank."""
    small, score, Cm, local = loudness_map(rgb)
    h, w = score.shape
    mask = score >= max(float(np.percentile(score, 95)), 0.3)
    joined = box_blur(mask.astype(float), 1) > 0
    spots = []
    for cells in components(joined):
        ys, xs = np.array(cells).T
        keep = mask[ys, xs]
        if keep.sum() < 0.003 * h * w:
            continue
        ys, xs = ys[keep], xs[keep]
        bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        if (bh <= 3 and bw >= 0.5 * w) or (bw <= 3 and bh >= 0.5 * h):
            continue
        spots.append({"box": [xs.min(), ys.min(), xs.max() + 1, ys.max() + 1], "n": len(ys), "weight": float(score[ys, xs].sum()),
                      "ys": ys, "xs": xs})
    merged = True
    while merged:
        merged = False
        for i in range(len(spots)):
            for j in range(i + 1, len(spots)):
                a, b = spots[i]["box"], spots[j]["box"]
                if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                    A, B = spots[i], spots[j]
                    spots[i] = {"box": [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])], "n": A["n"] + B["n"],
                                "weight": A["weight"] + B["weight"], "ys": np.concatenate([A["ys"], B["ys"]]),
                                "xs": np.concatenate([A["xs"], B["xs"]])}
                    del spots[j]
                    merged = True
                    break
            if merged:
                break
    spots.sort(key=lambda s: -s["weight"])
    total = sum(s["weight"] for s in spots) or 1
    out = []
    for rank, s in enumerate(spots[:3]):
        ys, xs = s["ys"], s["xs"]
        c = Cm[ys, xs]
        pick = c >= np.percentile(c, 70) if c.max() >= 0.06 else local[ys, xs] >= np.percentile(local[ys, xs], 70)
        d = describe(np.median(small[ys[pick], xs[pick]], 0))
        x0, y0, x1, y1 = s["box"]
        out.append({"bbox": [round(float(x0) / w, 2), round(float(y0) / h, 2), round(float(x1) / w, 2), round(float(y1) / h, 2)],
                    "share": round(100 * s["n"] / (h * w), 1), "weight": round(100 * s["weight"] / total), "hex": d["hex"], "name": d["name"]})
    return out, spots, total


def focus_report(rgb, box_s, spots, total):
    """Where the intended focus (a CTA, the subject) ranks for loudness: its own loudness against the top spots."""
    small, score, _, _ = loudness_map(rgb)
    h, w = score.shape
    x0, y0, x1, y1 = parse_box(box_s, w, h) if max(float(v) for v in box_s.split(",")) <= 1 else \
        parse_box(",".join(str(float(v) * w / rgb.shape[1] if i % 2 == 0 else float(v) * h / rgb.shape[0])
                           for i, v in enumerate(box_s.split(","))), w, h)
    region = score[y0:y1, x0:x1]
    weight = float(region[region >= max(float(np.percentile(score, 95)), 0.3)].sum())
    peak = float(region.max()) if region.size else 0.0
    rank = 1 + sum(1 for s in spots if s["weight"] > weight)
    return {"box": box_s, "weight_vs_loudest": round(100 * weight / max(spots[0]["weight"], 1e-9)) if spots else None,
            "rank": rank, "peak_loudness": round(peak, 2), "loudest_peak": round(float(score.max()), 2)}


def otsu(v, bins=64):
    hist, edges = np.histogram(v, bins=bins, range=(0, 1))
    p = hist / max(hist.sum(), 1)
    w0, mids = np.cumsum(p), (edges[:-1] + edges[1:]) / 2
    mu = np.cumsum(p * mids)
    between = (mu[-1] * w0 - mu) ** 2 / np.maximum(w0 * (1 - w0), 1e-9)
    return float(edges[1:][np.argmax(between)])


def read_text(path):
    swift, script = shutil.which("swift"), HERE / "ocr.swift"
    if not swift or not script.exists():
        return None
    try:
        out = subprocess.run([swift, str(script), str(path)], capture_output=True, text=True, timeout=240, check=True).stdout
        return next((json.loads(l)["boxes"] for l in out.splitlines() if l.startswith("{")), [])
    except Exception:
        return None


def text_contrast(rgb, boxes, route, scale=None):
    """Per line Vision read: the ground is the tone matching the ring just outside the box (so heavy type can't swap
    glyph and ground); the glyph colour is the core of the other tone (anti-aliased edges left out); the size comes
    from the glyphs' own height (cap height for all caps, ascender to descender otherwise); a line whose glyphs mix a
    neutral and a vivid colour, or two far hues, is marked mixed (check each colour with `contrast`)."""
    Hh, Ww = rgb.shape[:2]
    rows = []
    for b in boxes:
        bx, by, bw, bh = b["x"] * Ww, b["y"] * Hh, b["w"] * Ww, b["h"] * Hh
        x0, y0, x1, y1 = max(0, int(bx)), max(0, int(by)), min(Ww, int(bx + bw)), min(Hh, int(by + bh))
        if x1 - x0 < 4 or y1 - y0 < 4:
            continue
        rotated = (y1 - y0) > 2.2 * (x1 - x0) and len(b["text"]) > 3
        thick = (x1 - x0) if rotated else (y1 - y0)
        pad = max(2, int(0.3 * thick))
        X0, Y0, X1, Y1 = max(0, x0 - pad), max(0, y0 - pad), min(Ww, x1 + pad), min(Hh, y1 + pad)
        outer = rgb[Y0:Y1, X0:X1]
        ringmask = np.ones(outer.shape[:2], bool)
        ringmask[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = False
        box2d = rgb[y0:y1, x0:x1]
        ring, inner = outer[ringmask], box2d.reshape(-1, 3)
        if len(ring) < 20:
            continue
        Li, Lr = lch(lab(inner))[0], lch(lab(ring))[0]
        t = otsu(np.clip(Li, 0, 1))
        lo_m = Li < t
        lo, hi = inner[lo_m], inner[~lo_m]
        if min(len(lo), len(hi)) < 0.03 * len(inner):
            continue
        ground_L = float(np.median(Lr))
        loL, hiL = float(np.median(lch(lab(lo))[0])), float(np.median(lch(lab(hi))[0]))
        glyph_is_lo = abs(hiL - ground_L) <= abs(loL - ground_L)
        glyph, ground = (lo, hi) if glyph_is_lo else (hi, lo)
        gmask = (lo_m if glyph_is_lo else ~lo_m).reshape(box2d.shape[:2])
        gl, bg = lab(glyph), np.median(ground, 0)
        dist = np.linalg.norm(gl - lab(bg), axis=1)
        fg = np.median(glyph[dist >= np.percentile(dist, 70)], 0)
        body = gl[dist >= 0.5 * np.median(dist)]
        bC = np.hypot(body[:, 1], body[:, 2])
        bH = np.degrees(np.arctan2(body[:, 2], body[:, 1])) % 360
        mixed = bool((bC < 0.04).mean() >= 0.25 and (bC >= 0.08).mean() >= 0.25)
        if not mixed and (bC >= 0.08).mean() >= 0.4:
            hv = bH[bC >= 0.08]
            hist, _ = np.histogram(hv, bins=12, range=(0, 360))
            order = np.argsort(hist)[::-1]
            mixed = bool(hist[order[1]] >= 0.25 * len(hv) and hue_dist(order[0] * 30, order[1] * 30) >= 60)
        profile = gmask.mean(axis=0 if rotated else 1)
        rows_on = np.nonzero(profile >= 0.02)[0]
        extent = (rows_on[-1] - rows_on[0] + 1) if len(rows_on) else thick
        text = b["text"]
        caps = text.upper() == text and any(ch.isalpha() for ch in text)
        font = extent / (0.72 if caps or not re.search(r"[gjpqy]", text) else 0.97)
        px = font / scale if scale else None
        size = ("large" if px >= 24 else "small") if px else ("large" if font / Hh >= 0.034 else "small")
        lc = apca(fg, bg)
        lo_floor, pref = floors_for(route, size, px)
        verdict = "mixed" if mixed else "fail" if abs(lc) < lo_floor else "weak" if abs(lc) < pref else "ok"
        rows.append({"text": text[:60], "size": size, "font_px_est": round(px if px else font, 1), "Lc": lc,
                     "wcag": wcag(fg, bg), "text_hex": rgb_hex(fg), "bg_hex": rgb_hex(bg), "busy_bg": float(np.std(Lr)) > 0.08,
                     "rotated": rotated, "floor": lo_floor, "verdict": verdict})
    return rows


def pair_rows(colours):
    rows = []
    for i, a in enumerate(colours):
        for b in colours[i + 1:]:
            ra, rb = parse_colour(a["hex"]), parse_colour(b["hex"])
            both = a["C"] >= 0.04 and b["C"] >= 0.04
            rows.append({"a": a["hex"], "b": b["hex"], "a_name": a.get("role") or a["name"], "b_name": b.get("role") or b["name"],
                         "hue_gap": round(float(hue_dist(a["H"], b["H"])), 0) if both else None,
                         "dL": round(abs(a["L"] - b["L"]), 3),
                         "chroma_ratio": round(min(a["C"], b["C"]) / max(a["C"], b["C"], 1e-3), 2),
                         "vividness": [a["vividness"], b["vividness"]],
                         "dE": round(de(ra, rb), 3),
                         "dE_deutan": round(de(simulate(ra, "deuteranopia"), simulate(rb, "deuteranopia")), 3),
                         "Lc_a_on_b": apca(ra, rb), "Lc_b_on_a": apca(rb, ra)})
    return rows


def hue_families(colours, min_c=0.04):
    hs = sorted(((c["H"], c) for c in colours if c["C"] >= min_c), key=lambda t: t[0])
    if not hs:
        return []
    groups = [[hs[0][1]]]
    for (h0, _), (h1, c) in zip(hs, hs[1:]):
        if h1 - h0 < 30:
            groups[-1].append(c)
        else:
            groups.append([c])
    if len(groups) > 1 and hs[0][0] + 360 - hs[-1][0] < 30:
        groups[0] = groups.pop() + groups[0]
    return groups


def accent_band(route, L):
    """60/30/10: the accent is about a tenth. Light accents (L >= 0.85) carry the same weight on less area."""
    lo, hi = ROUTES[route]["accent"]
    if L >= 0.85:
        return (max(0, lo - 3), hi - 4)
    if L <= 0.5 and route != "app":
        return (lo + 2, hi + 4)
    return (lo, hi)


def in_accent(c, accent):
    return c.get("kind") == "accent" or bool(accent and accent["C"] >= 0.04 and c["C"] >= 0.5 * accent["C"]
                                             and hue_dist(c["H"], accent["H"]) < 22)


def area_split(palette, accent):
    """The palette as 60/30/10 families: the accent family (accent roles, plus every colour of the accent's hue at half
    its chroma or more), other hues in 30-degree families (C >= 0.025, split into light and dark when a family spans
    more than 0.35 in L), and neutrals as light or dark. Shares normalised to 100, largest first."""
    acc = [c for c in palette if in_accent(c, accent)]
    rest = [c for c in palette if not in_accent(c, accent)]
    groups = []

    def add(label, members, is_acc=False):
        if members:
            top = max(members, key=lambda c: c.get("share") or 0)
            groups.append({"name": label or top["name"], "hex": top["hex"], "share": sum(c.get("share") or 0 for c in members), "accent": is_acc})

    for fam in hue_families(rest, NEUTRAL_C):
        Ls = [c["L"] for c in fam]
        if max(Ls) - min(Ls) > 0.35:
            add(None, [c for c in fam if c["L"] >= 0.6])
            add(None, [c for c in fam if c["L"] < 0.6])
        else:
            add(None, fam)
    add("light neutrals", [c for c in rest if c["C"] < NEUTRAL_C and c["L"] >= 0.6])
    add("dark neutrals", [c for c in rest if c["C"] < NEUTRAL_C and c["L"] < 0.6])
    if acc:
        add("accent: " + (accent or acc[0])["name"], acc, True)
    total = sum(g["share"] for g in groups) or 1
    for g in groups:
        g["share"] = round(100 * g["share"] / total, 1)
    return sorted(groups, key=lambda g: -g["share"])


def split_flags(split):
    f = []
    base = [g for g in split if not g["accent"]]
    if len(base) >= 2 and base[0]["share"] < 45:
        f.append(f"60/30/10: nothing dominates: the largest families are {base[0]['name']} {base[0]['share']:.0f}% and "
                 f"{base[1]['name']} {base[1]['share']:.0f}% (one should hold about 60%)")
    elif len(base) >= 2 and base[1]["share"] >= 0.8 * base[0]["share"] and base[1]["share"] >= 25:
        f.append(f"60/30/10: {base[0]['name']} {base[0]['share']:.0f}% and {base[1]['name']} {base[1]['share']:.0f}% are near equal: let one lead")
    return f


def neutral_temperature(colours, min_share=1.0):
    """Every grey, cream and off-black leans the same way: all a little warm or all a little cool."""
    warm, cool = [], []
    for c in colours:
        if 0.006 <= c["C"] < NEUTRAL_C + 0.005 and 0.15 <= c["L"] <= 0.985 and (c.get("share") or min_share) >= min_share:
            if 20 <= c["H"] < 110:
                warm.append(c)
            elif 180 <= c["H"] < 300:
                cool.append(c)
    if warm and cool:
        return [f"neutral temperature: warm-leaning {', '.join(c['hex'] for c in warm[:3])} and cool-leaning "
                f"{', '.join(c['hex'] for c in cool[:3])} neutrals mixed: pick one temperature for every grey, cream and off-black"]
    return []


def peer_flags(colours):
    peers = [c for c in colours if c.get("kind") == "peer"]
    if len(peers) < 2:
        return []
    Ls, Cs = [c["L"] for c in peers], [c["C"] for c in peers]
    if max(Ls) - min(Ls) > 0.04 or max(Cs) - min(Cs) > 0.04:
        return [f"peers: L {min(Ls):.2f}-{max(Ls):.2f}, C {min(Cs):.2f}-{max(Cs):.2f}: peers share one L and one C, "
                "or the brightest looks most important"]
    return []


def flags_for(colours, route, accent=None, value=None, split=None, temp_split=None, pool=None):
    """Hints for the critique, not verdicts. `colours` are the main colours (kind: accent/status/content/text/surface/
    light/peer/other); `pool` is everything measured, for finding the accent's echoes."""
    f = []
    designed = [c for c in colours if c.get("kind") not in ("status", "content")]
    pool = pool or colours
    if route != "app":
        Ls = [c["L"] for c in designed]
        if len(Ls) >= 2 and max(Ls) - min(Ls) < 0.3:
            f.append(f"value: the main colours span only {max(Ls) - min(Ls):.2f} in lightness (strong palettes span 0.3+)")
        if value and value["range"] < 0.35:
            f.append(f"value: 90% of the frame sits within {value['range']:.2f} of lightness, so it reads flat in greyscale")
    near = 0.02 if route == "app" else 0.035
    for i, a in enumerate(colours):
        for b in colours[i + 1:]:
            ra, rb = parse_colour(a["hex"]), parse_colour(b["hex"])
            d0 = de(ra, rb)
            if a.get("kind") not in ("status", "content") and b.get("kind") not in ("status", "content"):
                if min(a["C"], b["C"]) >= 0.08 and min(a["vividness"], b["vividness"]) >= 0.6 and \
                        hue_dist(a["H"], b["H"]) >= 90 and abs(a["L"] - b["L"]) < 0.1:
                    f.append(f"vibration: {a['hex']} and {b['hex']} are {hue_dist(a['H'], b['H']):.0f} deg apart, both vivid for their hue, "
                             f"{abs(a['L'] - b['L']):.2f} apart in lightness (matters where they touch or one is text on the other)")
                if d0 < near:
                    f.append(f"near-duplicate: {a['hex']} and {b['hex']} differ by dE {d0:.3f}: one token, or a deliberate step")
            if d0 >= 0.12 and de(simulate(ra, "deuteranopia"), simulate(rb, "deuteranopia")) < 0.06:
                f.append(f"colour-blind: {a['hex']} and {b['hex']} look alike to deuteranopes: separate them by lightness or add a shape cue")
    fams = hue_families(designed)
    limit = ROUTES[route]["families"]
    if len(fams) > limit:
        names = ", ".join(max(g, key=lambda c: c["C"])["name"] for g in fams)
        f.append(f"hue families: {len(fams)} ({names}); the {route} route holds {limit}" + (" plus status colours" if route != "graphic" else ""))
    acc_members = [c for c in designed if in_accent(c, accent)] if accent else []
    regulars = sorted((c for c in designed if c["C"] >= 0.04 and c not in acc_members), key=lambda c: -c["C"])
    if accent and accent["C"] >= 0.04:
        level = lambda c: "quiet" if c <= 0.08 else "medium" if c <= 0.14 else "loud"
        reg = f"regular colours C {regulars[-1]['C']:.2f}-{regulars[0]['C']:.2f} ({level(regulars[0]['C'])})" if regulars else "regular colours neutral"
        others = [c for c in regulars if hue_dist(c["H"], accent["H"]) >= 35]
        if route == "app":
            f.append(f"chroma: primary {accent['hex']} C {accent['C']:.2f}; {reg}")
        elif others:
            ratio = accent["C"] / max(others[0]["C"], 1e-3)
            verdict = "pop (a deliberate outlier)" if ratio >= 1.8 else "harmony (a shared band)" if ratio < 1.5 else "between pop and harmony: commit to one"
            f.append(f"chroma: accent {accent['hex']} is {ratio:.2f}x the strongest other hue {others[0]['hex']}: {verdict}; {reg}")
        else:
            f.append(f"chroma: one hue family ({accent['name']}) plus neutrals; {reg}")
    elif regulars:
        f.append(f"chroma: no accent; colours C {regulars[-1]['C']:.2f}-{regulars[0]['C']:.2f}")
    if accent and route != "app" and accent["C"] >= 0.04:
        echoes = [c for c in pool if c["hex"] != accent["hex"] and c["C"] >= 0.03 and hue_dist(c["H"], accent["H"]) <= 35]
        if not echoes:
            f.append(f"orphan accent: nothing else within 35 deg of the accent's hue {accent['H']:.0f}: it has no echo")
    acc_share = next((g["share"] for g in (split or []) if g["accent"]), None)
    if accent and acc_share is not None:
        lo, hi = accent_band(route, accent["L"])
        if not lo <= acc_share <= hi:
            f.append(f"accent area: the accent family is {acc_share:.0f}% (60/30/10 puts an accent at this lightness at {lo}-{hi}%"
                     + ("; a graphic's accent may reach about 30% when it is the subject's own colour" if route == "graphic" else "") + ")")
    if temp_split:
        warm, cool = temp_split.get("warm", 0), temp_split.get("cool", 0)
        if warm and cool and 35 <= 100 * warm / (warm + cool) <= 65:
            f.append(f"temperature: warm {warm}% and cool {cool}% of the coloured area (neutral fields not counted): neither leads")
    return f


def measure_dom(dom, route):
    texts = []
    for t in dom.get("texts", []):
        fg, bg = parse_colour(t["text"]), parse_colour(t["bg"])
        large = t["size"] >= 24 or (t["size"] >= 18.66 and t.get("weight", 400) >= 700)
        lo_floor, pref = floors_for(route, "large" if large else "small", t["size"])
        if t.get("gradient"):
            lcs = [apca(parse_colour(g), bg) for g in t["gradient"]]
            lc = min(lcs, key=abs)
            verdict = "fail" if abs(lc) < lo_floor else "weak" if abs(lc) < pref else "ok"
        elif t.get("overImage"):
            lc, verdict = None, "check pixels"
        else:
            lc = apca(fg, bg)
            verdict = "fail" if abs(lc) < lo_floor else "weak" if abs(lc) < pref else "ok"
        texts.append({**t, "Lc": lc, "wcag": None if lc is None else wcag(fg, bg), "size_class": "large" if large else "small",
                      "floor": lo_floor, "verdict": verdict})
    rank = {"fail": 0, "weak": 1, "check pixels": 2, "ok": 3}
    texts.sort(key=lambda r: (rank[r["verdict"]], abs(r["Lc"] or 0)))
    controls = []
    for c in dom.get("controls", []):
        parent = parse_colour(c["parent"])
        lcs = [(abs(apca(parse_colour(c[k]), parent)), k) for k in ("fill", "border") if c.get(k)]
        lcs += [(abs(apca(parse_colour(x), parent)), "part") for x in c.get("parts", [])]
        if lcs:
            best, by = max(lcs)
            controls.append({**c, "Lc": round(best, 1), "by": by, "verdict": "fail" if best < 30 else "ok"})
    paints = []
    for p in dom.get("paints", []):
        hexv = p["color"].split("/")[0]
        paints.append({**describe(parse_colour(hexv)), "alpha": p["color"].split("/")[1] if "/" in p["color"] else "1",
                       "uses": p["uses"], "count": sum(p["uses"].values())})
    glows = [p for p in paints if "shadow" in p["uses"] and p["C"] >= 0.06 and float(p["alpha"]) >= 0.05]
    greys = sorted((p for p in paints if p["C"] < 0.02 and p["alpha"] == "1"), key=lambda p: p["L"])
    close_greys = [(a["hex"], b["hex"]) for a, b in zip(greys, greys[1:]) if b["L"] - a["L"] < 0.03]
    fams = hue_families([p for p in paints if p["C"] >= 0.06 and "shadow" not in p["uses"]])
    return {"viewport": dom.get("viewport"), "url": dom.get("url"), "root": dom.get("root"), "texts": texts[:60],
            "controls": sorted(controls, key=lambda c: c["Lc"])[:30], "glows": glows,
            "areas": dom.get("areas", [])[:12], "paints": sorted(paints, key=lambda p: -p["count"])[:40],
            "distinct_greys": len(greys), "greys_within_0.03_L": close_greys, "hue_families": len(fams)}


# ---------------------------------------------------------------- drawing
def font(size):
    for p in ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()


def wrap(text, width=100):
    lines, line = [], ""
    for word in text.split():
        if line and len(line) + len(word) + 1 > width:
            lines.append(line)
            line = "   " + word
        else:
            line = f"{line} {word}" if line else word
    return lines + [line]


def draw_wheel(d, cx, cy, R, colours, rings=()):
    for h in range(0, 360, 3):
        rgb = lch_rgb(0.72, float(ceiling(0.72, h)) * 0.85, h)
        a0, a1 = np.radians(h), np.radians(h + 3)
        pts = [(cx + R * np.cos(a0), cy - R * np.sin(a0)), (cx + (R + 14) * np.cos(a0), cy - (R + 14) * np.sin(a0)),
               (cx + (R + 14) * np.cos(a1), cy - (R + 14) * np.sin(a1)), (cx + R * np.cos(a1), cy - R * np.sin(a1))]
        d.polygon(pts, fill=rgb_hex(rgb))
    for frac in (0.25, 0.5, 0.75, 1.0):
        r = R * frac
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline="#3a3a3a")
    for c in colours:
        r = R * min(c["C"] / 0.26, 1)
        x, y = cx + r * np.cos(np.radians(c["H"])), cy - r * np.sin(np.radians(c["H"]))
        s = 7 + 22 * np.sqrt(max(c.get("share") or 4, 0.5) / 100)
        d.ellipse([x - s, y - s, x + s, y + s], fill=c["hex"], outline="#FFFFFF", width=2)
    for c in rings:
        r = R * min(c["C"] / 0.26, 1)
        x, y = cx + r * np.cos(np.radians(c["H"])), cy - r * np.sin(np.radians(c["H"]))
        d.ellipse([x - 12, y - 12, x + 12, y + 12], outline=c["hex"], width=4)
        d.ellipse([x - 16, y - 16, x + 16, y + 16], outline="#FFFFFF", width=1)
    d.text((cx - R, cy + R + 22), "hue around, chroma outward (rings = vivid peaks)", fill="#9a9a9a", font=font(15))


def draw_lightness(d, x0, y0, wdt, colours):
    for i in range(wdt):
        d.line([(x0 + i, y0), (x0 + i, y0 + 18)], fill=rgb_hex(lch_rgb(i / (wdt - 1), 0, 0)))
    for c in colours:
        x = x0 + c["L"] * (wdt - 1)
        d.polygon([(x - 9, y0 + 34), (x + 9, y0 + 34), (x, y0 + 20)], fill=c["hex"], outline="#FFFFFF")
    d.text((x0, y0 + 40), "lightness (OKLCH L) 0 -> 1", fill="#9a9a9a", font=font(15))


def draw_flags(d, x, y, flags, width=100, most=16):
    d.text((x, y), "flags", fill="#FFFFFF", font=font(18))
    y += 30
    for fl in flags:
        for line in wrap("· " + fl, width):
            if most <= 0:
                return
            d.text((x, y), line, fill="#d0d0d0", font=font(15))
            y += 22
            most -= 1


def draw_split(d, x, y, wdt, split):
    total = sum(g["share"] for g in split) or 1
    for g in split:
        w = max(2, round(wdt * g["share"] / total))
        d.rectangle([x, y, x + w, y + 26], fill=g["hex"], outline="#FFFFFF" if g["accent"] else None, width=2)
        x += w
    d.text((x - wdt, y + 32), "60/30/10: " + " / ".join(f"{g['name']} {g['share']:.0f}%" for g in split), fill="#cccccc", font=font(15))


def thumb(rgb, w):
    img = Image.fromarray(np.clip(np.round(rgb), 0, 255).astype(np.uint8))
    return img.resize((w, max(1, round(w * img.height / img.width))), LANCZOS)


def board_measure(rgb, result, out_png):
    W, tw = 1600, 510
    orig = thumb(rgb, tw)
    L = lch(lab(np.asarray(orig, float).reshape(-1, 3)))[0]
    grey = from_linear(lab_to_linear(lab_from_lch(L, 0, 0))).reshape(orig.height, orig.width, 3)
    deut = simulate(np.asarray(orig, float), "deuteranopia")
    th = orig.height
    pal = result["palette"]
    rows = (len(pal) + 1) // 2
    H = 90 + th + 60 + 84 + rows * 24 + 16 + 80 + 70 + 560
    img = Image.new("RGB", (W, H), "#161616")
    d = ImageDraw.Draw(img)
    d.text((24, 22), f"{Path(result['image']).name}  ·  route: {result['route']}", fill="#FFFFFF", font=font(24))
    v = result["value"]
    d.text((24, 56), f"lightness p5 {v['p5']}  p50 {v['p50']}  p95 {v['p95']}  ·  dark {v['dark']}%  mid {v['mid']}%  light {v['light']}%",
           fill="#bbbbbb", font=font(17))
    o = orig.copy()
    od = ImageDraw.Draw(o)
    for i, s in enumerate(result["loud"]):
        x0, y0, x1, y1 = (s["bbox"][0] * tw, s["bbox"][1] * th, s["bbox"][2] * tw, s["bbox"][3] * th)
        od.rectangle([x0, y0, x1, y1], outline="#FFFFFF", width=2)
        od.text((x0 + 3, max(0, y0 - 18)), str(i + 1), fill="#FFFFFF", font=font(16))
    for k, (im, label) in enumerate([(o, "image · loud spots numbered"), (thumb(grey, tw), "value (greyscale by OKLCH L)"),
                                     (thumb(deut, tw), "deuteranopia")]):
        x = 24 + k * (tw + 23)
        img.paste(im, (x, 90))
        d.text((x, 90 + th + 8), label, fill="#9a9a9a", font=font(16))
    y = 90 + th + 60
    total = sum(c["share"] for c in pal) or 1
    x, bw = 24, W - 48
    for c in pal:
        w = max(2, round(bw * c["share"] / total))
        d.rectangle([x, y, x + w, y + 70], fill=c["hex"])
        x += w
    y += 84
    for i, c in enumerate(pal):
        cx, cy = 24 + (i % 2) * 780, y + (i // 2) * 24
        d.rectangle([cx, cy + 3, cx + 16, cy + 19], fill=c["hex"], outline="#555555")
        d.text((cx + 24, cy), f"{c['share']:>4}%  {c['hex']}  {c['oklch']}  {c['name']}", fill="#cccccc", font=font(15))
    y += rows * 24 + 16
    x = 24
    for p in result["vivid"]:
        d.rectangle([x, y, x + 54, y + 54], fill=p["hex"])
        d.text((x + 62, y + 4), f"{p['hex']} {p['name']}", fill="#FFFFFF", font=font(16))
        d.text((x + 62, y + 28), f"hue family {p['share']}% · vividness {p['peak_vividness']}", fill="#9a9a9a", font=font(15))
        x += 380
    y += 80
    draw_split(d, 24, y, W - 48, result["split"])
    y += 70
    draw_wheel(d, 300, y + 250, 210, pal, result["vivid"])
    draw_lightness(d, 640, y + 30, 900, pal + result["vivid"])
    draw_flags(d, 640, y + 110, result["flags"], width=95, most=18)
    img.save(out_png)


def board_palette(colours, flags, split, out_png):
    W, H = 1600, 1110
    img = Image.new("RGB", (W, H), "#161616")
    d = ImageDraw.Draw(img)
    shares = [c.get("share") for c in colours]
    total = sum(shares) if all(shares) else None
    x, bw = 24, W - 48
    for c in colours:
        w = max(3, round(bw * c["share"] / total)) if total else bw // len(colours)
        d.rectangle([x, 24, x + w, 164], fill=c["hex"])
        x += w
    for i, c in enumerate(colours):
        cx, cy = 24 + (i % 2) * 780, 180 + (i // 2) * 26
        d.rectangle([cx, cy + 3, cx + 18, cy + 21], fill=c["hex"], outline="#555555")
        label = f"{(c.get('role') or c['name'])}  {c['hex']}  {c['oklch']}  vivid {c['vividness']}" + (f"  {c['share']}%" if c.get("share") else "")
        d.text((cx + 26, cy), label, fill="#cccccc", font=font(16))
    y = 180 + ((len(colours) + 1) // 2) * 26 + 14
    x = 24
    for c in colours:
        w = bw // len(colours)
        d.rectangle([x, y, x + w, y + 44], fill=rgb_hex(simulate(parse_colour(c["hex"]), "deuteranopia")))
        x += w
    d.text((24, y + 50), "deuteranopia", fill="#9a9a9a", font=font(15))
    y += 80
    if split:
        draw_split(d, 24, y, W - 48, split)
        y += 64
    draw_wheel(d, 300, y + 250, 210, colours)
    draw_lightness(d, 640, y + 10, 900, colours)
    draw_flags(d, 640, y + 90, flags, width=95, most=22)
    img.save(out_png)


# ---------------------------------------------------------------- commands
def summarise(res):
    lines = [f"route {res['route']}"]
    if res.get("value"):
        v = res["value"]
        lines.append(f"value  p5 {v['p5']}  p50 {v['p50']}  p95 {v['p95']}  range {v['range']}  dark/mid/light {v['dark']}/{v['mid']}/{v['light']}%")
    for c in res.get("palette", []):
        lines.append(f"  {c['share']:>5}%  {c['hex']}  {c['oklch']:<26} vivid {c['vividness']:<4} {c['temp']:<7} {c['name']}")
    if res.get("split"):
        lines.append("60/30/10 split: " + " / ".join(f"{g['name']} {g['share']:.0f}%" for g in res["split"]))
    if res.get("vivid"):
        lines.append("vivid peaks (share = the whole hue family): " + "; ".join(f"{p['hex']} {p['name']} {p['share']}% (vivid {p['peak_vividness']})" for p in res["vivid"]))
    if res.get("accent"):
        a = res["accent"]
        lines.append(f"accent{' (guessed: the most chromatic hue peak; pass --accent if wrong)' if a.get('guessed') else ''}: "
                     f"{a['hex']} {a['name']} {a['oklch']}")
    if res.get("temperature"):
        t = res["temperature"]
        lines.append(f"temperature (coloured pixels only, content included): warm {t['warm']}%  cool {t['cool']}%  mid {t['mid']}%  · coloured pixels {t['coloured']}% of frame")
    if res.get("loud"):
        lines.append("loud spots: " + "; ".join(f"#{i + 1} {s['name']} {s['hex']} at {s['bbox']} ({s['weight']}% of loudness)" for i, s in enumerate(res["loud"])))
    if res.get("focus"):
        fo = res["focus"]
        lines.append(f"focus {fo['box']}: rank {fo['rank']} for loudness, {fo['weight_vs_loudest']}% of the loudest spot's weight; "
                     f"peak {fo['peak_loudness']} against the frame's {fo['loudest_peak']}")
        for t in fo.get("text") or []:
            lines.append(f"  focus text {t['verdict']:<5} Lc {t['Lc']:>6}  ~{t['font_px_est']}px  {t['text_hex']} on {t['bg_hex']}  '{t['text']}'")
    for t in (res.get("text") or [])[:18]:
        lines.append(f"  text {t['verdict']:<5} Lc {t['Lc']:>6}  {t['size']:<5} ~{t['font_px_est']}px  {t['text_hex']} on {t['bg_hex']}"
                     f"{' (busy)' if t['busy_bg'] else ''}{' (rotated)' if t['rotated'] else ''}  '{t['text']}'")
    if res.get("text_note"):
        lines.append(f"  ({res['text_note']})")
    if res.get("dom"):
        dm = res["dom"]
        for t in dm["texts"][:18]:
            lc = "    —" if t["Lc"] is None else f"{t['Lc']:>6}"
            on = "an image/gradient" if t.get("overImage") and not t.get("gradient") else t["bg"]
            ink = ("gradient " + ">".join(t["gradient"])) if t.get("gradient") else t["text"]
            lines.append(f"  dom text {t['verdict']:<12} Lc {lc}  {t['size']}px/{t.get('weight')} {ink} on {on} x{t['count']}  '{t['sample'][:40]}'")
        for c in dm["controls"][:10]:
            lines.append(f"  dom control {c['verdict']:<4} Lc {c['Lc']:>5} ({c['by']} on {c['parent']})  {c['tag']} '{c.get('sample', '')[:30]}'")
        lines.append(f"  dom: {dm['distinct_greys']} distinct greys, {len(dm['greys_within_0.03_L'])} pairs within 0.03 L, {dm['hue_families']} hue families"
                     + (f" (scoped to {dm['root']})" if dm.get("root") else "") + "; emoji and images are invisible to the DOM")
    lines += [f"flag: {f}" for f in res.get("flags", [])]
    if res.get("board"):
        lines.append(f"board: {res['board']}")
    return "\n".join(lines)


def cmd_measure(a):
    route = a.route
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    res = {"route": route, "flags": []}
    stem = Path(a.image or a.dom).stem
    dom = json.loads(Path(a.dom).read_text()) if a.dom else None
    if a.image:
        full = load(a.image)
        text_src = a.image
        crop = a.crop
        if not crop and dom and dom.get("rootBox"):
            crop = ",".join(str(v) for v in dom["rootBox"])
            print(f"(cropping to the DOM root's box {crop}; pass --crop to override)")
        if crop:
            Hf, Wf = full.shape[:2]
            x0, y0, x1, y1 = parse_box(crop, Wf, Hf)
            full = full[y0:y1, x0:x1]
            stem += f"-crop-{x0}-{y0}-{x1}-{y1}"
            text_src = out / f"{stem}.png"
            Image.fromarray(np.round(full).astype(np.uint8)).save(text_src)
        small = shrink(full, 400)
        res["image"] = str(a.image)
        res["size"] = [full.shape[1], full.shape[0]]
        res["palette"] = palette_of(small)
        res["vivid"] = vivid_peaks(small)
        L, C, Hh = lch(lab(small.reshape(-1, 3)))
        p5, p50, p95 = (round(float(v), 2) for v in np.percentile(L, [5, 50, 95]))
        res["value"] = {"p5": p5, "p50": p50, "p95": p95, "range": round(p95 - p5, 2),
                        "dark": round(float((L < 0.35).mean() * 100)), "mid": round(float(((L >= 0.35) & (L <= 0.75)).mean() * 100)),
                        "light": round(float((L > 0.75).mean() * 100))}
        col = C >= 0.04
        warm = col & ((Hh < 110) | (Hh >= 350))
        cool = col & (Hh >= 150) & (Hh < 300)
        n = max(int(col.sum()), 1)
        res["temperature"] = {"warm": round(100 * int(warm.sum()) / n), "cool": round(100 * int(cool.sum()) / n),
                              "mid": round(100 * int((col & ~warm & ~cool).sum()) / n), "coloured": round(float(col.mean() * 100))}
        if a.accent:
            accent = {**describe(parse_colour(a.accent)), "kind": "accent"}
        else:
            candidates = [p for p in res["vivid"] if 0.5 <= p["share"] <= 45]
            accent = max(candidates, key=lambda p: p["C"] * (0.6 + 0.4 * p["peak_vividness"]), default=None)
            if accent:
                accent = {**accent, "guessed": True, "kind": "accent"}
        res["accent"] = accent
        main = [c for c in res["palette"] if c["share"] >= 3]
        if accent and all(de(parse_colour(accent["hex"]), parse_colour(c["hex"])) >= 0.06 for c in main):
            main = main + [accent]
        res["pairs"] = pair_rows(main)
        loud, spots, total = loud_spots(full)
        res["loud"] = loud
        boxes = None if a.no_text else read_text(text_src)
        res["text"] = text_contrast(full, boxes, route, a.scale) if boxes else None
        res["text_note"] = ("text not read (--no-text)" if a.no_text else "Vision unavailable: check text by eye and with `contrast`"
                            if boxes is None else "pixel estimates, can be off by 15 Lc either way (30 below 1x); Vision misses some small "
                            "labels and all emoji: confirm with `contrast`, re-read small labels with --focus")
        if a.focus:
            res["focus"] = focus_report(full, a.focus, spots, total)
            Hf, Wf = full.shape[:2]
            fx0, fy0, fx1, fy1 = parse_box(a.focus, Wf, Hf)
            pad = max(4, int(0.15 * (fy1 - fy0)))
            fx0, fy0, fx1, fy1 = max(0, fx0 - pad), max(0, fy0 - pad), min(Wf, fx1 + pad), min(Hf, fy1 + pad)
            fimg = Image.fromarray(np.round(full[fy0:fy1, fx0:fx1]).astype(np.uint8))
            fimg = fimg.resize((fimg.width * 3, fimg.height * 3), LANCZOS)
            fpath = out / f"{stem}-focus.png"
            fimg.save(fpath)
            fboxes = read_text(fpath)
            res["focus"]["text"] = text_contrast(np.asarray(fimg, float), fboxes, route, (a.scale or 1) * 3) if fboxes else None
        res["split"] = area_split(res["palette"], accent)
        res["flags"] = split_flags(res["split"]) + flags_for(main, route, accent, res["value"], res["split"], res["temperature"],
                                                             pool=res["palette"] + res["vivid"]) + neutral_temperature(res["palette"])
        if accent and route != "app" and accent["C"] >= 0.04:
            fam = [c for c in res["palette"] if c["hex"] != accent["hex"] and c["C"] >= 0.03 and hue_dist(c["H"], accent["H"]) <= 35]
            if fam:
                e = max(fam, key=lambda c: c["C"])
                r = accent["C"] / max(e["C"], 1e-3)
                if r >= 2.5:
                    res["flags"].append(f"material: the accent is {r:.1f}x as vivid as its own hue family on the page ({e['hex']} {e['name']}): "
                                        "fine if it is light, neon or ink; out of place if it claims a natural material")
        for t in res["text"] or []:
            if t["verdict"] == "fail":
                res["flags"].append(f"text: '{t['text'][:30]}' Lc {t['Lc']} ({t['text_hex']} on {t['bg_hex']}) is under the {t['floor']} floor for {t['size']} text (estimate)")
            elif t["verdict"] == "mixed":
                res["flags"].append(f"text: '{t['text'][:30]}' mixes colours in one line: check each colour with `contrast`")
        if accent:
            field = res["palette"][0]
            for kind in ("deuteranopia", "protanopia"):
                d0 = de(parse_colour(accent["hex"]), parse_colour(field["hex"]))
                d1 = de(simulate(parse_colour(accent["hex"]), kind), simulate(parse_colour(field["hex"]), kind))
                if d0 >= 0.12 and d1 < 0.07:
                    res["flags"].append(f"colour-blind: the accent nearly vanishes into the field for {kind} (dE {d1:.3f})")
    if dom:
        res["dom"] = measure_dom(dom, route)
        for t in res["dom"]["texts"]:
            if t["verdict"] == "fail":
                res["flags"].append(f"dom text: '{t['sample'][:30]}' Lc {t['Lc']} ({t['size']}px) is under the {t['floor']} floor")
        for c in res["dom"]["controls"]:
            if c["verdict"] == "fail":
                res["flags"].append(f"dom control: {c['tag']} '{c.get('sample', '')[:24]}' boundary Lc {c['Lc']} on {c['parent']} is under the 30 floor for controls")
        for g in res["dom"]["glows"][:4]:
            res["flags"].append(f"dom coloured shadow: {g['hex']} ({g['name']}, alpha {g['alpha']}) used as a shadow is a glow: shadows should darken")
        res["flags"] += [f"dom {x}" for x in neutral_temperature(res["dom"]["paints"], 0)]
        if res["dom"]["greys_within_0.03_L"]:
            res["flags"].append(f"dom: {len(res['dom']['greys_within_0.03_L'])} pairs of greys within 0.03 L of each other: likely one token each")
    if a.image:
        res["board"] = str(out / f"{stem}.board.png")
        board_measure(full, res, res["board"])
    (out / f"{stem}.json").write_text(json.dumps(res, indent=1, default=float))
    print(summarise(res))
    print(f"json: {out / (stem + '.json')}")


def cmd_sample(a):
    rgb = load(a.image)
    H, W = rgb.shape[:2]
    for s in a.boxes:
        x0, y0, x1, y1 = parse_box(s, W, H)
        px = rgb[y0:y1, x0:x1].reshape(-1, 3)
        d = describe(np.round(np.median(px, 0)))
        L = lch(lab(px))[0]
        print(f"{s}: {d['hex']}  {d['oklch']}  {d['name']}  · L p10 {np.percentile(L, 10):.2f} p90 {np.percentile(L, 90):.2f} · {len(px)} px")


def parse_token(tok):
    role = share = None
    m = re.match(r"^([A-Za-z][\w-]*):(.+)$", tok)
    if m and not m.group(1).lower().startswith("oklch"):
        role, tok = m.group(1), m.group(2)
    if "@" in tok:
        tok, share = tok.rsplit("@", 1)
    c = {**describe(parse_colour(tok)), "role": role, "kind": kind_of(role)}
    if share:
        c["share"] = float(share)
    return c


def palette_report(colours, route, label=None, all_pairs=False):
    accs = [c for c in colours if c["kind"] == "accent"]
    accent, guessed = (max(accs, key=lambda c: c["C"]) if accs else None), False
    if accent is None:
        cand = [c for c in colours if c["kind"] in ("other", "light") and c["C"] >= 0.04 and (c.get("share") or 100) >= 1]
        accent = max(cand, key=lambda c: c["C"] * (0.6 + 0.4 * c["vividness"]), default=None)
        guessed = accent is not None
    temp_split = None
    chromatic = [c for c in colours if c["C"] >= 0.04 and c["kind"] not in ("status", "content")]
    if chromatic:
        tot = sum(c.get("share") or 1 for c in chromatic)
        temp_split = {t: round(100 * sum(c.get("share") or 1 for c in chromatic if c["temp"] == t) / tot) for t in ("warm", "cool")}
    pairs = pair_rows(colours)
    shares_given = all(c.get("share") for c in colours)
    split = area_split([c for c in colours if c["kind"] not in ("status", "peer")], accent) if shares_given else None
    flags = (split_flags(split) if split else []) + flags_for(colours, route, accent, split=split, temp_split=temp_split) \
        + neutral_temperature(colours) + peer_flags(colours)
    if label:
        print(label)
    unknown = sorted({c["role"] for c in colours if c["role"] and c["kind"] == "other"})
    if unknown:
        print(f"(roles treated as plain colours: {', '.join(unknown)})")
    for c in colours:
        print(f"{(c['role'] or ''):<10} {c['hex']}  {c['oklch']:<26} vivid {c['vividness']:<4} {c['temp']:<7} {c['name']}"
              + (f"  {c['share']}%" if c.get("share") else ""))
    if split:
        print("60/30/10 split: " + " / ".join(f"{g['name']} {g['share']:.0f}%" for g in split))
    if accent:
        print(f"accent{' (guessed; name it with an accent:/primary: role)' if guessed else ''}: {accent['hex']} {accent['name']}")
    flagged = " ".join(flags)
    shown = 0
    for p in pairs:
        if all_pairs or (accent and accent["hex"] in (p["a"], p["b"])) or (p["a"] in flagged and p["b"] in flagged):
            print(f"  {p['a']} / {p['b']}: hue gap {p['hue_gap']}  dL {p['dL']}  chroma ratio {p['chroma_ratio']}  dE {p['dE']} "
                  f"(deutan {p['dE_deutan']})  Lc {p['a']} on {p['b']} {p['Lc_a_on_b']}, reverse {p['Lc_b_on_a']}")
            shown += 1
    if shown < len(pairs):
        print(f"  ({len(pairs) - shown} more pairs in the JSON; --all-pairs prints them)")
    for t in (c for c in colours if c["kind"] == "text"):
        for s in (c for c in colours if c["kind"] == "surface"):
            print(f"  contrast {t['role']} {t['hex']} on {s['role']} {s['hex']}: Lc {apca(parse_colour(t['hex']), parse_colour(s['hex']))}"
                  f"  WCAG {wcag(parse_colour(t['hex']), parse_colour(s['hex']))}:1")
    for f in flags:
        print("flag:", f)
    return pairs, flags, split


def cmd_palette(a):
    colours = [parse_token(t) for t in a.colours]
    nm = a.name or "palette-" + hashlib.sha1(" ".join(a.colours).encode()).hexdigest()[:6]
    pairs, flags, split = palette_report(colours, a.route, all_pairs=a.all_pairs)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    png = out / f"{nm}.board.png"
    board_palette(colours, flags, split, png)
    result = {"colours": colours, "pairs": pairs, "flags": flags, "split": split}
    if a.grade:
        g, amt = a.grade.rsplit("@", 1)
        graded = []
        for c in colours:
            Lg, Cg, Hg = (float(v) for v in lch(grade_lab(lab(parse_colour(c["hex"])), parse_colour(g), float(amt))))
            graded.append({**describe(np.round(lch_rgb(Lg, Cg, Hg))), "role": c["role"], "kind": c["kind"], "share": c.get("share")})
        print()
        gpairs, gflags, gsplit = palette_report(graded, a.route, f"graded {float(amt):.0%} toward {g}:", a.all_pairs)
        board_palette(graded, gflags, gsplit, out / f"{nm}-graded.board.png")
        print(f"graded board: {out / (nm + '-graded.board.png')}")
        result["graded"] = {"colours": graded, "pairs": gpairs, "flags": gflags, "split": gsplit}
    print(f"board: {png}")
    (out / f"{nm}.json").write_text(json.dumps(result, indent=1, default=float))


def cmd_contrast(a):
    t, b = parse_colour(a.text), parse_colour(a.surface)
    dt, db = describe(t), describe(b)
    print(f"text {dt['hex']} {dt['oklch']} on surface {db['hex']} {db['oklch']}")
    print(f"APCA Lc {apca(t, b)}   WCAG {wcag(t, b)}:1")
    fmt = lambda f: "not reachable" if not f else (f"{f['hex']} {f['oklch']}  (Lc {f['Lc']}, L {f['moved_L']:+})"
                                                   + ("  " + "; ".join(f["notes"]) if f["notes"] else ""))
    now = abs(apca(t, b))
    for target in (30, 45, 60, 75, 90):
        if now >= target:
            print(f"  |Lc| {target}:  already passes")
            continue
        print(f"  |Lc| {target}:  text -> {fmt(reach(target, b, t, True))}")
        print(f"            surface -> {fmt(reach(target, t, b, False))}")


def split_map(m):
    depth = 0
    for i, ch in enumerate(m):
        depth += (ch == "(") - (ch == ")")
        if ch == ":" and depth == 0:
            return m[:i], m[i + 1:]
    raise ValueError(f"--map needs FROM:TO, got {m!r}")


def cmd_recolor(a):
    rgb = load(a.image)
    Hh, Ww = rgb.shape[:2]
    flat = rgb.reshape(-1, 3)
    X = lab(flat)
    L, C, H = lch(X)
    region = np.ones(len(X))
    if a.region:
        x0, y0, x1, y1 = parse_box(a.region, Ww, Hh)
        feather = max(2, int(0.01 * min(Ww, Hh)))
        yy, xx = np.mgrid[0:Hh, 0:Ww]
        inside = np.minimum(np.minimum(xx - x0, x1 - 1 - xx), np.minimum(yy - y0, y1 - 1 - yy))
        region = np.clip(inside / feather + 1, 0, 1).reshape(-1)
    out, best, seen = X.copy(), np.zeros(len(X)), []
    for m in a.map:
        s_txt, t_txt = split_map(m)
        src, dst = parse_colour(s_txt), parse_colour(t_txt)
        s, t = lab(src), lab(dst)
        sL, sC, sH = lch_of(src)
        tL, tC, tH = lch_of(dst)
        hue_mode = sC >= 0.03 and sC / max(float(ceiling(sL, sH)), 0.02) >= 0.3
        if hue_mode:
            w = np.clip(1 - hue_dist(H, sH) / a.range, 0, 1) * np.clip((C - 0.25 * sC) / (0.25 * sC), 0, 1)
            dh = 0.0 if tC < 0.02 else ((tH - sH + 180) % 360) - 180
            moved = lab_from_lch(L + w * (tL - sL), C * (1 + w * (tC / max(sC, 1e-3) - 1)), H + w * dh)
        else:
            w = np.clip(1 - np.linalg.norm(X - s, axis=1) / a.radius, 0, 1)
            moved = X + w[:, None] * (t - s)
        if a.lwin:
            lw = np.clip(1 - np.abs(L - sL) / a.lwin, 0, 1)
            moved = X + (moved - X) * np.where(w > 0, lw, 0)[:, None]
            w = w * lw
        w = w * region
        for o_txt, o_hue, o_lab, o_H, o_t in seen:
            same_target = np.linalg.norm(o_t - t) < 0.02
            if not same_target and ((hue_mode and o_hue and hue_dist(sH, o_H) < a.range) or
                                    (not hue_mode and not o_hue and np.linalg.norm(s - o_lab) < a.radius)):
                print(f"warning: {s_txt} and {o_txt} overlap at this --range/--radius, so each pixel follows the closer one. "
                      "Narrow --range/--radius, add --lwin, or use --region.")
        seen.append((s_txt, hue_mode, s, sH, t))
        take = w > best
        out[take] = X[take] + (moved[take] - X[take]) * region[take][:, None]
        best = np.maximum(best, w)
        print(f"{s_txt} -> {t_txt}: {'hue' if hue_mode else 'nearby-colour'} mode, {100 * (w > 0.05).mean():.1f}% of pixels move")
    if a.grade:
        g, amt = a.grade.rsplit("@", 1)
        out = grade_lab(out, parse_colour(g), region * float(amt))
        best = np.maximum(best, region * (float(amt) > 0))
    changed = best > 0
    res = flat.copy()
    if changed.any():
        oL, oC, oH = lch(out[changed])
        oC = np.minimum(oC, ceiling(oL, oH))
        res[changed] = from_linear(lab_to_linear(lab_from_lch(oL, oC, oH)))
    res = np.clip(np.round(res), 0, 255).astype(np.uint8).reshape(rgb.shape)
    dst = Path(a.out or Path(a.image).with_name(Path(a.image).stem + ".recolor.png"))
    Image.fromarray(res).save(dst)
    before = load(a.before) if a.before else rgb
    strip = Image.new("RGB", (Ww * 2 + 20, Hh), "#161616")
    strip.paste(Image.fromarray(before.astype(np.uint8)).resize((Ww, Hh)), (0, 0))
    strip.paste(Image.fromarray(res), (Ww + 20, 0))
    sdst = dst.with_name(dst.stem + ".before-after.jpg")
    strip.thumbnail((2400, 2400))
    strip.save(sdst, quality=90)
    print(f"recoloured: {dst}\nbefore/after: {sdst}")


def chrome():
    for p in ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium",
              shutil.which("google-chrome"), shutil.which("chromium"), shutil.which("chromium-browser"), shutil.which("chrome")):
        if p and Path(p).exists():
            return p
    return None


def cmd_shot(a):
    exe = chrome()
    if not exe:
        raise ValueError("no Chrome or Chromium found: screenshot the page with your browser tool instead")
    src = Path(a.page).resolve()
    w, h = (int(v) for v in a.size.lower().split("x"))
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    page = src.read_text()
    extra = ""
    if w < 500:
        extra += f"<style>html,body{{width:{w}px!important;max-width:{w}px!important;overflow-x:hidden!important}}</style>"
    if a.dom:
        js = (HERE / "dom_colors.js").read_text()
        extra += ("<script>window.addEventListener('load',()=>setTimeout(()=>{"
                  + (f"window.COLOR_ROOT={json.dumps(a.root)};" if a.root else "") + "const r=(0,eval)(" + json.dumps(js) + ");"
                  "const p=document.createElement('pre');p.id='__color_dom';p.textContent=r;p.style.display='none';"
                  "document.body.appendChild(p);},400));</script>")
    tmp = src.with_name(f".{src.stem}.shot.html")
    tmp.write_text(page.replace("</body>", extra + "</body>") if "</body>" in page else page + extra)
    try:
        base = [exe, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={w},{h}", "--virtual-time-budget=4000"]
        subprocess.run(base + [f"--force-device-scale-factor={a.scale}", f"--screenshot={out.resolve()}", tmp.as_uri()],
                       check=True, capture_output=True, timeout=180)
        print(f"shot: {out} ({w}x{h} CSS px at scale {a.scale})")
        if a.dom:
            dump = subprocess.run(base + ["--dump-dom", tmp.as_uri()], capture_output=True, text=True, timeout=180).stdout
            m = re.search(r'<pre id="__color_dom"[^>]*>(.*?)</pre>', dump, re.S)
            if not m:
                raise ValueError("dom_colors.js produced nothing (the page may need longer to load)")
            dom = json.loads(htmllib.unescape(m.group(1)))
            dpath = out.with_suffix(".dom.json")
            dpath.write_text(json.dumps(dom))
            print(f"dom: {dpath}")
    finally:
        tmp.unlink(missing_ok=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("measure")
    m.add_argument("image", nargs="?")
    m.add_argument("--route", choices=ROUTES, default="graphic")
    m.add_argument("--accent", help="the accent colour, when the guess is wrong")
    m.add_argument("--focus", help="BOX of where the eye should land (a CTA, the subject): its loudness rank and label contrast")
    m.add_argument("--dom")
    m.add_argument("--out", default=str(DEFAULT_OUT))
    m.add_argument("--no-text", action="store_true")
    m.add_argument("--crop", help="BOX to measure, e.g. the hero viewport 0,0,1,0.6")
    m.add_argument("--scale", type=float, help="image pixels per CSS px/pt: 1 for a 1x capture or a design export, 2 retina, 3 most iPhones, 0.5 a half-size capture")
    s = sub.add_parser("sample")
    s.add_argument("image")
    s.add_argument("boxes", nargs="+", help="x0,y0,x1,y1 as fractions (0-1) or pixels")
    p = sub.add_parser("palette")
    p.add_argument("colours", nargs="+", help="[role:]colour[@share], each its own quoted argument, e.g. 'field:#013230@55' 'accent:oklch(0.7 0.19 43)@20'")
    p.add_argument("--route", choices=ROUTES, default="graphic")
    p.add_argument("--out", default=str(DEFAULT_OUT))
    p.add_argument("--name", help="file name for the board and JSON (default: palette-<hash of the colours>)")
    p.add_argument("--grade", help="colour@amount: also report the palette graded toward one colour, e.g. #FF6A1F@0.08")
    p.add_argument("--all-pairs", action="store_true", help="print every pair, not just the accent's and the flagged ones")
    c = sub.add_parser("contrast")
    c.add_argument("text")
    c.add_argument("surface")
    r = sub.add_parser("recolor")
    r.add_argument("image")
    r.add_argument("--map", action="append", default=[], help="FROM:TO colours, repeatable")
    r.add_argument("--grade", help="colour@amount, e.g. #FF8A3D@0.08: tint everything toward one colour, lightness kept")
    r.add_argument("--region", help="BOX: change only this box, feathered edge")
    r.add_argument("--range", type=float, default=30, help="hue degrees a coloured source reaches (default 30; widen it when anti-aliased edges keep a fringe)")
    r.add_argument("--radius", type=float, default=0.06, help="OKLab distance a near-neutral source reaches (default 0.06)")
    r.add_argument("--lwin", type=float, help="only move pixels within this lightness of the source (0.15-0.35; check soft edges)")
    r.add_argument("--before", help="image for the left half of the before/after strip (the original, when chaining runs)")
    r.add_argument("--out")
    sh = sub.add_parser("shot")
    sh.add_argument("page", help="a local .html file")
    sh.add_argument("--size", default="1440x900", help="CSS px viewport, e.g. 1440x900 or 390x844")
    sh.add_argument("--scale", type=float, default=2, help="device pixel ratio of the PNG")
    sh.add_argument("--dom", action="store_true", help="also save dom_colors.js output as <out>.dom.json")
    sh.add_argument("--root", help="CSS selector to scope --dom to one component (sets window.COLOR_ROOT)")
    sh.add_argument("--out", required=True)
    a = ap.parse_args()
    if a.cmd == "measure" and not (a.image or a.dom):
        ap.error("measure needs an image, --dom, or both")
    if a.cmd == "recolor" and not (a.map or a.grade):
        ap.error("recolor needs --map or --grade")
    try:
        {"measure": cmd_measure, "sample": cmd_sample, "palette": cmd_palette, "contrast": cmd_contrast,
         "recolor": cmd_recolor, "shot": cmd_shot}[a.cmd](a)
    except ValueError as e:
        sys.exit(f"error: {e}")


if __name__ == "__main__":
    main()
