# Spatial match data

Two-layer positioning for desktop VOD coaching:

1. **Transforms** (`maps-manifest.json`) — Riot world `(x,y)` → internal minimap `(0–1)` via [valorant-api.com](https://valorant-api.com/v1/maps) constants + callout viewport.
2. **Display calibration** (same manifest) — per-map `displayBounds` (gray playable inset on the PNG) and optional `displayTransform` (symmetry). Applied at render time in `map-display-norm.ts`.
3. **Callouts** (`zones/<map>.json`) — radial anchors; nearest callout within `radius` wins.

## Calibrating heatmaps (dev workflow)

Interactive tuner — no more hand-editing JSON:

```bash
# One-time: paste bearer token in the UI (saved in localStorage)
npm run spatial:calibrate

# Pre-fill analysis + auto-load (token must already be saved)
npm run spatial:calibrate -- --analysis 12345 --map fracture
```

1. Load a real analysis (or paste `spatialSummary` JSON).
2. **VOD plays at the top** — pause on a death, check the dot on the minimap below.
3. Enable **Replay sync** so dots appear as the VOD plays.
4. Click an event chip to seek the VOD to that moment.
5. Enable **Deaths only** + **Death heat blobs** to match the product heatmap.
6. **Fit gray map** → tune rotation/transform → lower **coord scale** if dots are too far out.
7. **Save to manifest** → `npm run spatial:sync`

## Adding / tuning callouts

Edit `zones/<map>.json`. Each callout has normalized `x`, `y` (0–1 on the displayicon minimap) and `radius`.

Calibrate by logging `norm` from a known death in dev tools, or plot on the minimap in Post-Game.

## Supported maps (zones)

All competitive maps in `maps-manifest.json` have `zones/<map>.json` generated from [valorant-api.com](https://valorant-api.com/v1/maps) official callout coordinates.

Regenerate after API updates (also syncs to `upforge-frontend`):

```bash
npm run spatial:sync
```

Then `npm run spatial:sync` copies manifest, zones, plants, and benchmarks to `upforge-frontend` and `upforge-ai-service`.

**Standard maps through 2026 (13/13):** Ascent, Abyss, Bind, Breeze, Corrode, Fracture, Haven, Icebox, Lotus, Pearl, Split, Summit, Sunset.

See `coverage.json` after running the sync script. TDM maps (District, Kasbah, Drift, Glitch, Piazza) are excluded — Riot/valorant-api do not publish world→minimap transforms for those modes.
