/**
 * Generate resources/spatial/zones/<map>.json from valorant-api.com map callouts.
 * World (x,y) → minimap norm using each map's xMultiplier/yMultiplier/scalars.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const manifestPath = join(root, 'resources/spatial/maps-manifest.json')
const zonesDir = join(root, 'resources/spatial/zones')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

function normalizeKey(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '')
}

function worldToNorm(t, wx, wy) {
  const x = wx * t.xMultiplier + t.xScalarToAdd
  const y = wy * t.yMultiplier + t.yScalarToAdd
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  }
}

function siteFromSuper(superName) {
  const s = (superName || '').trim()
  if (s === 'A' || s.startsWith('A ')) return 'A'
  if (s === 'B' || s.startsWith('B ')) return 'B'
  if (s === 'C' || s.startsWith('C ')) return 'C'
  if (/attacker/i.test(s)) return 'Spawn'
  if (/defender/i.test(s)) return 'Spawn'
  if (/mid/i.test(s)) return 'Mid'
  return 'Mid'
}

function calloutLabel(c) {
  const region = c.regionName || 'Unknown'
  const superR = c.superRegionName || ''
  const site = siteFromSuper(superR)
  if (site === 'A' || site === 'B' || site === 'C') {
    if (region === 'Site') return `${site} Site`
    return `${site} ${region}`
  }
  if (/attacker/i.test(superR)) return region === 'Spawn' ? 'Attacker Spawn' : `Attacker ${region}`
  if (/defender/i.test(superR)) return region === 'Spawn' ? 'Defender Spawn' : `Defender ${region}`
  return region
}

function radiusFor(region) {
  if (region === 'Site' || region === 'Spawn') return 0.09
  if (region === 'Main' || region === 'Long' || region === 'Short') return 0.085
  return 0.075
}

async function fetchMap(uuid) {
  const res = await fetch(`https://valorant-api.com/v1/maps/${uuid}`)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${uuid}`)
  const json = await res.json()
  return json.data
}

mkdirSync(zonesDir, { recursive: true })

for (const entry of manifest) {
  const key = normalizeKey(entry.displayName)
  console.log(`Generating ${entry.displayName} (${key})...`)

  let mapData
  try {
    mapData = await fetchMap(entry.uuid)
  } catch (e) {
    console.warn(`  Skip: ${e.message}`)
    continue
  }

  const t = {
    xMultiplier: mapData.xMultiplier ?? entry.xMultiplier,
    yMultiplier: mapData.yMultiplier ?? entry.yMultiplier,
    xScalarToAdd: mapData.xScalarToAdd ?? entry.xScalarToAdd,
    yScalarToAdd: mapData.yScalarToAdd ?? entry.yScalarToAdd,
  }

  const raw = mapData.callouts || []
  const seen = new Set()
  const callouts = []

  for (const c of raw) {
    const loc = c.location
    if (!loc || loc.x == null || loc.y == null) continue
    const name = calloutLabel(c)
    if (seen.has(name)) continue
    seen.add(name)
    const norm = worldToNorm(t, loc.x, loc.y)
    callouts.push({
      name,
      site: siteFromSuper(c.superRegionName),
      x: Math.round(norm.x * 10000) / 10000,
      y: Math.round(norm.y * 10000) / 10000,
      radius: radiusFor(c.regionName),
    })
  }

  const pack = {
    map: entry.displayName,
    source: 'valorant-api.com callouts',
    callouts: callouts.sort((a, b) => a.name.localeCompare(b.name)),
  }

  const outPath = join(zonesDir, `${key}.json`)
  writeFileSync(outPath, `${JSON.stringify(pack, null, 2)}\n`)
  console.log(`  Wrote ${callouts.length} callouts → ${outPath}`)
}

console.log('Done.')
