import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { validateReplayUploadPath } from './replay-upload-path'

describe('validateReplayUploadPath', () => {
  it('accepts only regular .dem files inside approved roots', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-replay-'))
    try {
      const root = join(dir, 'replays')
      await mkdir(root)
      const demo = join(root, 'match.dem')
      await writeFile(demo, 'demo')
      const accepted = validateReplayUploadPath(demo, [root])
      expect(accepted.ok).toBe(true)
      if (accepted.ok) expect(accepted.path).toMatch(/match\.dem$/)
      expect(validateReplayUploadPath(join(root, 'match.txt'), [root]).ok).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects outside files and symlink escapes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'upforge-replay-'))
    try {
      const root = join(dir, 'replays')
      await mkdir(root)
      const outside = join(dir, 'private.dem')
      const linked = join(root, 'linked.dem')
      await writeFile(outside, 'private')
      await symlink(outside, linked)
      expect(validateReplayUploadPath(outside, [root]).ok).toBe(false)
      expect(validateReplayUploadPath(linked, [root]).ok).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
