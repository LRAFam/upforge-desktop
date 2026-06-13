/**
 * Sync maps-manifest.json + zones/*.json from valorant-api.com.
 *
 * Includes every standard Spike map (tacticalDescription contains "Sites")
 * with a valid world→minimap transform (non-zero multipliers).
 *
 * As of 2026: Ascent, Bind, Haven, Split, Icebox, Breeze, Fracture, Pearl,
 * Lotus, Sunset, Abyss, Corrode (12 maps).
 */
import {
  writeFileSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  cpSync,
} from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { PNG } from 'pngjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const spatialDir = join(root, 'resources/spatial')
const manifestPath = join(spatialDir, 'maps-manifest.json')
const zonesDir = join(spatialDir, 'zones')
const coveragePath = join(spatialDir, 'coverage.json')
const frontendRoot = join(root, '..', 'upforge-frontend')
const frontendManifestPath = join(frontendRoot, 'app/data/spatial/maps-manifest.json')
const frontendZonesDir = join(frontendRoot, 'public/spatial/zones')

/** All standard competitive maps released through Corrode (v11.00, 2025). */
const STANDARD_MAPS_2026 = [
  'Ascent', 'Bind', 'Haven', 'Split', 'Icebox', 'Breeze', 'Fracture',
  'Pearl', 'Lotus', 'Sunset', 'Abyss', 'Corrode',
]

function normalizeKey(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '')
}

function rawTransform(t, wx, wy) {
  return {
    x: wx * t.xMultiplier + t.xScalarToAdd,
    y: wy * t.yMultiplier + t.yScalarToAdd,
  }
}

function computeViewport(rawPoints) {
  const xs = rawPoints.map((p) => p.x)
  const ys = rawPoints.map((p) => p.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

function transformToDisplayNorm(t, raw) {
  const vp = t.viewport
  if (!vp) {
    return {
      x: Math.max(0, Math.min(1, raw.x)),
      y: Math.max(0, Math.min(1, raw.y)),
    }
  }
  const pad = 0
  const minX = vp.minX - pad
  const maxX = vp.maxX + pad
  const minY = vp.minY - pad
  const maxY = vp.maxY + pad
  return {
    x: Math.max(0, Math.min(1, (raw.x - minX) / (maxX - minX))),
    y: Math.max(0, Math.min(1, (raw.y - minY) / (maxY - minY))),
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

const TRANSFORM_ORDER = [
  'identity',
  'flipY',
  'flipX',
  'flipXY',
  'swap',
  'swapFlipY',
  'swapFlipX',
  'swapFlipXY',
]

const DISPLAY_TRANSFORMS = Object.fromEntries(
  TRANSFORM_ORDER.map((name) => {
    const fns = {
      identity: (x, y) => [x, y],
      flipX: (x, y) => [1 - x, y],
      flipY: (x, y) => [x, 1 - y],
      flipXY: (x, y) => [1 - x, 1 - y],
      swap: (x, y) => [y, x],
      swapFlipX: (x, y) => [1 - y, x],
      swapFlipY: (x, y) => [y, 1 - x],
      swapFlipXY: (x, y) => [1 - y, 1 - x],
    }
    return [name, fns[name]]
  }),
)

function round4(v) {
  return Math.round(v * 10000) / 10000
}

function manifestEntry(map, viewport, calibration) {
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
    viewport,
    ...(calibration?.displayBounds
      ? { displayBounds: calibration.displayBounds }
      : {}),
    ...(calibration?.displayTransform && calibration.displayTransform !== 'identity'
      ? { displayTransform: calibration.displayTransform }
      : {}),
    ...(calibration?.displayRotation ? { displayRotation: calibration.displayRotation } : {}),
  }
}

async function fetchDisplayIconPng(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`displayIcon HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return PNG.sync.read(buf)
}

function pngPlayableBounds(png) {
  const { width, height, data } = png
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
      if (lum > 45 && lum < 210) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX <= minX || maxY <= minY) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  }
  return {
    minX: minX / width,
    minY: minY / height,
    maxX: maxX / width,
    maxY: maxY / height,
  }
}

function pngLuminance(png, nx, ny) {
  const x = Math.max(0, Math.min(png.width - 1, Math.floor(nx * png.width)))
  const y = Math.max(0, Math.min(png.height - 1, Math.floor(ny * png.height)))
  const i = (y * png.width + x) * 4
  return (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3
}

function applyDisplayBounds(bounds, x, y) {
  return [
    bounds.minX + x * (bounds.maxX - bounds.minX),
    bounds.minY + y * (bounds.maxY - bounds.minY),
  ]
}

function siteSeparationBonus(callouts, project) {
  const siteNames = ['A Site', 'B Site', 'C Site']
  const positions = siteNames
    .map((name) => {
      const c = callouts.find((x) => x.name === name)
      if (!c) return null
      const [x, y] = project(c.x, c.y)
      return { x, y }
    })
    .filter(Boolean)
  if (positions.length < 2) return 0
  let maxDist = 0
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const dx = positions[i].x - positions[j].x
      const dy = positions[i].y - positions[j].y
      maxDist = Math.max(maxDist, Math.hypot(dx, dy))
    }
  }
  return maxDist * 500
}

/** Reward A/B separation on whichever axis the transform actually uses. */
function siteAxisBonus(callouts, project) {
  const hasC = callouts.some((c) => c.name === 'C Site')
  if (hasC) return 0
  const a = callouts.find((c) => c.name === 'A Site')
  const b = callouts.find((c) => c.name === 'B Site')
  if (!a || !b) return 0
  const [ax, ay] = project(a.x, a.y)
  const [bx, by] = project(b.x, b.y)
  const sep = Math.max(Math.abs(ax - bx), Math.abs(ay - by))
  return sep > 0.2 ? sep * 500 : 0
}

/** Maps whose displayicon is intentionally vertical (A top / B bottom) — do not rotate. */
const VERTICAL_SITE_MAPS = new Set(['split', 'fracture'])

/**
 * When swap-based transforms align callouts vertically on the PNG but the map
 * presents as left/right in-game (e.g. Ascent), rotate the rendered minimap 90° CW.
 */
function inferDisplayRotation(mapKey, transformName, callouts, project) {
  if (!transformName.includes('swap')) return 0
  if (VERTICAL_SITE_MAPS.has(mapKey)) return 0
  if (callouts.some((c) => c.name === 'C Site')) return 0
  const a = callouts.find((c) => c.name === 'A Site')
  const b = callouts.find((c) => c.name === 'B Site')
  if (!a || !b) return 0
  const [ax, ay] = project(a.x, a.y)
  const [bx, by] = project(b.x, b.y)
  const dx = Math.abs(ax - bx)
  const dy = Math.abs(ay - by)
  if (dy > dx * 1.25 && dy > 0.25) return 90
  return 0
}

function scoreCalloutsOnPng(png, callouts, bounds, transformName, useInset) {
  const fn = DISPLAY_TRANSFORMS[transformName]
  const project = (x, y) => {
    if (useInset) [x, y] = applyDisplayBounds(bounds, x, y)
    return fn(x, y)
  }
  let onMap = 0
  let sitesOnMap = 0
  let siteCount = 0
  for (const c of callouts) {
    const [x, y] = project(c.x, c.y)
    const lum = pngLuminance(png, x, y)
    if (lum >= 50) onMap++
    if (c.name === 'A Site' || c.name === 'B Site' || c.name === 'C Site') {
      siteCount++
      if (lum >= 50) sitesOnMap++
    }
  }
  const separation = siteSeparationBonus(callouts, project)
  const axis = siteAxisBonus(callouts, project)
  const simplicity = TRANSFORM_ORDER.indexOf(transformName)
  const score =
    sitesOnMap * 10000 + onMap * 100 + separation + axis - simplicity
  return { onMap, sitesOnMap, siteCount, score }
}

async function calibrateDisplayTransform(displayIcon, callouts, mapKey) {
  const png = await fetchDisplayIconPng(displayIcon)
  const bounds = pngPlayableBounds(png)
  let best = {
    score: -1,
    displayTransform: 'identity',
    useInset: false,
    onMap: 0,
    sitesOnMap: 0,
    siteCount: 0,
  }

  for (const useInset of [false, true]) {
    for (const transformName of TRANSFORM_ORDER) {
      const result = scoreCalloutsOnPng(png, callouts, bounds, transformName, useInset)
      if (result.sitesOnMap < result.siteCount) continue
      if (result.score > best.score) {
        best = { ...result, displayTransform: transformName, useInset }
      }
    }
  }

  const fn = DISPLAY_TRANSFORMS[best.displayTransform]
  const project = (x, y) => {
    if (best.useInset) [x, y] = applyDisplayBounds(bounds, x, y)
    return fn(x, y)
  }

  const displayRotation = inferDisplayRotation(mapKey, best.displayTransform, callouts, project)

  return {
    displayTransform: best.displayTransform,
    displayBounds: best.useInset
      ? {
          minX: round4(bounds.minX),
          minY: round4(bounds.minY),
          maxX: round4(bounds.maxX),
          maxY: round4(bounds.maxY),
        }
      : null,
    displayRotation,
    calibrationScore: {
      onMap: best.onMap,
      total: callouts.length,
      sitesOnMap: best.sitesOnMap,
      siteCount: best.siteCount,
      useInset: best.useInset,
    },
  }
}

mkdirSync(zonesDir, { recursive: true })

console.log('Fetching valorant-api.com/v1/maps ...')
const allMaps = await fetchAllMaps()
const standard = allMaps.filter(isStandardMap).sort((a, b) => a.displayName.localeCompare(b.displayName))

console.log(`Found ${standard.length} standard maps with transforms:`)
standard.forEach((m) => console.log(`  - ${m.displayName} (${(m.callouts || []).length} callouts in list endpoint)`))

const manifestRows = []
const pendingCalibration = []
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
  const rawPoints = raw
    .map((c) => c.location)
    .filter((loc) => loc && loc.x != null && loc.y != null)
    .map((loc) => rawTransform(t, loc.x, loc.y))
  const viewport = rawPoints.length ? computeViewport(rawPoints) : null
  if (viewport) t.viewport = viewport

  const seen = new Set()
  const callouts = []

  for (const c of raw) {
    const loc = c.location
    if (!loc || loc.x == null || loc.y == null) continue
    const name = calloutLabel(c)
    if (seen.has(name)) continue
    seen.add(name)
    const norm = transformToDisplayNorm(t, rawTransform(t, loc.x, loc.y))
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
  pendingCalibration.push({
    entry,
    viewport,
    callouts,
    key,
  })
  results.push({ map: entry.displayName, key, callouts: callouts.length })
}

console.log('\nCalibrating displayicon alignment (PNG inset + symmetry)...')
for (const item of pendingCalibration) {
  const { entry, viewport, callouts, key } = item
  try {
    const calibration = await calibrateDisplayTransform(entry.displayIcon, callouts, key)
    manifestRows.push(manifestEntry(entry, viewport, calibration))
    const { onMap, total, sitesOnMap, siteCount, useInset } = calibration.calibrationScore
    const rotSuffix = calibration.displayRotation ? ` + rot${calibration.displayRotation}` : ''
    console.log(
      `  ${entry.displayName}: ${calibration.displayTransform}${useInset ? ' + inset' : ''}${rotSuffix} — ${onMap}/${total} callouts, ${sitesOnMap}/${siteCount} sites`,
    )
    const zoneResult = results.find((r) => r.key === key)
    if (zoneResult) {
      zoneResult.displayTransform = calibration.displayTransform
      zoneResult.displayInset = useInset
      zoneResult.calibration = calibration.calibrationScore
    }
  } catch (e) {
    console.warn(`  ${entry.displayName}: calibration failed (${e.message}), using identity`)
    manifestRows.push(manifestEntry(entry, viewport, null))
  }
}

writeFileSync(manifestPath, `${JSON.stringify(manifestRows, null, 2)}\n`)
console.log(`Wrote ${manifestPath}`)

if (frontendRoot && frontendManifestPath) {
  try {
    mkdirSync(join(frontendRoot, 'app/data/spatial'), { recursive: true })
    mkdirSync(frontendZonesDir, { recursive: true })
    cpSync(manifestPath, frontendManifestPath)
    cpSync(zonesDir, frontendZonesDir, { recursive: true })
    console.log(`Synced manifest + zones → upforge-frontend`)
  } catch (e) {
    console.warn(`Could not sync to frontend: ${e.message}`)
  }
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
