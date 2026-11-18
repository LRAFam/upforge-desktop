import { describe, expect, it } from 'vitest'

describe('measured reaction (0 ms = not measured)', () => {
  it('returns null for tracking drills, zero-hit runs and 0 ms', async () => {
    const { measuredReactionMs } = await import('./training-result-metrics')
    expect(measuredReactionMs({ scenario: 'strafe_track', avg_reaction_ms: 0, targets_hit: 0 })).toBeNull()
    expect(measuredReactionMs({ scenario: 'tracking', avg_reaction_ms: 180, targets_hit: 0 })).toBeNull()
    expect(measuredReactionMs({ scenario: 'gridshot', avg_reaction_ms: 0, targets_hit: 0 })).toBeNull()
    expect(measuredReactionMs({ scenario: 'gridshot', avg_reaction_ms: 150, targets_hit: 0 })).toBeNull()
    expect(measuredReactionMs({ scenario: 'jiggle_peek', avg_reaction_ms: 150, targets_hit: 4 })).toBeNull()
    expect(measuredReactionMs({ scenario: 'gridshot', avg_reaction_ms: 312, targets_hit: 20 })).toBe(312)
    expect(measuredReactionMs({ scenario: 'flash_swing', avg_reaction_ms: 240, targets_hit: 3 })).toBe(240)
  })

  it('leaderboard rows never print 0ms', async () => {
    const { leaderboardStatLine } = await import('./training-result-metrics')
    expect(leaderboardStatLine('strafe_track', { accuracy_pct: 62, avg_reaction_ms: 0 })).toBe('62% time on target')
    expect(leaderboardStatLine('tracking', { accuracy_pct: 48, avg_reaction_ms: 0 })).not.toContain('ms')
    expect(leaderboardStatLine('gridshot', { accuracy_pct: 80, avg_reaction_ms: 0 })).toBe('80% accuracy')
    expect(leaderboardStatLine('gridshot', { accuracy_pct: 80, avg_reaction_ms: 301.4 })).toBe('80% accuracy · 301ms to hit')
  })
})
