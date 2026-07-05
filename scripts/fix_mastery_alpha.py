#!/usr/bin/env python3
"""Extract clean RGBA alpha from mastery tier art on solid black backgrounds."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MASTERY_DIR = ROOT / "src/assets/ranks/mastery"
TIER_GLOB = "mastery-tier-*.png"

# Pixels darker than this (0–1) become transparent; softness controls edge AA width.
BLACK_THRESHOLD = 0.035
BLACK_SOFTNESS = 0.09


def extract_rgba_from_black(
    im: Image.Image,
    *,
    threshold: float = BLACK_THRESHOLD,
    softness: float = BLACK_SOFTNESS,
) -> Image.Image:
    """Build a clean alpha channel from art composited on pure black."""
    rgb = np.array(im.convert("RGB"), dtype=np.float32) / 255.0
    strength = np.max(rgb, axis=2)
    span = max(softness, 1e-6)
    alpha = np.clip((strength - threshold) / span, 0.0, 1.0)

    # Un-premultiply black-matte contamination on edge pixels.
    a = alpha[..., np.newaxis]
    edge = (alpha > 0.02) & (alpha < 0.98)
    corrected = np.clip(rgb / np.maximum(a, 1e-3), 0.0, 1.0)
    rgb_out = np.where(edge[..., np.newaxis], corrected, rgb)

    out = np.dstack([np.clip(rgb_out, 0.0, 1.0), alpha])
    return Image.fromarray((out * 255.0).astype(np.uint8), "RGBA")


def repair_rgba_image(im: Image.Image) -> Image.Image:
    """Extract alpha from black-backed tier art (or flatten existing RGBA first)."""
    rgba = im.convert("RGBA")
    arr = np.array(rgba, dtype=np.float32) / 255.0
    flattened = Image.fromarray(
        (np.clip(arr[:, :, :3] * arr[:, :, 3:4], 0.0, 1.0) * 255.0).astype(np.uint8),
        "RGB",
    )
    return extract_rgba_from_black(flattened)


def repair_rgba(path: Path) -> Image.Image:
    return repair_rgba_image(Image.open(path))


def main() -> None:
    tier_files = sorted(MASTERY_DIR.glob(TIER_GLOB))
    if not tier_files:
        raise SystemExit(f"no tier art found in {MASTERY_DIR}")

    for path in tier_files:
        fixed = repair_rgba(path)
        fixed.save(path, "PNG")
        print(f"fixed {path.name}")


if __name__ == "__main__":
    main()
