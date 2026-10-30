import { describe, expect, it, vi } from 'vitest'
import fixture from './__fixtures__/cs2-match-stats-v1-parity.json'
vi.mock('@laihoe/demoparser2', () => ({ parseEvent: vi.fn(), parseTicks: vi.fn() }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn() } }))
import { calculateCs2MatchStats, type Cs2StatsInput } from './cs2-match-stats'

// The AI service (upforge-ai-service services/cs2_match_stats_v1.py) runs the same cases from
// tests/fixtures/cs2_match_stats_v1_parity.json. If a definition changes here, regenerate the
// fixture and copy it there so web and desktop reports keep matching.
describe('CS2 match_stats v1 parity cases', () => {
  for (const c of fixture.cases) {
    it(c.name, () => {
      expect(calculateCs2MatchStats(c.input as unknown as Cs2StatsInput)).toEqual(c.expected)
    })
  }
})
