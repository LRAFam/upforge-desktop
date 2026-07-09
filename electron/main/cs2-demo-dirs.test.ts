import { describe, expect, it } from 'vitest'
import path from 'path'
import { getCs2DemoSearchDirs, normalizeCs2CsgoRoot } from './cs2-demo-dirs'

describe('getCs2DemoSearchDirs', () => {
  it('includes replays subfolder for custom dir', async () => {
    const dirs = await getCs2DemoSearchDirs('C:\\csgo')
    expect(dirs).toContain('C:\\csgo')
    expect(dirs).toContain(path.win32.join('C:\\csgo', 'replays'))
  })

  it('normalizes custom replays path to csgo root', async () => {
    const dirs = await getCs2DemoSearchDirs('C:\\csgo\\replays')
    expect(dirs).toContain('C:\\csgo')
    expect(dirs).toContain(path.win32.join('C:\\csgo', 'replays'))
    expect(dirs).not.toContain(path.win32.join('C:\\csgo\\replays', 'replays'))
  })
})

describe('normalizeCs2CsgoRoot', () => {
  it('strips trailing replays segment', () => {
    expect(normalizeCs2CsgoRoot('C:\\csgo\\replays')).toBe('C:\\csgo')
    expect(normalizeCs2CsgoRoot('C:\\csgo')).toBe('C:\\csgo')
  })
})
