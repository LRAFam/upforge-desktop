# CS2 spatial / heatmaps

Phase 1: death position heatmaps from demo parsing (Dust II + Mirage).

## Files

- `maps-manifest.json` — Valve overview constants (`pos_x`, `pos_y`, `scale`) per map
- `radars/*.png` — 1024×1024 radar images (run `npm run spatial:fetch-cs2-radars`)

## Adding a map

1. Add entry to `maps-manifest.json` (copy from `resource/overviews/<map>.txt` in CS2 VPK or demoinfocs metadata)
2. Add `radars/<map>.png`
3. Register in `src/lib/cs2-maps.ts` (`RADAR_BY_KEY` import)
4. Optional: coarse A/B/Mid buckets in `electron/main/spatial/demo-enrich.ts`

## Transform

```
normX = (worldX - posX) / scale / 1024
normY = (posY - worldY) / scale / 1024
```

Same formula as CS Demo Manager and demoinfocs.
