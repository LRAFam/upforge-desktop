import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp', getVersion: () => '0.0.0', getAppPath: () => '/tmp' } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const timeline = vi.hoisted(() => ({
  build: vi.fn(),
  readError: vi.fn<(p: string) => string | null>(),
}))
vi.mock('./demo-timeline', async () => {
  const messages = await vi.importActual<typeof import('./demo-read-messages')>('./demo-read-messages')
  return {
    buildTimelineFromDemo: timeline.build,
    cs2DemoReadError: timeline.readError,
    CS2_DEMO_UNREADABLE_MESSAGE: messages.CS2_DEMO_UNREADABLE_MESSAGE,
  }
})
vi.mock('./demo-header-peek', () => ({ peekDemoHeader: vi.fn(async () => ({ mapName: 'de_mirage', playbackTime: 1800 })) }))
vi.mock('./demo-text-sanitize', async (orig) => ({
  ...(await orig<typeof import('./demo-text-sanitize')>()),
  isDemoLikelyIncomplete: () => false,
}))

import { buildDemoPreviewSummary } from './demo-preview'
import { CS2_DEMO_UNREADABLE_MESSAGE, REPLAY_UNREADABLE_MESSAGE } from './demo-read-messages'

describe('"could not read this demo" tells the player what to do', () => {
  let dir: string
  let demo: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-msg-'))
    demo = path.join(dir, 'match.dem')
    fs.writeFileSync(demo, Buffer.alloc(16))
    timeline.build.mockReset()
    timeline.readError.mockReset()
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('the CS2 parser message names the likely cause and the next step, without promising a fix exists', () => {
    expect(CS2_DEMO_UNREADABLE_MESSAGE).toMatch(/CS2 update/)
    expect(CS2_DEMO_UNREADABLE_MESSAGE).toMatch(/rescan/i)
    // The latest UpForge may not read the new format yet, so do not tell them it will.
    expect(CS2_DEMO_UNREADABLE_MESSAGE).not.toMatch(/latest version/i)
    expect(CS2_DEMO_UNREADABLE_MESSAGE.length).toBeLessThanOrEqual(160)
  })

  it('preview of a complete CS2 demo the parser cannot read shows the game-update message, not "try Rescan"', async () => {
    timeline.build.mockResolvedValue(null)
    timeline.readError.mockReturnValue('Unknown demo format')

    const summary = await buildDemoPreviewSummary({ game: 'cs2', demoPath: demo })

    expect(summary.error).toBe(CS2_DEMO_UNREADABLE_MESSAGE)
  })

  it('a replay that throws while opening says what to check', async () => {
    timeline.build.mockRejectedValue(new Error('boom'))

    const summary = await buildDemoPreviewSummary({ game: 'cs2', demoPath: demo })

    expect(summary.error).toBe(REPLAY_UNREADABLE_MESSAGE)
    expect(REPLAY_UNREADABLE_MESSAGE).toMatch(/this match/)
    expect(REPLAY_UNREADABLE_MESSAGE).toMatch(/another file/)
  })
})
