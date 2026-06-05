/**
 * Sync maps-manifest.json + zones/*.json from valorant-api.com.
 *
 * Includes every standard Spike map (tacticalDescription contains "Sites")
 * with a valid world→minimap transform (non-zero multipliers).
 *
 * As of 2026: Ascent, Bind, Haven, Split, Icebox, Breeze, Fracture, Pearl,
 * Lotus, Sunset, Abyss, Corrode (12 maps).
 */
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const spatialDir = join(root, 'resources/spatial')
const manifestPath = join(spatialDir, 'maps-manifest.json')
const zonesDir = join(spatialDir, 'zones')
const coveragePath = join(spatialDir, 'coverage.json')

/** All standard competitive maps released through Corrode (v11.00, 2025). */
const STANDARD_MAPS_2026 = [
  'Ascent', 'Bind', 'Haven', 'Split', 'Icebox', 'Breeze', 'Fracture',
  'Pearl', 'Lotus', 'Sunset', 'Abyss', 'Corrode',
]

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

function isStandardMap(map) {
  const tactical = map.tacticalDescription || ''
  if (!/sites/i.test(tactical)) return false
  const t = map.xMultiplier ?? 0
  return t !== 0
}

async function fetchAllMaps() {
  const res = await fetch('https://valorant-api.com/v1/maps')
  if (!res.ok) throw new Error(`valorant-api maps HTTP ${res.status}`)
  const json = await res.json()
  return json.data || []
}

async function fetchMap(uuid) {
  const res = await fetch(`https://valorant-api.com/v1/maps/${uuid}`)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${uuid}`)
  const json = await res.json()
  return json.data
}

function manifestEntry(map) {
  return {
    displayName: map.displayName,
    uuid: map.uuid,
    xMultiplier: map.xMultiplier,
    yMultiplier: map.yMultiplier,
    xScalarToAdd: map.xScalarToAdd,
    yScalarToAdd: map.yScalarToAdd,
    displayIcon: map.displayIcon,
    tacticalDescription: map.tacticalDescription,
    mapUrl: map.mapUrl,
  }
}

mkdirSync(zonesDir, { recursive: true })

console.log('Fetching valorant-api.com/v1/maps ...')
const allMaps = await fetchAllMaps()
const standard = allMaps.filter(isStandardMap).sort((a, b) => a.displayName.localeCompare(b.displayName))

console.log(`Found ${standard.length} standard maps with transforms:`)
standard.forEach((m) => console.log(`  - ${m.displayName} (${(m.callouts || []).length} callouts in list endpoint)`))

writeFileSync(manifestPath, `${JSON.stringify(standard.map(manifestEntry), null, 2)}\n`)
console.log(`Wrote ${manifestPath}`)

const results = []

for (const entry of standard) {
  const key = normalizeKey(entry.displayName)
  console.log(`Generating zones: ${entry.displayName} (${key})...`)

  let mapData
  try {
    mapData = await fetchMap(entry.uuid)
  } catch (e) {
    console.warn(`  Skip: ${e.message}`)
    results.push({ map: entry.displayName, key, callouts: 0, error: e.message })
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
    generatedAt: new Date().toISOString().slice(0, 10),
    callouts: callouts.sort((a, b) => a.name.localeCompare(b.name)),
  }

  writeFileSync(join(zonesDir, `${key}.json`), `${JSON.stringify(pack, null, 2)}\n`)
  console.log(`  → ${callouts.length} callouts`)
  results.push({ map: entry.displayName, key, callouts: callouts.length })
}

// Remove stale zone files for maps no longer in manifest
const validKeys = new Set(standard.map((m) => normalizeKey(m.displayName)))
for (const file of readdirSync(zonesDir)) {
  if (!file.endsWith('.json')) continue
  const key = file.replace('.json', '')
  if (!validKeys.has(key)) {
    console.warn(`Removing stale zone file: ${file}`)
    unlinkSync(join(zonesDir, file))
  }
}

const apiNames = standard.map((m) => m.displayName).sort()
const missingFromApi = STANDARD_MAPS_2026.filter((n) => !apiNames.includes(n))
const extraInApi = apiNames.filter((n) => !STANDARD_MAPS_2026.includes(n))

const coverage = {
  updatedAt: new Date().toISOString(),
  standardMapsThrough2026: STANDARD_MAPS_2026,
  mapsInManifest: apiNames,
  complete: missingFromApi.length === 0,
  missingFromValorantApi: missingFromApi,
  newMapsNotInChecklist: extraInApi,
  zones: results,
  excluded: {
    note: 'TDM/Skirmish maps omitted — valorant-api has zero world transforms for HURM/TDM minimaps',
    tdmWithCalloutsNoTransform: allMaps
      .filter((m) => (m.callouts || []).length > 0 && !isStandardMap(m))
      .map((m) => m.displayName),
  },
}

writeFileSync(coveragePath, `${JSON.stringify(coverage, null, 2)}\n`)

if (missingFromApi.length) {
  console.error('\n⚠️  MISSING standard maps from valorant-api:', missingFromApi.join(', '))
  process.exit(1)
}

console.log('\n✅ All 12 standard competitive maps (through 2026) have manifest + zones.')
console.log(`Coverage report: ${coveragePath}`)
if (extraInApi.length) {
  console.log('New maps in API (update STANDARD_MAPS_2026):', extraInApi.join(', '))
}
