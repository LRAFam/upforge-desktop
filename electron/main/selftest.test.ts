import fs from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parseHeader } from '@laihoe/demoparser2'
import { collectCs2DemoBundle, nativeCs2DemoSource } from './cs2-demo-source'
import {
  SELFTEST_DEMO_MAP,
  buildSelftestCs2Demo,
  evaluateDemoWorkerResult,
  parseSelftestRequest,
} from './selftest'

const FIXTURE = join(__dirname, '__fixtures__', 'cs2-selftest.dem')

describe('parseSelftestRequest', () => {
  it('needs both the env var and the flag', () => {
    expect(parseSelftestRequest(['app', '--selftest=demo-worker'], { UPFORGE_SELFTEST: '1' })).toBe('demo-worker')
    expect(parseSelftestRequest(['app', '--selftest=demo-worker'], {})).toBeNull()
    expect(parseSelftestRequest(['app'], { UPFORGE_SELFTEST: '1' })).toBeNull()
    expect(parseSelftestRequest(['app', '--selftest=format-disk'], { UPFORGE_SELFTEST: '1' })).toBeNull()
  })
})

describe('self-test CS2 demo', () => {
  it('matches the committed fixture byte for byte', () => {
    expect(buildSelftestCs2Demo().equals(fs.readFileSync(FIXTURE))).toBe(true)
  })

  it('is accepted by demoparser2 (header only)', () => {
    expect(parseHeader(buildSelftestCs2Demo()).map_name).toBe(SELFTEST_DEMO_MAP)
  })

  it('passes evaluation when run through the worker plan', () => {
    const bundle = collectCs2DemoBundle(nativeCs2DemoSource(buildSelftestCs2Demo()))
    const result = evaluateDemoWorkerResult({ status: 'ok', bundle }, 5)
    expect(result).toMatchObject({ ok: true, mapName: SELFTEST_DEMO_MAP })
    expect(result.bundleEntries).toBeGreaterThan(1)
  })

  it('fails when the worker could not start (no silent main-thread fallback)', () => {
    expect(evaluateDemoWorkerResult({ status: 'unavailable', error: 'worker path unavailable' }, 1))
      .toMatchObject({ ok: false, status: 'unavailable', error: 'worker path unavailable' })
  })
})
