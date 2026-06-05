# Spatial match data

Two-layer positioning for desktop VOD coaching:

1. **Transforms** (`maps-manifest.json`) — Riot world `(x,y)` → minimap `(0–1)` via [valorant-api.com](https://valorant-api.com/v1/maps) constants.
2. **Callouts** (`zones/<map>.json`) — radial anchors; nearest callout within `radius` wins.

## Adding / tuning callouts

Edit `zones/<map>.json`. Each callout has normalized `x`, `y` (0–1 on the displayicon minimap) and `radius`.

Calibrate by logging `norm` from a known death in dev tools, or plot on the minimap in Post-Game.

## Supported maps (zones)

All competitive maps in `maps-manifest.json` have `zones/<map>.json` generated from [valorant-api.com](https://valorant-api.com/v1/maps) official callout coordinates.

Regenerate after API updates:

```bash
node scripts/generate-spatial-zones.mjs
```

Then copy `zones/*.json` to `upforge-ai-service/resources/spatial/zones/`.

**Standard maps through 2026 (12/12):** Ascent, Abyss, Bind, Breeze, Corrode, Fracture, Haven, Icebox, Lotus, Pearl, Split, Sunset.

See `coverage.json` after running the sync script. TDM maps (District, Kasbah, Drift, Glitch, Piazza) are excluded — Riot/valorant-api do not publish world→minimap transforms for those modes.
