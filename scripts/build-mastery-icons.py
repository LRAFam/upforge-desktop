#!/usr/bin/env python3
"""Build 40 mastery rank icons (8 tiers × 5 sub-ranks) from tier base art."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
MASTERY_DIR = ROOT / "src/assets/ranks/mastery"
OUT_DIR = MASTERY_DIR / "levels"

TIER_SLUGS = [
    "unforged", "kindled", "tempered", "craftsman",
    "artisan", "ascended", "upforged", "legendary",
]

TIER_GLOW = [
    (156, 163, 175),
    (249, 115, 22),
    (59, 130, 246),
    (139, 92, 246),
    (236, 72, 153),
    (6, 182, 212),
    (239, 68, 68),
    (234, 179, 8),
]

STUDS = {
    "top": (0.5, 0.17),
    "bottom": (0.5, 0.83),
    "left": (0.17, 0.5),
    "right": (0.83, 0.5),
}

SUB_RANK_STUDS: dict[int, list[str]] = {
    1: [],
    2: ["bottom"],
    3: ["bottom", "left", "right"],
    4: ["top", "bottom", "left", "right"],
    5: ["top", "bottom", "left", "right"],
}


def load_square_rgba(path: Path, size: int) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    im.thumbnail((size, size), Image.Resampling.LANCZOS)
    square = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    square.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    return square


def draw_stud(canvas: Image.Image, color: tuple[int, int, int], intensity: float, keys: list[str]) -> None:
    size = canvas.width
    glow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow_layer)
    r = int(size * 0.028)
    glow_r = int(size * 0.075)
    for key in keys:
        nx, ny = STUDS[key]
        cx, cy = int(nx * size), int(ny * size)
        cr, cg, cb = color
        for gr, alpha in ((glow_r, int(90 * intensity)), (int(glow_r * 0.65), int(140 * intensity))):
            bbox = (cx - gr, cy - gr, cx + gr, cy + gr)
            draw.ellipse(bbox, fill=(cr, cg, cb, alpha))
        gem = (min(255, cr + 35), min(255, cg + 35), min(255, cb + 35), int(220 * min(1.0, intensity + 0.2)))
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=gem)
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=max(2, size // 180)))
    canvas.alpha_composite(glow_layer)


def draw_rim(canvas: Image.Image, color: tuple[int, int, int], intensity: float) -> None:
    size = canvas.width
    rim = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(rim)
    cr, cg, cb = color
    pad = int(size * 0.06)
    for w, alpha in ((int(size * 0.04), int(55 * intensity)), (int(size * 0.022), int(95 * intensity))):
        draw.ellipse(
            (pad, pad, size - pad, size - pad),
            outline=(cr, cg, cb, alpha),
            width=w,
        )
    rim = rim.filter(ImageFilter.GaussianBlur(radius=max(2, size // 200)))
    canvas.alpha_composite(rim)


def build_variant(base_path: Path, tier_index: int, sub_rank: int, out_path: Path) -> None:
    size = 512
    color = TIER_GLOW[tier_index]
    intensity = 0.45 + sub_rank * 0.12
    canvas = load_square_rgba(base_path, size)

    studs = SUB_RANK_STUDS[sub_rank]
    if studs:
        draw_stud(canvas, color, intensity, studs)

    if sub_rank == 5:
        draw_rim(canvas, color, 0.95)
        warm = Image.new("RGBA", (size, size), (*color, 18))
        canvas = Image.alpha_composite(canvas, Image.blend(
            Image.new("RGBA", (size, size), (0, 0, 0, 0)), warm, 0.35
        ))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path, "PNG")
    print(f"wrote {out_path.name}")


def main() -> None:
    for tier in range(8):
        slug = TIER_SLUGS[tier]
        num = str(tier + 1).zfill(2)
        base = MASTERY_DIR / f"mastery-tier-{num}-{slug}.png"
        if not base.exists():
            raise SystemExit(f"missing base art: {base}")
        for sub in range(1, 6):
            level = tier * 5 + sub
            out = OUT_DIR / f"mastery-level-{str(level).zfill(2)}.png"
            build_variant(base, tier, sub, out)


if __name__ == "__main__":
    main()
