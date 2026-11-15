import { describe, expect, it } from 'vitest'
import { demoAttachGuideSteps } from './demo-attach-guide'

const text = (game: 'cs2' | 'deadlock') =>
  demoAttachGuideSteps(game).map((s) => s.parts.map((p) => p.text).join('')).join('\n')

describe('demoAttachGuideSteps', () => {
  it('CS2 guide does not tell players to add a non-existent autoexec cvar', () => {
    const cs2 = text('cs2')
    expect(cs2).not.toMatch(/cl_demo_auto_recording/)
    expect(cs2).not.toMatch(/autoexec/i)
    expect(cs2).toMatch(/Your Matches/)
  })
})
