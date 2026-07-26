# Canonical Valorant heatmap coordinates

Date: 2026-07-26

## Problem

Heatmaps needed constant per-map calibration. Community apps (e.g. Metabot) look locked to the minimap because they use the official valorant-api formula.

## Correct formula

```
u = gameY * xMultiplier + xScalarToAdd
v = gameX * yMultiplier + yScalarToAdd
pixelX = u * imageWidth
pixelY = v * imageHeight
```

Axes are swapped into the multiplier fields. Fixture: Fracture Bridge `(11473, -2897)` → `(0.3315, 0.2615)`.

## UpForge changes

1. Apply XY swap in desktop / frontend / AI / zone generator `worldToNorm`.
2. Drop viewport stretch (multipliers already land on full displayicon 0–1).
3. Treat stored norms as displayicon UV; crop to playable `displayBounds` at draw time only.
4. Clear legacy `displayTransform` hacks; keep playable inset bounds.
5. `npm run spatial:sync` regenerates zones/manifest and syncs FE + AI (calibrate-display is optional, not in default chain).

## Spike / bomb deaths

Riot attributes spike detonations as killer=victim (`damageType: Bomb`).

- Do **not** put them in `playerKills` (aces stay 5-kill, not 6).
- Keep them in `playerDeaths` / spatial events with `cause: 'bomb'`.
- UI: amber diamond + "Spike" badge; never "No trade" / untraded coaching.
- Heat density and site hotspots use combat deaths only.
- Legend/tooltips draw on the fixed canvas size (no DOM layout shift).

