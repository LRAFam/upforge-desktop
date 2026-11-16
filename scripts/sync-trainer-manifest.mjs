#!/usr/bin/env node
/**
 * Refresh the bundled aim-trainer drill list from the API (the one source: config/trainer-scenarios.php).
 *
 *   npm run drills:sync                      write from GET {API}/api/training/scenarios
 *   npm run drills:sync -- --from <path>     write from a local upforge-api resources/trainer-scenarios.json
 *   npm run drills:check                     exit 1 when the bundled copy differs from the API
 *
 * API defaults to UPFORGE_API_URL or https://api.upforge.gg. --check skips (exit 0) when the API is
 * unreachable or has no endpoint yet, so CI does not fail on network trouble, only on real drift.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src/lib/trainer-scenarios.manifest.json')
const args = process.argv.slice(2)
const check = args.includes('--check')
const fromIdx = args.indexOf('--from')
const from = fromIdx >= 0 ? args[fromIdx + 1] : null
const api = (process.env.UPFORGE_API_URL || 'https://api.upforge.gg').replace(/\/$/, '')

async function load() {
  if (from) return JSON.parse(readFileSync(from, 'utf8'))
  const url = `${api}/api/training/scenarios`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return res.json()
}

let manifest
try {
  manifest = await load()
} catch (e) {
  if (check) {
    console.warn(`drills:check skipped: ${e.message}`)
    process.exit(0)
  }
  throw e
}
if (manifest?.version !== 1 || !Array.isArray(manifest.scenarios)) {
  console.error('Not a version 1 trainer drill manifest')
  process.exit(1)
}
const text = JSON.stringify(manifest, null, 4) + '\n'
if (check) {
  const bundled = JSON.stringify(JSON.parse(readFileSync(OUT, 'utf8')))
  if (bundled !== JSON.stringify(manifest)) {
    const have = new Set(JSON.parse(bundled).scenarios.map(s => s.key))
    const want = manifest.scenarios.map(s => s.key)
    console.error('Bundled drill list differs from the API. Run npm run drills:sync.')
    console.error('Missing here:', want.filter(k => !have.has(k)).join(', ') || '(none; labels/flags differ)')
    process.exit(1)
  }
  console.log(`drills:check ok (${manifest.scenarios.length} drills)`)
} else {
  writeFileSync(OUT, text)
  console.log(`Wrote ${manifest.scenarios.length} drills to ${OUT}`)
}
