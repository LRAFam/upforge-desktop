import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { peekDemoHeader } from './demo-header-peek'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-demo-routing-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

// Real Source-1 header layout: this unsupported file must not become Deadlock metadata.
function legacySource1Demo(): Buffer {
  const bytes = Buffer.alloc(1078)
  bytes.write('HL2DEMO\0', 0, 'latin1')
  bytes.writeInt32LE(4, 8)
  bytes.writeInt32LE(13700, 12)
  bytes.write('GOTV Demo', 276)
  bytes.write('de_dust2', 536)
  bytes.write('csgo', 796)
  bytes.writeFloatLE(90, 1056)
  bytes.writeInt32LE(5760, 1060)
  bytes[1072] = 7 // dem_stop
  return bytes
}

describe('supported replay header routing', () => {
  it('never interprets a Source-1 header as a Deadlock replay', async () => {
    const file = path.join(dir, 'source1.dem')
    fs.writeFileSync(file, legacySource1Demo())
    expect(await peekDemoHeader(file, 'deadlock')).toBeNull()
  })

  it('reads the actual supported CS2 native fixture', async () => {
    const file = path.join(__dirname, '__fixtures__', 'cs2-selftest.dem')
    const header = await peekDemoHeader(file, 'cs2')
    expect(header?.mapName).toBe('de_upforge_selftest')
    expect(header?.clientName).toBe('SourceTV Demo')
  })

  it('rejects malformed and missing CS2 files without inventing metadata', async () => {
    const file = path.join(dir, 'broken.dem')
    fs.writeFileSync(file, Buffer.from('not a replay'))
    expect(await peekDemoHeader(file, 'cs2')).toBeNull()
    expect(await peekDemoHeader(path.join(dir, 'missing.dem'), 'cs2')).toBeNull()
  })
})
