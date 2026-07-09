import { describe, expect, it } from 'vitest'
import path from 'path'
import { getCs2DemoSearchDirs } from './cs2-demo-dirs'

describe('getCs2DemoSearchDirs', () => {
  it('includes replays subfolder for custom dir', async () => {
    const dirs = await getCs2DemoSearchDirs('C:\\csgo')
    expect(dirs).toContain('C:\\csgo')
    expect(dirs).toContain(path.join('C:\\csgo', 'replays'))
  })
})
