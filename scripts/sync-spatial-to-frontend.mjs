/**
 * Copy desktop spatial assets → upforge-frontend + upforge-ai-service.
 */
import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const spatialDir = join(root, 'resources/spatial')
const frontendRoot = join(root, '..', 'upforge-frontend')
const aiRoot = join(root, '..', 'upforge-ai-service')

const targets = [
  { name: 'upforge-frontend', root: frontendRoot },
  { name: 'upforge-ai-service', root: aiRoot },
].filter((t) => existsSync(t.root))

if (!targets.length) {
  console.warn('No sync targets found (upforge-frontend / upforge-ai-service)')
  process.exit(0)
}

const manifestCopies = [
  {
    from: join(spatialDir, 'maps-manifest.json'),
    rel: 'app/data/spatial/maps-manifest.json',
    aiRel: 'resources/spatial/maps-manifest.json',
  },
  {
    from: join(root, 'src/lib/map-display-norm.ts'),
    rel: 'app/lib/map-display-norm.ts',
    aiRel: null,
  },
  {
    from: join(spatialDir, 'zones'),
    rel: 'public/spatial/zones',
    aiRel: 'resources/spatial/zones',
    recursive: true,
  },
  {
    from: join(spatialDir, 'plants'),
    rel: 'public/spatial/plants',
    aiRel: 'resources/spatial/plants',
    recursive: true,
  },
  {
    from: join(spatialDir, 'benchmarks'),
    rel: 'public/spatial/benchmarks',
    aiRel: 'resources/spatial/benchmarks',
    recursive: true,
  },
]

for (const target of targets) {
  for (const { from, rel, aiRel, recursive } of manifestCopies) {
    if (!existsSync(from)) {
      console.warn(`Skip missing: ${from}`)
      continue
    }
    const destRel = target.name === 'upforge-ai-service' ? aiRel : rel
    if (!destRel) continue
    const to = join(target.root, destRel)
    mkdirSync(dirname(to), { recursive: true })
    cpSync(from, to, { recursive: !!recursive, force: true })
    if (
      target.name === 'upforge-frontend' &&
      destRel === 'app/lib/map-display-norm.ts'
    ) {
      const content = readFileSync(to, 'utf8').replace(
        "import mapsManifest from '../../resources/spatial/maps-manifest.json'",
        "import mapsManifest from '~/data/spatial/maps-manifest.json'",
      )
      writeFileSync(to, content)
    }
    console.log(`Synced ${from.replace(root, '.')} → ${target.name}`)
  }
}

console.log(`✅ Spatial assets synced to ${targets.map((t) => t.name).join(', ')}`)
