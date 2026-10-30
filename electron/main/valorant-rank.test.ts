import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parseValorantMmr, sanitizeMmrCapture } from './valorant-mmr'
import { RANK_REFRESH_MIN_MS, ValorantRankService, captureMmrBody, fileRankStore, listFieldPaths, type StoredRank } from './valorant-rank'

const ME = '11111111-2222-3333-4444-555555555555'
const SEASON = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

/** Shaped from the publicly documented MMR response; not a captured body. */
function mmr(over: Record<string, unknown> = {}) {
  return {
    Version: 1,
    Subject: ME,
    QueueSkills: {
      competitive: {
        CurrentSeasonGamesNeededForRating: 0,
        SeasonalInfoBySeasonID: { [SEASON]: { SeasonID: SEASON, CompetitiveTier: 13, RankedRating: 40, NumberOfGames: 30 } },
      },
    },
    LatestCompetitiveUpdate: {
      MatchID: 'match-1', SeasonID: SEASON, TierAfterUpdate: 13, RankedRatingAfterUpdate: 47, RankedRatingEarned: 18,
    },
    ...over,
  }
}

describe('parseValorantMmr', () => {
  it('reads tier, RR and the last change from the latest competitive update', () => {
    const r = parseValorantMmr(mmr(), ME, 1000)!
    expect(r).toMatchObject({ tier: 13, tierName: 'Gold 2', rr: 47, lastChange: 18, seasonId: SEASON, state: 'ranked', lastMatchId: 'match-1', fetchedAt: 1000 })
  })

  it('falls back to the season row when the latest update has no tier', () => {
    const r = parseValorantMmr(mmr({ LatestCompetitiveUpdate: { SeasonID: SEASON } }), ME)!
    expect(r.tier).toBe(13)
    expect(r.rr).toBe(40)
    expect(r.lastChange).toBeNull()
  })

  it('reports placements and unranked honestly, without RR', () => {
    const placements = mmr({
      LatestCompetitiveUpdate: { SeasonID: SEASON, TierAfterUpdate: 0, RankedRatingAfterUpdate: 0 },
      QueueSkills: { competitive: { CurrentSeasonGamesNeededForRating: 3, SeasonalInfoBySeasonID: {} } },
    })
    expect(parseValorantMmr(placements, ME)).toMatchObject({ state: 'placements', placementsLeft: 3, rr: null, tierName: 'Unranked' })
    const unranked = mmr({ LatestCompetitiveUpdate: null, QueueSkills: {} })
    expect(parseValorantMmr(unranked, ME)).toMatchObject({ state: 'unranked', tier: 0, rr: null })
  })

  it('ignores another player\'s body and out-of-range values', () => {
    expect(parseValorantMmr(mmr(), 'someone-else')).toBeNull()
    expect(parseValorantMmr(mmr(), null)).toBeNull()
    const bad = parseValorantMmr(mmr({ LatestCompetitiveUpdate: { SeasonID: SEASON, TierAfterUpdate: 99, RankedRatingAfterUpdate: -5 } }), ME)!
    expect(bad.tier).toBe(13) // from the season row, not 99
    expect(bad.rr).toBe(40)
  })
})

describe('ValorantRankService', () => {
  function setup(opts: { fetch?: () => Promise<{ puuid: string; raw: unknown } | null>; userId?: number | null } = {}) {
    let stored: StoredRank | null = null
    let t = 10_000_000
    const posts: unknown[] = []
    const notified: unknown[] = []
    const svc = new ValorantRankService({
      fetchMmr: opts.fetch ?? (async () => ({ puuid: ME, raw: mmr() })),
      postSnapshot: async (r) => { posts.push(r); return true },
      notify: (r) => { notified.push(r) },
      currentUserId: () => (opts.userId === undefined ? 7 : opts.userId),
      read: () => stored,
      write: (v) => { stored = v },
      now: () => t,
    })
    return { svc, posts, notified, advance: (ms: number) => { t += ms }, get stored() { return stored } }
  }

  it('fetches, saves, notifies and posts once per new rank', async () => {
    const s = setup()
    const r = await s.svc.refresh('start')
    expect(r?.rr).toBe(47)
    expect(s.stored?.userId).toBe(7)
    expect(s.notified).toHaveLength(1)
    expect(s.posts).toHaveLength(1)
    s.advance(RANK_REFRESH_MIN_MS + 1)
    await s.svc.refresh('focus')
    expect(s.posts).toHaveLength(1) // same rank: nothing new to send
  })

  it('throttles focus refreshes to one every 2 minutes, but not match end', async () => {
    const fetch = vi.fn(async () => ({ puuid: ME, raw: mmr() }))
    const s = setup({ fetch })
    await s.svc.refresh('start')
    await s.svc.refresh('focus')
    expect(fetch).toHaveBeenCalledTimes(1)
    await s.svc.refresh('match_end')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps the saved rank when the Riot client is closed', async () => {
    const s = setup()
    await s.svc.refresh('start')
    // A fresh service with the Riot client closed still returns the saved rank.
    const svc2 = new ValorantRankService({
      fetchMmr: async () => null, postSnapshot: async () => true, notify: () => {}, currentUserId: () => 7,
      read: () => s.stored, write: () => {},
    })
    expect((await svc2.refresh('manual'))?.rr).toBe(47)
  })

  it('never shows one UpForge user another user\'s saved rank', async () => {
    const s = setup()
    await s.svc.refresh('start')
    const other = new ValorantRankService({
      fetchMmr: async () => null, postSnapshot: async () => true, notify: () => {}, currentUserId: () => 8,
      read: () => s.stored, write: () => {},
    })
    expect(other.current()).toBeNull()
  })

  it('does nothing while signed out', async () => {
    const fetch = vi.fn(async () => ({ puuid: ME, raw: mmr() }))
    const s = setup({ fetch, userId: null })
    expect(await s.svc.refresh('start')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('capture and storage', () => {
  it('redacts token-like values and lists field paths with season ids collapsed', async () => {
    const raw = { ...mmr(), accessToken: 'abc', Note: 'aaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc' }
    const clean = sanitizeMmrCapture(raw) as Record<string, unknown>
    expect(clean.accessToken).toBe('[redacted]')
    expect(clean.Note).toBe('[redacted]')
    const fields = listFieldPaths(clean)
    expect(fields).toContain('LatestCompetitiveUpdate.RankedRatingEarned')
    expect(fields).toContain('QueueSkills.competitive.SeasonalInfoBySeasonID.{seasonId}.RankedRating')

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-mmr-'))
    const res = await captureMmrBody(async () => ({ puuid: ME, raw }), dir, 0)
    expect(res.ok).toBe(true)
    if (res.ok) expect(fs.readFileSync(res.file, 'utf8')).not.toContain('aaaaaaaaaaaa.bbbbbbbbbbbb')
    expect(await captureMmrBody(async () => null, dir)).toMatchObject({ ok: false })
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('round-trips the saved rank file and ignores junk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-rank-'))
    const store = fileRankStore(path.join(dir, 'valorant-rank.json'))
    expect(store.read()).toBeNull()
    const rank = parseValorantMmr(mmr(), ME)!
    store.write({ userId: 7, rank })
    expect(store.read()?.rank.rr).toBe(47)
    fs.writeFileSync(path.join(dir, 'valorant-rank.json'), '{"nope":1}')
    expect(store.read()).toBeNull()
    store.write(null)
    expect(fs.existsSync(path.join(dir, 'valorant-rank.json'))).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
