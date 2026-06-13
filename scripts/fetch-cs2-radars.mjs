#!/usr/bin/env node
/**
 * Download CS2 radar PNGs (1024×1024) into resources/spatial/cs2/radars/.
 * Source: saul/gamevis overview images (Valve-derived radar art).
 *
 * Usage: npm run spatial:fetch-cs2-radars
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'resources', 'spatial', 'cs2', 'radars')

const MAPS = ['de_dust2', 'de_mirage', 'de_inferno', 'de_nuke', 'de_overpass', 'de_ancient', 'de_anubis']

const BASE = 'https://raw.githubusercontent.com/saul/gamevis/master/overviews/csgo'
const MURKY_RADAR = 'https://raw.githubusercontent.com/MurkyYT/cs2-map-icons/main/images/radars'

async function fetchMap(map) {
  const primary = `${BASE}/${map}.png`
  let res = await fetch(primary)
  if (res.ok) return Buffer.from(await res.arrayBuffer())

  const fallback = `${MURKY_RADAR}/${map}_radar_psd.png`
  res = await fetch(fallback)
  if (res.ok) return Buffer.from(await res.arrayBuffer())

  return null
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  for (const map of MAPS) {
    const buf = await fetchMap(map)
    if (!buf) {
      console.warn(`[skip] ${map} — not found on primary or fallback source`)
      continue
    }
    const out = join(outDir, `${map}.png`)
    writeFileSync(out, buf)
    console.log(`[ok] ${map} (${buf.length} bytes)`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
