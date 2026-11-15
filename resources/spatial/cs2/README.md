# CS2 spatial / heatmaps

Death position heatmaps from demo parsing. Radars: Dust II, Mirage, Inferno, Nuke, Overpass, Ancient, Anubis, Cache, Train, Vertigo, Office.

Callouts (Valve place names) and teammate facts come from the demo on every map; a radar only adds the position.

## Files

- `maps-manifest.json` — Valve overview constants (`pos_x`, `pos_y`, `scale`) per map
- `radars/*.png` — 1024×1024 radar images (run `npm run spatial:fetch-cs2-radars`)

## Adding a map

1. Add entry to `maps-manifest.json` (copy from `resource/overviews/<map>.txt` in the CS2 VPK; mirrored at github.com/SteamTracking/GameTracking-CS2 under `game/csgo/pak01_dir/resource/overviews/`)
2. Add `radars/<map>.png`
3. Register in `src/lib/cs2-maps.ts` (`RADAR_BY_KEY` import)
4. Optional: coarse A/B/Mid buckets in `electron/main/spatial/demo-enrich.ts`

## Transform

```
normX = (worldX - posX) / scale / 1024
normY = (posY - worldY) / scale / 1024
```

Same formula as CS Demo Manager and demoinfocs.
