"""Chroma-key magenta (#FF00FF) background -> transparent PNG.
Hand-drawn cel art w/ black ink edges. Keys magenta, erodes 2px, hard despill.
Usage: python diecut.py in.jpg out.png [erode_px]
"""
import sys
import numpy as np
from PIL import Image, ImageFilter


def diecut(src, dst, erode_px=2):
    im = Image.open(src).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]

    # magenta-ness score: high R, high B, low G
    mg = np.clip(((r + b) / 2 - g) / 120.0, 0, 1)          # 1 = very magenta
    bright = np.clip((np.minimum(r, b) - 90) / 120.0, 0, 1)
    keyscore = mg * bright                                  # 1 = background
    alpha = 1.0 - np.clip((keyscore - 0.25) / 0.35, 0, 1)   # 0 bg, 1 subject

    # erode subject alpha to eat the AA fringe ring
    if erode_px > 0:
        amask = Image.fromarray((alpha * 255).astype(np.uint8))
        amask = amask.filter(ImageFilter.MinFilter(erode_px * 2 + 1))
        amask = amask.filter(ImageFilter.GaussianBlur(0.8))
        alpha = np.asarray(amask).astype(np.float32) / 255.0

    # hard despill: any lingering magenta tint -> neutralise green
    out = a.copy()
    tint = (r > g + 18) & (b > g + 18)
    gg = (np.minimum(r, b) + np.maximum(r, b)) / 2.0
    out[..., 1] = np.where(tint, np.maximum(g, gg), g)
    # also darken residual bright-pink edge pixels
    edge = tint & (alpha > 0.02) & (alpha < 0.9)
    for c in range(3):
        out[..., c] = np.where(edge, out[..., c] * 0.6, out[..., c])

    rgba = np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(dst)
    print(f"{dst}: {rgba.shape[1]}x{rgba.shape[0]}, "
          f"{(alpha < 0.5).mean()*100:.1f}% transparent")


if __name__ == "__main__":
    ep = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    diecut(sys.argv[1], sys.argv[2], ep)
