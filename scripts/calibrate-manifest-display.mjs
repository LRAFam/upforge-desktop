#!/usr/bin/env node
/**
 * Batch-tune displayTransform + fine-tune fields in maps-manifest.json.
 * Scores callouts against gray playable pixels on the displayicon PNG
 * (same approach as generate-spatial-zones.mjs + map-display-norm.ts pipeline).
 *
 * Usage: node scripts/calibrate-manifest-display.mjs [--write]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(root, 'resources/spatial/maps-manifest.json')
const zonesDir = path.join(root, 'resources/spatial/zones')
const write = process.argv.includes('--write')

const TRANSFORM_TO = {
  identity: (p) => p,
  flipX: (p) => ({ x: 1 - p.x, y: p.y }),
  flipY: (p) => ({ x: p.x, y: 1 - p.y }),
  flipXY: (p) => ({ x: 1 - p.x, y: 1 - p.y }),
  swap: (p) => ({ x: p.y, y: p.x }),
  swapFlipX: (p) => ({ x: 1 - p.y, y: p.x }),
  swapFlipY: (p) => ({ x: p.y, y: 1 - p.x }),
  swapFlipXY: (p) => ({ x: 1 - p.y, y: 1 - p.x }),
}

const CANDIDATE_TRANSFORMS = [
  'swapFlipXY',
  'swapFlipY',
  'swapFlipX',
  'flipY',
  'flipX',
  'swap',
  'identity',
]

function mapKey(name) {
  return (name || '').trim().toLowerCase().replace(/\s+/g, '')
}

function round4(v) {
  return Math.round(v * 10000) / 10000
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

async function fetchPng(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return PNG.sync.read(Buffer.from(await res.arrayBuffer()))
}

function hasCrop(bounds) {
  return (
    bounds
    && bounds.maxX > bounds.minX
    && bounds.maxY > bounds.minY
    && (bounds.minX > 0.001 || bounds.minY > 0.001 || bounds.maxX < 0.999 || bounds.maxY < 0.999)
  )
}

/** Stored norm → full-PNG coords after fine-tune + bounds expand + symmetry. */
function toPngNorm(norm, bounds, transform, scale, ox, oy) {
  let p = { x: (norm.x - 0.5) * scale + 0.5 + ox, y: (norm.y - 0.5) * scale + 0.5 + oy }
  const tf = TRANSFORM_TO[transform] ?? TRANSFORM_TO.identity
  if (hasCrop(bounds)) {
    p = {
      x: bounds.minX + p.x * (bounds.maxX - bounds.minX),
      y: bounds.minY + p.y * (bounds.maxY - bounds.minY),
    }
    return tf(p)
  }
  return tf(p)
}

function siteSeparationBonus(callouts, project) {
  const siteNames = ['A Site', 'B Site', 'C Site']
  const positions = siteNames
    .map((name) => {
      const c = callouts.find((x) => x.name === name)
      if (!c) return null
      return project(c.x, c.y)
    })
    .filter(Boolean)
  if (positions.length < 2) return 0
  let maxDist = 0
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      maxDist = Math.max(
        maxDist,
        Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y),
      )
    }
  }
  return maxDist * 500
}

function scoreOnPng(png, callouts, bounds, transform, scale, ox, oy) {
  const project = (x, y) => {
    const p = toPngNorm({ x, y }, bounds, transform, scale, ox, oy)
    return [p.x, p.y]
  }
  let onMap = 0
  let sitesOnMap = 0
  let siteCount = 0
  for (const c of callouts) {
    const [x, y] = project(c.x, c.y)
    const lum = pngLuminance(png, x, y)
    if (lum >= 50 && lum < 210) onMap++
    if (c.name === 'A Site' || c.name === 'B Site' || c.name === 'C Site') {
      siteCount++
      if (lum >= 50 && lum < 210) sitesOnMap++
    }
  }
  const separation = siteSeparationBonus(callouts, project)
  const score = sitesOnMap * 10000 + onMap * 100 + separation
  return { onMap, sitesOnMap, siteCount, score, total: callouts.length }
}

function optimize(png, callouts, bounds, preferTransform, current) {
  const transforms = preferTransform
    ? [preferTransform, ...CANDIDATE_TRANSFORMS.filter((t) => t !== preferTransform)]
    : CANDIDATE_TRANSFORMS
  let best = {
    ...current,
    transform: current.transform,
    scale: current.scale,
    ox: current.ox,
    oy: current.oy,
  }
  for (const transform of transforms) {
    for (let scale = 0.68; scale <= 0.92; scale += 0.004) {
      for (let ox = -0.1; ox <= 0.12; ox += 0.004) {
        for (let oy = -0.1; oy <= 0.12; oy += 0.004) {
          const r = scoreOnPng(png, callouts, bounds, transform, scale, ox, oy)
          const sitePenalty = (r.siteCount - r.sitesOnMap) * 8000
          const totalScore = r.score - sitePenalty
          if (totalScore > best.score) {
            best = {
              ...r,
              score: totalScore,
              transform,
              scale: round4(scale),
              ox: round4(ox),
              oy: round4(oy),
            }
          }
        }
      }
    }
  }
  return best
}

function applyFineTuneFields(entry, best) {
  delete entry.displayRotation
  if (best.transform && best.transform !== 'identity') {
    entry.displayTransform = best.transform
  } else {
    delete entry.displayTransform
  }
  if (best.scale !== 1) entry.displayCoordScale = best.scale
  else delete entry.displayCoordScale
  if (best.ox !== 0) entry.displayOffsetX = best.ox
  else delete entry.displayOffsetX
  if (best.oy !== 0) entry.displayOffsetY = best.oy
  else delete entry.displayOffsetY
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const report = []

for (const entry of manifest) {
  const key = mapKey(entry.displayName)
  const zonePath = path.join(zonesDir, `${key}.json`)
  if (!fs.existsSync(zonePath)) {
    report.push({ map: entry.displayName, skipped: 'no zones' })
    continue
  }

  const callouts = JSON.parse(fs.readFileSync(zonePath, 'utf8')).callouts ?? []
  const png = await fetchPng(entry.displayIcon)

  let bounds = entry.displayBounds
  if (!bounds) {
    bounds = pngPlayableBounds(png)
    entry.displayBounds = {
      minX: round4(bounds.minX),
      minY: round4(bounds.minY),
      maxX: round4(bounds.maxX),
      maxY: round4(bounds.maxY),
    }
  }

  const curTransform = entry.displayTransform ?? 'identity'
  const cur = scoreOnPng(
    png,
    callouts,
    entry.displayBounds,
    curTransform,
    entry.displayCoordScale ?? 1,
    entry.displayOffsetX ?? 0,
    entry.displayOffsetY ?? 0,
  )
  const curScore =
    cur.score - (cur.siteCount - cur.sitesOnMap) * 8000

  const best = optimize(png, callouts, entry.displayBounds, curTransform, {
    ...cur,
    score: curScore,
    transform: curTransform,
    scale: entry.displayCoordScale ?? 1,
    ox: entry.displayOffsetX ?? 0,
    oy: entry.displayOffsetY ?? 0,
  })

  if (best.score <= curScore || !best.transform) {
    delete entry.displayRotation
    report.push({
      map: entry.displayName,
      action: 'kept',
      onMap: `${cur.onMap}/${cur.total}`,
      sites: `${cur.sitesOnMap}/${cur.siteCount}`,
    })
    continue
  }

  applyFineTuneFields(entry, best)
  report.push({
    map: entry.displayName,
    action: 'updated',
    from: `${cur.onMap}/${cur.total}`,
    to: `${best.onMap}/${best.total}`,
    sites: `${best.sitesOnMap}/${best.siteCount}`,
    transform: best.transform,
    scale: best.scale,
    ox: best.ox,
    oy: best.oy,
  })
}

console.table(report)
if (write) {
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`\nWrote ${manifestPath}`)
} else {
  console.log('\nDry run — pass --write to update maps-manifest.json')
}
