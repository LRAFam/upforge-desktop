import { describe, expect, it } from 'vitest'
import {
  createToastQueue,
  titleBarAccountLabel,
  titleBarObsConnected,
  v3AllowedRoutes,
  V3_ALL_GAME_ROUTES,
  demoAssessmentTone,
  formatTrimTime,
  isGenuineAchievement,
  nudgeTrimEnd,
  nudgeTrimStart,
  trimRangePercent,
  updateBannerLine,
} from './shell-v3'

describe('updateBannerLine', () => {
  it('hides for idle / unknown phases', () => {
    expect(updateBannerLine('idle', '1.2.3', 0)).toBeNull()
    expect(updateBannerLine('error', null, 0)).toBeNull()
  })
  it('downloading shows a live faint dot and a rounded percent', () => {
    const l = updateBannerLine('downloading', '1.2.3', 41.6)!
    expect(l.text).toBe('Downloading update v1.2.3…')
    expect(l).toMatchObject({ tone: 'faint', live: true, canInstall: false, percent: 42 })
  })
  it('downloading without progress has no percent', () => {
    expect(updateBannerLine('downloading', null, 0)!.percent).toBeNull()
    expect(updateBannerLine('downloading', null, Number.NaN)!.percent).toBeNull()
    expect(updateBannerLine('downloading', null, 140)!.percent).toBe(100)
  })
  it('available keeps the classic wording', () => {
    expect(updateBannerLine('available', '2.0.0', 0)!.text).toBe('Update v2.0.0 available. Downloading in background.')
  })
  it('ready offers install with a red dot', () => {
    const l = updateBannerLine('ready', '2.0.0', 100)!
    expect(l.text).toBe('UpForge v2.0.0 is ready to install')
    expect(l).toMatchObject({ tone: 'red', live: false, canInstall: true })
    expect(updateBannerLine('ready', '', 0)!.text).toBe('UpForge is ready to install')
  })
})

describe('trim maths', () => {
  it('formats like the classic modal', () => {
    expect(formatTrimTime(0)).toBe('0:00')
    expect(formatTrimTime(65.4)).toBe('1:05')
    expect(formatTrimTime(65.44, true)).toBe('1:05.4')
    expect(formatTrimTime(-1)).toBe('0:00')
    expect(formatTrimTime(Number.POSITIVE_INFINITY)).toBe('0:00')
  })
  it('clamps the start between 0 and end - 0.5', () => {
    expect(nudgeTrimStart(0, 10, -0.1)).toBe(0)
    expect(nudgeTrimStart(5, 10, 0.1)).toBe(5.1)
    expect(nudgeTrimStart(9.5, 10, 0.1)).toBe(9.5)
  })
  it('clamps the end between start + 0.5 and duration', () => {
    expect(nudgeTrimEnd(0, 30, 30, 0.1)).toBe(30)
    expect(nudgeTrimEnd(0, 20, 30, -0.1)).toBe(19.9)
    expect(nudgeTrimEnd(10, 10.5, 30, -0.1)).toBe(10.5)
  })
  it('range bar percents are safe and clamped', () => {
    expect(trimRangePercent(10, 30, 40)).toEqual({ left: 25, width: 50 })
    expect(trimRangePercent(0, 10, 0)).toEqual({ left: 0, width: 0 })
    expect(trimRangePercent(-5, 50, 40)).toEqual({ left: 0, width: 100 })
  })
})

describe('demoAssessmentTone', () => {
  it('maps confidence to a tone', () => {
    expect(demoAssessmentTone('strong')).toBe('win')
    expect(demoAssessmentTone('possible')).toBe('faint')
    expect(demoAssessmentTone('mismatch')).toBe('gold')
    expect(demoAssessmentTone(null)).toBe('faint')
  })
})

describe('isGenuineAchievement', () => {
  const cat = [{ id: 'first-drill' }, { id: 'streak-3' }]
  it('only catalogue ids get the star', () => {
    expect(isGenuineAchievement('streak-3', cat)).toBe(true)
    expect(isGenuineAchievement('made-up', cat)).toBe(false)
    expect(isGenuineAchievement('', cat)).toBe(false)
    expect(isGenuineAchievement(null, cat)).toBe(false)
  })
})

describe('createToastQueue', () => {
  function harness() {
    const shown: (string | null)[] = []
    const timers: (() => void)[] = []
    const q = createToastQueue<string>({
      gapMs: 400,
      onChange: (c) => shown.push(c),
      setTimer: (fn) => { timers.push(fn); return timers.length },
      clearTimer: () => { timers.length = 0 },
    })
    const flush = () => { const t = timers.splice(0); t.forEach((fn) => fn()) }
    return { q, shown, flush, timers }
  }

  it('shows the first right away and the rest one at a time after a gap', () => {
    const { q, shown, flush } = harness()
    q.push(['a', 'b', 'c'])
    expect(shown).toEqual(['a'])
    q.next(); flush()
    q.next(); flush()
    q.next(); flush()
    expect(shown).toEqual(['a', null, 'b', null, 'c', null])
  })

  it('a double dismiss does not skip a queued achievement', () => {
    const { q, shown, flush } = harness()
    q.push(['a', 'b', 'c'])
    q.next(); q.next() // toast fires onDismiss and @dismiss
    flush()
    q.next(); q.next()
    flush()
    expect(shown.filter(Boolean)).toEqual(['a', 'b', 'c'])
  })

  it('pushing during the gap waits for the gap', () => {
    const { q, shown, flush } = harness()
    q.push(['a', 'b'])
    q.next()
    q.push(['c'])
    expect(shown).toEqual(['a', null])
    flush(); q.next(); flush()
    expect(shown.filter(Boolean)).toEqual(['a', 'b', 'c'])
  })

  it('dispose cancels a pending gap', () => {
    const { q, timers } = harness()
    q.push(['a', 'b'])
    q.next()
    expect(timers.length).toBe(1)
    q.dispose()
    expect(timers.length).toBe(0)
  })
})

describe('titleBarAccountLabel (audit 2026-11-02)', () => {
  const ids = { riotId: 'LRAFam#1337', userName: 'LRAFam', cs2SteamName: 'lrafam_steam', lolRiotId: 'LRAFam#EUW' }
  it('uses the in-game identity for the current game, with no game suffix', () => {
    expect(titleBarAccountLabel('valorant', ids)).toBe('LRAFam#1337')
    expect(titleBarAccountLabel('cs2', ids)).toBe('lrafam_steam')
    expect(titleBarAccountLabel('lol', ids)).toBe('LRAFam#EUW')
  })
  it('falls back to the UpForge username when the game has no linked identity', () => {
    expect(titleBarAccountLabel('deadlock', ids)).toBe('LRAFam')
    expect(titleBarAccountLabel('cs2', { ...ids, cs2SteamName: '  ' })).toBe('LRAFam')
    expect(titleBarAccountLabel('lol', { ...ids, lolRiotId: null })).toBe('LRAFam')
    expect(titleBarAccountLabel('valorant', { userName: 'LRAFam' })).toBe('LRAFam')
  })
  it('never adds a game suffix', () => {
    for (const g of ['valorant', 'cs2', 'deadlock', 'lol']) {
      expect(titleBarAccountLabel(g, ids)).not.toMatch(/·|CS2|DEADLOCK|LOL/)
    }
  })
  it('returns null when nothing is known', () => {
    expect(titleBarAccountLabel('cs2', {})).toBeNull()
  })
})

describe('titleBarObsConnected (audit 2026-11-02)', () => {
  it('stays quiet while the OBS banner shows the same message', () => {
    expect(titleBarObsConnected({ recording: false, obsConnected: false, showChip: true, bannerShown: true })).toBeNull()
  })
  it('shows OBS state when no banner is on screen', () => {
    expect(titleBarObsConnected({ recording: false, obsConnected: false, showChip: true, bannerShown: false })).toBe(false)
    expect(titleBarObsConnected({ recording: false, obsConnected: true, showChip: true, bannerShown: false })).toBe(true)
  })
  it('hides when the chip is off', () => {
    expect(titleBarObsConnected({ recording: false, obsConnected: true, showChip: false, bannerShown: false })).toBeNull()
  })
  it('always reports while recording', () => {
    expect(titleBarObsConnected({ recording: true, obsConnected: true, showChip: false, bannerShown: false })).toBe(true)
    expect(titleBarObsConnected({ recording: true, obsConnected: null, showChip: false, bannerShown: false })).toBe(true)
  })
})

describe('v3AllowedRoutes (audit 2026-11-02)', () => {
  it('keeps Progress, Practice and Squad for every game without duplicates', () => {
    const demo = ['/dashboard', '/recordings', '/rosters', '/settings']
    const out = v3AllowedRoutes(demo)
    for (const r of [...demo, ...V3_ALL_GAME_ROUTES]) expect(out).toContain(r)
    expect(v3AllowedRoutes(['/stats', '/training']).filter(r => r === '/stats')).toHaveLength(1)
  })
})
