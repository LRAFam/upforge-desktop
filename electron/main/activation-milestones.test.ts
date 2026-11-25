import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import type { AuthManager } from './auth-manager'
vi.mock('electron-log', () => ({ default: { debug: vi.fn() } }))
import { initFunnelEvents, trackDrillStarted, trackMatchRecorded, trackMatchReportOpened } from './funnel-events'

const uuid = 'fb7bb712-f306-4205-9c09-7e85c5d049bd'
function transport() {
  let user = 7
  const post = vi.fn(async (_path: string, _body: Record<string, unknown>, _config?: unknown) => ({}))
  initFunnelEvents({ getToken: () => `token-${user}`, getUser: () => ({ id: user }), getApi: () => ({ post }) } as unknown as AuthManager, 'test')
  return { post, switchAccount: () => { user = 8 } }
}
function sourceFunction(file: string, name: string) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  let text = ''
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) text = node.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!text) throw new Error(`Missing ${name}`)
  return ts.transpileModule(`${text}\nglobalThis.run = ${name}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
}

describe('account-owned activation milestones', () => {
  it('records each supported game with a stable recording identity and explicit original token', () => {
    const f = transport()
    for (const game of ['valorant', 'cs2', 'deadlock', 'lol']) trackMatchRecorded(game, uuid, 7)
    expect(f.post).toHaveBeenCalledTimes(4)
    expect(f.post).toHaveBeenCalledWith('/api/funnel-events', expect.objectContaining({
      event: 'match_recorded', channel: 'desktop', properties: { game: 'cs2', recording_id: uuid },
    }), { headers: { Authorization: 'Bearer token-7' } })
  })
  it('never attributes a prior account’s recording or launch to a new login', () => {
    const f = transport(); f.switchAccount()
    trackMatchRecorded('cs2', uuid, 7)
    trackDrillStarted('valorant', 'flick', uuid, 7)
    trackMatchRecorded('unknown', uuid, 8)
    trackMatchRecorded('valorant', '', 8)
    expect(f.post).not.toHaveBeenCalled()
  })
  it('records the local CS2 result view only with its actual result identity', () => {
    const f = transport()
    trackMatchReportOpened({ game: 'cs2', video: 'none', result_id: uuid })
    expect(f.post.mock.calls.map(call => (call[1] as any).event)).toEqual(['match_report_opened', 'first_result_viewed'])
    expect(f.post.mock.calls[1][1]).toEqual(expect.objectContaining({ properties: { game: 'cs2', result: 'local_match_report', result_id: uuid } }))
    f.post.mockClear()
    trackMatchReportOpened({ game: 'valorant', video: 'none', result_id: uuid })
    trackMatchReportOpened({ game: 'cs2', video: 'none' })
    expect(f.post.mock.calls.every(call => (call[1] as any).event === 'match_report_opened')).toBe(true)
  })
  it('telemetry delivery failure never rejects the recording or launch', async () => {
    const f = transport(); f.post.mockRejectedValue(new Error('offline'))
    expect(() => trackDrillStarted('valorant', 'flick', uuid, 7)).not.toThrow()
    await Promise.resolve()
  })
})

describe('real recording finalization hook', () => {
  const code = sourceFunction('./main-readiness.ts', 'refreshRecordingVodProbe')
  it.each([
    [{}, true, 10, 7, 1],
    [{}, false, 10, 7, 0],
    [{}, true, 0, 7, 0],
    [{}, true, 10, undefined, 0],
    [{ fileFinalizing: true }, true, 10, 7, 0],
    [{ clipsOnly: true }, true, 10, 7, 0],
    [{ orphanedImport: true }, true, 10, 7, 0],
    [{ onboardingAdminTest: true }, true, 10, 7, 0],
  ])('only reports usable nonempty actual-match files (%j)', async (patch, ok, size, owner, count) => {
    const track = vi.fn()
    const ctx = vm.createContext({ fs: { existsSync: () => true, statSync: () => ({ size }) },
      refreshVodProbe: async () => ({ ok }), clipExtractor: { probe: vi.fn() }, trackMatchRecorded: track })
    ctx.mainProcess = ctx
    vm.runInContext(code, ctx)
    await ctx.run({ id: uuid, game: 'cs2', path: 'saved.mkv', ...patch as object }, owner)
    expect(track).toHaveBeenCalledTimes(count as number)
    if (count) expect(track).toHaveBeenCalledWith('cs2', uuid, 7)
  })
})

describe('real trainer launch hook', () => {
  const code = sourceFunction('./ipc/gaming-ipc.ts', 'launchDrill')
  function fixture(fail = false) {
    const track = vi.fn(), taskStart = vi.fn(), appointmentStart = vi.fn()
    const ctx = vm.createContext({ trainerBridge: { launch: async () => { if (fail) throw new Error('could not start') }, lastLaunch: { launchId: 42 } },
      settingsManager: { get: () => ({}) }, drillConfigFromRequest: () => ({ scenario: 'flick', mouse_settings: { game: 'valorant' }, user_drill_id: 123 }),
      auth: { getUser: () => ({ id: 7 }) }, randomUUID: () => uuid, gameDetector: { currentGame: () => null }, trainerSpawnOptions: () => ({}),
      setLaunchOwner: vi.fn(), sendOverlayData: vi.fn(), trackDrillStarted: track, trackDiscordPracticeTaskStart: taskStart, trackPracticeAppointmentStart: appointmentStart, TRAINER_VERSION: 'test',
      log: { error: vi.fn() }, trainerLaunchErrorMessage: () => 'Could not launch', trainerLaunchGame: null })
    ctx.mainProcess = ctx
    vm.runInContext(code, ctx)
    return { track, taskStart, appointmentStart, ctx }
  }
  it('emits after a successful trainer connection/config send', async () => {
    const f = fixture()
    expect(await f.ctx.run({})).toMatchObject({ ok: true })
    expect(f.track).toHaveBeenCalledWith('valorant', 'flick', uuid, 7)
    expect(f.taskStart).toHaveBeenCalledWith(f.ctx.auth, 7, 123, uuid)
    expect(f.appointmentStart).toHaveBeenCalledWith(f.ctx.auth, 7, 123, uuid)
  })
  it('does not emit for a button press whose trainer launch fails', async () => {
    const f = fixture(true)
    expect(await f.ctx.run({})).toMatchObject({ ok: false })
    expect(f.track).not.toHaveBeenCalled()
    expect(f.taskStart).not.toHaveBeenCalled()
    expect(f.appointmentStart).not.toHaveBeenCalled()
  })
})
