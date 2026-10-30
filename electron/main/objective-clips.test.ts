import { describe, expect, it } from 'vitest'
import { MAX_OBJECTIVE_CLIPS_PER_MATCH, objectiveClipTitle, pickObjectiveClips } from './objective-clips'
import type { ObjectiveEvent } from './riot-types'

const ev = (kind: ObjectiveEvent['kind'], at: number, extra: Partial<ObjectiveEvent> = {}): ObjectiveEvent =>
  ({ EventID: at, EventName: kind, EventTime: at / 1000, kind, timeSinceGameStartMillis: at, videoOffsetMs: at + 60_000, ...extra }) as ObjectiveEvent

describe('pickObjectiveClips', () => {
  it('takes the biggest objectives first and caps the count', () => {
    const picks = pickObjectiveClips({ objectiveEvents: [
      ev('tower', 600_000), ev('dragon', 400_000), ev('baron', 1_500_000), ev('herald', 800_000),
      ev('tower', 900_000), ev('dragon', 1_000_000), ev('inhibitor', 1_700_000),
    ] })
    expect(picks).toHaveLength(MAX_OBJECTIVE_CLIPS_PER_MATCH)
    expect(picks.map(p => p.kind)).toEqual(['baron', 'dragon', 'dragon', 'herald'])
  })

  it('prefers objectives the player secured within the same kind', () => {
    const picks = pickObjectiveClips({ objectiveEvents: [ev('dragon', 300_000), ev('dragon', 900_000, { killerName: 'You' })] }, 1)
    expect(picks[0].killerName).toBe('You')
  })

  it('skips highlights, events without a video offset, and never exceeds the hard cap', () => {
    const picks = pickObjectiveClips({ objectiveEvents: [ev('ace', 100), ev('multikill', 200), ev('baron', 300, { videoOffsetMs: undefined })] }, 99)
    expect(picks).toEqual([])
  })
})

describe('objectiveClipTitle', () => {
  it('says only what the live client reported', () => {
    expect(objectiveClipTitle(ev('dragon', 754_000, { detail: 'Infernal', killerName: 'You' }))).toBe('Dragon (Infernal) · you took it · 12:34')
    expect(objectiveClipTitle(ev('baron', 1_500_000, { stolen: true }))).toBe('Baron · stolen · 25:00')
    expect(objectiveClipTitle(ev('tower', 600_000))).toBe('Tower · 10:00')
  })
})
