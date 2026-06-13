/**
 * Build resources/spatial/plants/<map>.json from zones/*.json.
 * Plant spots use tighter radii than kill callouts for vstats-style plant labelling.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const spatialDir = join(__dirname, '..', 'resources', 'spatial')
const zonesDir = join(spatialDir, 'zones')
const plantsDir = join(spatialDir, 'plants')

const SKIP = /spawn|lobby|attacker|defender|^mid\b/i

function plantRadius(zoneRadius) {
  return Math.min(0.08, Math.max(0.055, zoneRadius * 0.82))
}

mkdirSync(plantsDir, { recursive: true })

for (const file of readdirSync(zonesDir).filter((f) => f.endsWith('.json'))) {
  const pack = JSON.parse(readFileSync(join(zonesDir, file), 'utf8'))
  const seen = new Set()
  const plants = []

  const push = (entry) => {
    const key = entry.name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    plants.push(entry)
  }

  for (const c of pack.callouts ?? []) {
    const site = c.site
    if (!site || !['A', 'B', 'C'].includes(site)) continue
    if (SKIP.test(c.name)) continue

    if (/^([ABC]) Site$/.test(c.name)) {
      const letter = c.name.charAt(0)
      const pyramids = pack.callouts?.find((x) => x.name === `${letter} Pyramids`)
      push({
        name: `${letter} Default`,
        site: letter,
        x: pyramids?.x ?? c.x,
        y: pyramids?.y ?? c.y,
        radius: 0.09,
      })
    }

    push({
      name: c.name,
      site,
      x: c.x,
      y: c.y,
      radius: plantRadius(c.radius ?? 0.075),
    })
  }

  const out = {
    map: pack.map,
    source: 'derived from zones callouts',
    generatedAt: new Date().toISOString().slice(0, 10),
    spots: plants.sort((a, b) => a.name.localeCompare(b.name)),
  }

  writeFileSync(join(plantsDir, file), `${JSON.stringify(out, null, 2)}\n`)
  console.log(`[plants] ${pack.map}: ${plants.length} spots`)
}

console.log(`Wrote plant packs → ${plantsDir}`)
