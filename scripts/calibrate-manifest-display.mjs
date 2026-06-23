#!/usr/bin/env node
/**
 * Batch-tune displayTransform + fine-tune fields in maps-manifest.json
 * using zone anchor positions (same pipeline as map-display-norm.ts).
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
  'identity',
]

const SKIP_IF_OK = new Set(['fracture', 'ascent'])

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

async function fetchPng(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return PNG.sync.read(Buffer.from(await res.arrayBuffer()))
}

function hasCrop(bounds) {
  return bounds
    && bounds.maxX > bounds.minX
    && bounds.maxY > bounds.minY
    && (bounds.minX > 0.001 || bounds.minY > 0.001 || bounds.maxX < 0.999 || bounds.maxY < 0.999)
}

function toDisplay(norm, bounds, transform, scale, ox, oy) {
  let p = { x: (norm.x - 0.5) * scale + 0.5 + ox, y: (norm.y - 0.5) * scale + 0.5 + oy }
  const tf = TRANSFORM_TO[transform] ?? TRANSFORM_TO.identity
  if (hasCrop(bounds)) {
    p = {
      x: bounds.minX + p.x * (bounds.maxX - bounds.minX),
      y: bounds.minY + p.y * (bounds.maxY - bounds.minY),
    }
    p = tf(p)
    const w = bounds.maxX - bounds.minX
    const h = bounds.maxY - bounds.minY
    p = { x: (p.x - bounds.minX) / w, y: (p.y - bounds.minY) / h }
  } else {
    p = tf(p)
  }
  return p
}

function scoreCallouts(callouts, bounds, transform, scale, ox, oy) {
  let ok = 0
  let pen = 0
  for (const z of callouts) {
    const d = toDisplay({ x: z.x, y: z.y }, bounds, transform, scale, ox, oy)
    if (d.x >= 0.06 && d.x <= 0.94 && d.y >= 0.06 && d.y <= 0.94) ok++
    pen += Math.max(0, 0.06 - d.x) + Math.max(0, d.x - 0.94)
    pen += Math.max(0, 0.06 - d.y) + Math.max(0, d.y - 0.94)
    if (d.x < -0.1 || d.x > 1.1 || d.y < -0.1 || d.y > 1.1) pen += 8
  }
  return { ok, score: ok - pen * 15, total: callouts.length }
}

function optimize(callouts, bounds, preferTransform) {
  const transforms = preferTransform
    ? [preferTransform, ...CANDIDATE_TRANSFORMS.filter((t) => t !== preferTransform)]
    : CANDIDATE_TRANSFORMS
  let best = { score: -9999 }
  for (const transform of transforms) {
    for (let scale = 0.68; scale <= 0.92; scale += 0.002) {
      for (let ox = -0.1; ox <= 0.12; ox += 0.002) {
        for (let oy = -0.1; oy <= 0.12; oy += 0.002) {
          const r = scoreCallouts(callouts, bounds, transform, scale, ox, oy)
          if (r.score > best.score) {
            best = {
              ...r,
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
  let bounds = entry.displayBounds
  if (!bounds) {
    const png = await fetchPng(entry.displayIcon)
    bounds = pngPlayableBounds(png)
    entry.displayBounds = {
      minX: round4(bounds.minX),
      minY: round4(bounds.minY),
      maxX: round4(bounds.maxX),
      maxY: round4(bounds.maxY),
    }
  }

  const curTransform = entry.displayTransform ?? 'identity'
  const cur = scoreCallouts(
    callouts,
    entry.displayBounds,
    curTransform,
    entry.displayCoordScale ?? 1,
    entry.displayOffsetX ?? 0,
    entry.displayOffsetY ?? 0,
  )

  if (SKIP_IF_OK.has(key) && cur.ok >= cur.total - 1) {
    delete entry.displayRotation
    report.push({ map: entry.displayName, action: 'kept', curOk: `${cur.ok}/${cur.total}` })
    continue
  }

  const best = optimize(callouts, entry.displayBounds, curTransform)
  if (best.ok < cur.ok && cur.ok >= cur.total - 2) {
    delete entry.displayRotation
    report.push({ map: entry.displayName, action: 'kept (current better)', curOk: `${cur.ok}/${cur.total}` })
    continue
  }

  applyFineTuneFields(entry, best)
  report.push({
    map: entry.displayName,
    action: 'updated',
    from: `${cur.ok}/${cur.total}`,
    to: `${best.ok}/${best.total}`,
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
