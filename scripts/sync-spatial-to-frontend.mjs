/**
 * Copy desktop spatial assets → upforge-frontend (manifest, zones, plants, benchmarks).
 */
import { existsSync, mkdirSync, cpSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const spatialDir = join(root, 'resources/spatial')
const frontendRoot = join(root, '..', 'upforge-frontend')

if (!existsSync(frontendRoot)) {
  console.warn('upforge-frontend not found — skipping spatial sync')
  process.exit(0)
}

const copies = [
  {
    from: join(spatialDir, 'maps-manifest.json'),
    to: join(frontendRoot, 'app/data/spatial/maps-manifest.json'),
  },
  {
    from: join(root, 'src/lib/map-display-norm.ts'),
    to: join(frontendRoot, 'app/lib/map-display-norm.ts'),
  },
  {
    from: join(spatialDir, 'zones'),
    to: join(frontendRoot, 'public/spatial/zones'),
    recursive: true,
  },
  {
    from: join(spatialDir, 'plants'),
    to: join(frontendRoot, 'public/spatial/plants'),
    recursive: true,
  },
  {
    from: join(spatialDir, 'benchmarks'),
    to: join(frontendRoot, 'public/spatial/benchmarks'),
    recursive: true,
  },
]

for (const { from, to, recursive } of copies) {
  if (!existsSync(from)) {
    console.warn(`Skip missing: ${from}`)
    continue
  }
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to, { recursive: !!recursive, force: true })
  console.log(`Synced ${from.replace(root, '.')} → upforge-frontend`)
}

console.log('✅ Spatial assets synced to upforge-frontend')
