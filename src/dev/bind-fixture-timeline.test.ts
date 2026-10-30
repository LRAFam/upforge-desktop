import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bindFixtureTimeline, DEV_BIND_FIXTURE_ID } from './bind-fixture-timeline'

const raw = JSON.parse(readFileSync(new URL('./fixtures/valorant-bind-match.json', import.meta.url), 'utf8'))

describe('bindFixtureTimeline', () => {
  const t = bindFixtureTimeline(raw.match_data)

  it('maps the real Bind match: 9–13 loss, 11/18/3 as Jett', () => {
    expect(t.id).toBe(DEV_BIND_FIXTURE_ID)
    expect(t.map).toBe('Bind')
    expect(t.agent).toBe('Jett')
    expect(t.finalStats).toEqual({ kills: 11, deaths: 18, assists: 3, won: false })
    expect(t.roundSummaries).toHaveLength(22)
    expect(t.teamSnapshot).toHaveLength(10)
  })

  it('places the player\'s kills and deaths by game time and has no recording', () => {
    expect(t.kills).toHaveLength(11)
    expect(t.deaths).toHaveLength(18)
    expect(t.kills[0]).toMatchObject({ killerName: 'You', round: 0, videoOffsetMs: 74606 })
    expect(t.videoPath).toBeNull()
    expect(t.devFixture).toBe(true)
  })

  it('keeps the round replay so the minimap has real positions', () => {
    expect((t as unknown as { roundReplay?: unknown }).roundReplay).toBeTruthy()
  })
})
