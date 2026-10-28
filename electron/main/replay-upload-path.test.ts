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
      const outsideDir = join(dir, 'private')
      await mkdir(outsideDir)
      const outside = join(outsideDir, 'private.dem')
      const linked = join(root, 'linked.dem')
      await writeFile(outside, 'private')
      // Junctions exercise a real escape on Windows without requiring the
      // developer-mode or administrator privilege needed for file symlinks.
      const windows = process.platform === 'win32'
      await symlink(windows ? outsideDir : outside, linked, windows ? 'junction' : 'file')
      expect(validateReplayUploadPath(outside, [root]).ok).toBe(false)
      const escaped = windows ? join(linked, 'private.dem') : linked
      expect(validateReplayUploadPath(escaped, [root])).toEqual({
        ok: false,
        error: 'Replay file is outside the approved Deadlock replay folders',
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
