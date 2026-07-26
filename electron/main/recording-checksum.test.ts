import { describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { sha256File } from './recording-checksum'

describe('sha256File', () => {
  it('returns a stable hex digest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-hash-'))
    try {
      const file = join(dir, 'a.bin')
      await writeFile(file, 'hello-upforge')
      const a = await sha256File(file)
      const b = await sha256File(file)
      expect(a).toBe(b)
      expect(a).toMatch(/^[a-f0-9]{64}$/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
