/**
 * Mounts the real match report page (compiled from the .vue file, no browser) with a fake app bridge,
 * to check the video section and the round links end to end: what shows, and what a press does.
 */
import * as vue from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSfc, pressable, settle, unmountAll } from '../../test-support/sfc-mount'

const READY = { ready: true, state: 'ready', message: '', duelMomentCount: 6 }
function reportFor(matchId: string, extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    match_id: matchId,
    account: { is_main: true },
    report: {
      facts: {
        map: 'Bind', agent: 'Jett', won: false, score: { ally: 9, enemy: 13 },
        kda: { kills: 18, deaths: 17, assists: 4 }, acs: 241.6, adr: 154.2, lobby_rank: 2, lobby_size: 10,
        zero_damage_rounds: [4, 11], deaths: { total: 17, traded: 5, untraded: 12 },
        opening_impact: { first_kills: 1, first_kill_wins: 1, first_deaths: 8, first_death_wins: 1 },
      },
      notes: {
        headline: { finding_id: 'opening_deaths', text: 'You died first in 8 rounds and won 1 of them.' },
        next_action: { finding_id: 'early_opening_deaths', text: 'Clear one angle at a time before the first fight.' },
        watch_rounds: [{ round: 7, finding_id: 'opening_deaths', why: 'Died 1 second in to an Operator.' }],
      },
    },
    focus: null,
    notes_usage: { used: 1, limit: 1 },
  }
}

interface Setup {
  matchId: string
  game?: 'lol' | 'cs2'
  timeline?: Record<string, unknown>
  recordings?: Array<Record<string, unknown>>
  user?: { tier: string; is_admin: boolean; analysis_stats: { total: number; limit: number | null; purchased?: number } } | null
  analyse?: () => Promise<{ ok?: boolean; error?: string; code?: string }>
  /** Extra top-level fields on the API's report response (e.g. focus_checks). */
  report?: Record<string, unknown>
}
async function mountReport(setup: Setup) {
  const analyse = vi.fn(setup.analyse ?? (async () => ({ ok: true })))
  const trackMatchReport = vi.fn(async () => ({ ok: true }))
  const startCheckout = vi.fn(async () => ({ ok: true }))
  const getAnalysisTimeline = vi.fn(async () => ({ analysisId: 42 }))
  const push = vi.fn(async () => {})
  const listeners: Record<string, () => void> = {}
  const recordings = setup.recordings ?? []
  // Fresh copies on every call, like the real bridge (rows cross the process boundary as copies).
  const listAll = vi.fn(async () => recordings.map(r => ({ ...r })))
  vi.stubGlobal('window', {
    history: { length: 2 },
    api: {
      app: {
        getMatchReport: async () => ({ ok: true, report: reportFor(setup.matchId, setup.report) }),
        getGameMatchReport: async () => ({ ok: false, error: 'not_found' }),
        startCheckout,
      },
      recordings: { listAll, getTimeline: async () => setup.timeline ?? null, analyse },
      analyses: { getTimeline: getAnalysisTimeline },
      coachFlow: { allowances: async () => null, moments: async () => null, onUpdate: () => () => {} },
      profile: { get: async () => (setup.user === null ? null : { user: setup.user ?? { tier: 'free', is_admin: false, analysis_stats: { total: 0, limit: 1 } } }) },
      funnel: { trackMatchReport, trackReportOpened: vi.fn(async () => ({ ok: true })) },
      on: (channel: string, cb: () => void) => { listeners[channel] = cb; return () => { delete listeners[channel] } },
    },
  })
  const route = vue.reactive({ params: { matchId: setup.matchId }, query: setup.game ? { game: setup.game } : {} })
  const { root, text } = await mountSfc(new URL('./MatchReportV3.vue', import.meta.url), {
    modules: { 'vue-router': { useRoute: () => route, useRouter: () => ({ push, back: vi.fn() }) } },
  })
  return { root, analyse, listAll, trackMatchReport, startCheckout, push, listeners, text }
}

afterEach(() => {
  unmountAll()
  vi.unstubAllGlobals()
})

describe('MatchReportV3: video coaching from the free report', () => {
  it('shows no video section when the match was not recorded, and still reports the open', async () => {
    const page = await mountReport({ matchId: 'mr3-none' })
    expect(page.text()).toContain('You died first in 8 rounds and won 1 of them.')
    expect(page.text()).not.toContain('Video coaching')
    expect(page.text()).not.toContain('Watch →')
    expect(page.trackMatchReport.mock.calls).toEqual([['opened', { game: 'valorant', video: 'none' }]])
  })

  it('offers video coaching for a recorded match, says what it costs, and starts it on press', async () => {
    const rows = [{ id: 'rec-1', matchId: 'mr3-start', hasLocalFile: true, analysisReadiness: READY }]
    const page = await mountReport({ matchId: 'mr3-start', recordings: rows })
    expect(page.text()).toContain('Video coaching')
    expect(page.text()).toContain('Upload it and your coach watches it on video. Uses 1 analysis (1 analysis left).')
    expect(page.trackMatchReport.mock.calls).toEqual([['opened', { game: 'valorant', video: 'start' }]])
    expect(page.analyse).not.toHaveBeenCalled()

    ;(pressable(page.root, 'Get video coaching')!.props.onClick as () => void)()
    await settle()
    expect(page.analyse.mock.calls).toEqual([['rec-1']])
    expect(page.trackMatchReport.mock.calls[1]).toEqual(['video_clicked', { game: 'valorant', video: 'start' }])
    // Held while the upload gets going: no second button, no plans prompt.
    expect(page.text()).toContain('Sending this match to your coach…')
    expect(pressable(page.root, 'Get video coaching')).toBeUndefined()

    // The recording reports the upload, then the finished analysis.
    Object.assign(rows[0]!, { pipelineStatus: 'uploading' })
    page.listeners['recordings:updated']!()
    await settle()
    expect(page.text()).toContain('Uploading this match for video coaching…')
    Object.assign(rows[0]!, { pipelineStatus: undefined, analysisId: 42 })
    page.listeners['recordings:updated']!()
    await settle()
    expect(page.text()).toContain('Your coach watched this match on video.')
    expect(pressable(page.root, 'Open video coaching')).toBeDefined()
  })

  it('shows the app’s reason instead of a button when it refuses to start', async () => {
    const rows = [{ id: 'rec-1', matchId: 'mr3-refused', hasLocalFile: true, analysisReadiness: READY }]
    const page = await mountReport({
      matchId: 'mr3-refused',
      recordings: rows,
      analyse: async () => ({ error: 'Still getting Riot match data.', code: 'not_ready' }),
    })
    ;(pressable(page.root, 'Get video coaching')!.props.onClick as () => void)()
    await settle()
    expect(page.text()).toContain('Still getting Riot match data.')
    expect(page.text()).not.toContain('Sending this match to your coach…')
  })

  it('points to plans, and never starts an upload, when the plan has no analyses left', async () => {
    const rows = [{ id: 'rec-1', matchId: 'mr3-upgrade', hasLocalFile: true, analysisReadiness: READY }]
    const page = await mountReport({
      matchId: 'mr3-upgrade',
      recordings: rows,
      user: { tier: 'free', is_admin: false, analysis_stats: { total: 1, limit: 1 } },
    })
    expect(page.text()).toContain('Your plan has no video analyses left.')
    expect(pressable(page.root, 'Get video coaching')).toBeUndefined()
    ;(pressable(page.root, 'See plans')!.props.onClick as () => void)()
    await settle()
    expect(page.analyse).not.toHaveBeenCalled()
    expect(page.startCheckout).toHaveBeenCalledWith({ kind: 'browse' }, 'match_report_video')
    expect(page.trackMatchReport.mock.calls[1]).toEqual(['video_clicked', { game: 'valorant', video: 'upgrade' }])
  })

  it('repeats why a recording cannot be sent yet, with nothing to press', async () => {
    const message = 'Still getting Riot match data. Analyse unlocks when ready (usually about a minute). Keep Valorant / Riot Client open.'
    const rows = [{ id: 'rec-1', matchId: 'mr3-wait', hasLocalFile: true, analysisReadiness: { ready: false, state: 'syncing', message, duelMomentCount: 0 } }]
    const page = await mountReport({ matchId: 'mr3-wait', recordings: rows })
    expect(page.text()).toContain(message)
    expect(pressable(page.root, 'Get video coaching')).toBeUndefined()
  })

  it('links "Rounds to rewatch" to the recording at that round, without starting an AI round review', async () => {
    const rows = [{ id: 'rec-1', matchId: 'mr3-watch', hasLocalFile: true, analysisReadiness: READY }]
    const page = await mountReport({ matchId: 'mr3-watch', recordings: rows })
    expect(page.text()).toContain('R7 Died 1 second in to an Operator.')
    ;(pressable(page.root, 'Watch →')!.props.onClick as () => void)()
    await settle()
    expect(page.push.mock.calls).toEqual([[{ path: '/vod-review', query: { id: 'rec-1', round: '7' } }]])
  })

  it('other games keep the report as it was: no recording lookup, no video section, no event without a report', async () => {
    const rows = [{ id: 'rec-1', matchId: 'mr3-lol', hasLocalFile: true, analysisReadiness: READY }]
    const page = await mountReport({ matchId: 'mr3-lol', game: 'lol', recordings: rows })
    expect(page.listAll).not.toHaveBeenCalled()
    expect(page.text()).toContain('No report for this match yet')
    expect(page.text()).not.toContain('Video coaching')
    expect(page.trackMatchReport).not.toHaveBeenCalled()
  })

  it('shows how the match counted for each focus the player is working on', async () => {
    const page = await mountReport({
      matchId: 'mr3-focuses',
      report: { focus_checks: [
        { focus_id: 1, metric: 'opening_death_rate', label: 'Opening deaths', better: 'lower', unit: 'share_of_rounds', target: 0.24, value: 0.1, hit: true, status: 'active' },
        { focus_id: 2, metric: 'traded_death_rate', label: 'Deaths traded', better: 'higher', unit: 'share_of_deaths', target: 0.35, value: 0.1, hit: false, status: 'missed' },
      ] },
    })
    expect(page.text()).toContain('Your focuses Opening deaths 10% of rounds · target at most 24% On target this match Deaths traded 10% of deaths · target at least 35% Missed this match')
  })
})

describe('local CS2 result-view activation', () => {
  it('sends the actual local result identity only once the parsed report is visible', async () => {
    const page = await mountReport({ matchId: 'local-cs2-activation', game: 'cs2', timeline: {
      map: 'de_mirage', match_stats: { schema_version: 1, rounds: 22, score: '9-13',
        player_stats: { kills: 14, deaths: 17, assists: 3 }, round_stats: {}, utility_stats: {}, economy_stats: {} },
    } })
    await settle()
    expect(page.trackMatchReport).toHaveBeenCalledWith('opened', { game: 'cs2', video: 'none', result_id: 'local-cs2-activation' })
  })
  it('does not claim a viewed result when the local demo is still unavailable', async () => {
    const page = await mountReport({ matchId: 'local-cs2-missing', game: 'cs2', timeline: { map: 'de_mirage', match_stats: null } })
    await settle()
    expect(page.trackMatchReport).not.toHaveBeenCalled()
  })
})
