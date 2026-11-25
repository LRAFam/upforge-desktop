import { describe, expect, it } from 'vitest'
import { squadActivityUrl } from './squad-ui'

describe('squadActivityUrl', () => {
  it('opens a shared analysis at the web /shared/<token> report page', () => {
    expect(squadActivityUrl({ id: 42, user_id: 7, game: 'valorant', share_token: 'tok-abc' }, 1))
      .toBe('https://upforge.gg/shared/tok-abc')
  })

  it('encodes the token', () => {
    expect(squadActivityUrl({ id: 42, user_id: 7, share_token: 'a/b c' }, 1))
      .toBe('https://upforge.gg/shared/a%2Fb%20c')
  })

  it('opens your own unshared analysis on its results page', () => {
    expect(squadActivityUrl({ id: 42, user_id: 7, game: 'cs2', share_token: null }, 7))
      .toBe('https://upforge.gg/cs2/results/42')
  })

  it("never builds a link from a teammate's private analysis id", () => {
    expect(squadActivityUrl({ id: 42, user_id: 7, game: 'valorant', share_token: null }, 1)).toBeNull()
    expect(squadActivityUrl({ id: 42, user_id: 7, game: 'valorant' }, null)).toBeNull()
  })
})

describe('Squad: credits, invites and win rates in words (UX1124-36)', () => {
  it('says how many credits are left and used', async () => {
    const { squadCreditsStat } = await import('./squad-ui')
    expect(squadCreditsStat(45, 45, '2026-11-03T10:00:00Z')).toEqual({ value: '45 of 45 left', sub: '0 used · refilled 3 Nov' })
    expect(squadCreditsStat(0, 45, null)).toEqual({ value: '0 of 45 left', sub: '45 used this billing month' })
  })

  it('drops an invite once that player is a member, or after 30 days', async () => {
    const { reconcilePendingInvites } = await import('./squad-ui')
    const now = Date.UTC(2026, 10, 24)
    const invites = [
      { value: 'Ace#EUW', createdAt: now - 176 * 86_400_000 },
      { value: 'bob', createdAt: now - 86_400_000 },
      { value: 'Cara#1234', createdAt: now - 86_400_000 },
      { value: 'new@example.com', createdAt: now - 86_400_000 },
    ]
    const kept = reconcilePendingInvites(invites, [{ name: 'Bob' }, { name: 'C', riot_name: 'cara', riot_tag: '1234' }], now)
    expect(kept.map(i => i.value)).toEqual(['new@example.com'])
  })

  it('tells no stats apart from not calculated yet', async () => {
    const { squadWinRateText, buildSquadCompareRows } = await import('./squad-ui')
    expect(squadWinRateText(54.4, true)).toEqual({ text: '54%', missing: false })
    expect(squadWinRateText(null, false)).toEqual({ text: 'No Valorant stats', missing: true })
    expect(squadWinRateText(null, true)).toEqual({ text: 'Not calculated yet', missing: true })
    const rows = buildSquadCompareRows([{ user_id: 1, name: 'A', win_rate: null, has_stats: true }], [{ user_id: 2, name: 'B', analyses_count: 3 }])
    expect(rows.find(r => r.userId === 1)?.hasStats).toBe(true)
    expect(rows.find(r => r.userId === 2)?.hasStats).toBe(false)
  })

  it('Squad wires them in', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const v3 = readFileSync(join(__dirname, '..', 'views', 'v3', 'SquadV3.vue'), 'utf8')
    expect(v3).toContain('squadCreditsStat(t.credits_remaining, t.credits_total, t.credits_reset_at)')
    expect(v3).toContain('squadWinRateText(r.winRate, r.hasStats)')
    const view = readFileSync(join(__dirname, '..', 'views', 'SquadView.vue'), 'utf8')
    expect(view).toContain('reconcilePendingInvites(pendingInvites.value, members)')
  })
})
