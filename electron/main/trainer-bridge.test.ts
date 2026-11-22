import { EventEmitter } from 'events'
import { readFileSync } from 'fs'
import net from 'net'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/tmp' }, BrowserWindow: class {} }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { getFreePort, parseTrainerLine, resolveTrainerSpawn, TrainerBridge, TrainerLaunchError, trainerLaunchErrorMessage, type DrillConfig, type TrainerSessionEnded } from './trainer-bridge'

class FakeProc extends EventEmitter {
  stderr = new EventEmitter()
  exitCode: number | null = null
  killed = false
  kill() {
    this.killed = true
    setImmediate(() => this.emit('exit', null))
    return true
  }
}

const config: DrillConfig = { scenario: 'flick', duration_seconds: 60, difficulty: 'medium', user_drill_id: 7 }
const servers: net.Server[] = []
afterEach(() => { for (const s of servers.splice(0)) s.close() })

function setup(opts: { godot?: (port: number, proc: FakeProc) => void; connectTimeoutMs?: number; nextDrillReuseMs?: number } = {}) {
  const sent: Array<{ channel: string; args: unknown[] }> = []
  const procs: Array<{ proc: FakeProc; args: string[] }> = []
  const win = {
    webContents: { send: (channel: string, ...args: unknown[]) => sent.push({ channel, args }) },
    isDestroyed: () => false, isMinimized: () => true, restore: vi.fn(), show: vi.fn(), focus: vi.fn(),
  }
  const bridge = new TrainerBridge(() => win as never, undefined, {
    resolveSpawnArgs: () => ({ cmd: 'godot', args: ['--path', '/p'] }),
    connectTimeoutMs: opts.connectTimeoutMs ?? 2000,
    connectRetryMs: 20,
    ...(opts.nextDrillReuseMs !== undefined ? { nextDrillReuseMs: opts.nextDrillReuseMs } : {}),
    spawn: ((_cmd: string, args: string[]) => {
      const proc = new FakeProc()
      procs.push({ proc, args })
      const port = Number(args.find(a => a.startsWith('--upforge-port='))!.split('=')[1])
      opts.godot?.(port, proc)
      return proc
    }) as never,
  })
  const ended = () => sent.filter(s => s.channel === 'trainer:session-ended').map(s => s.args[0] as TrainerSessionEnded)
  const results = () => sent.filter(s => s.channel === 'trainer:session-result')
  const on = (channel: string) => sent.filter(s => s.channel === channel).map(s => s.args[0])
  return { bridge, sent, procs, ended, results, on, win }
}

/** A fake Godot: listens on the given port, records the config it gets, lets the test write lines. */
function fakeGodot(port: number) {
  const state: { socket: net.Socket | null; configs: string[] } = { socket: null, configs: [] }
  const server = net.createServer((sock) => {
    state.socket = sock
    sock.on('data', d => state.configs.push(d.toString()))
  })
  servers.push(server)
  setTimeout(() => server.listen(port, '127.0.0.1'), 60) // cold start: not listening straight away
  return state
}

const until = async (fn: () => boolean, ms = 2000) => {
  const t = Date.now()
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error('timeout')
    await new Promise(r => setTimeout(r, 10))
  }
}

describe('parseTrainerLine', () => {
  it('separates lifecycle events from results', () => {
    expect(parseTrainerLine('{"event":"aborted","reason":"user_exit","scenario":"flick"}')).toEqual({ kind: 'event', event: 'aborted', reason: 'user_exit', scenario: 'flick' })
    expect(parseTrainerLine('{"scenario":"flick","score":50}')).toMatchObject({ kind: 'result' })
    expect(parseTrainerLine('nope')).toBeNull()
    expect(parseTrainerLine('[1]')).toBeNull()
  })
})

describe('TrainerBridge', () => {
  it('picks a free port and passes it after `--` (dev editor args kept)', async () => {
    const port = await getFreePort()
    expect(port).toBeGreaterThan(0)
    let godot: ReturnType<typeof fakeGodot> | null = null
    const { bridge, procs } = setup({ godot: p => { godot = fakeGodot(p) } })
    await bridge.launch(config)
    expect(procs[0].args.slice(0, 3)).toEqual(['--path', '/p', '--'])
    expect(procs[0].args[3]).toMatch(/^--upforge-port=\d+$/)
    await until(() => godot!.configs.length > 0)
    expect(JSON.parse(godot!.configs[0])).toMatchObject({ scenario: 'flick', user_drill_id: 7 })
    bridge.kill()
  })

  it('starts the trainer in a window when that was chosen (the trainer reads it from its command line)', async () => {
    const { bridge, procs } = setup({ godot: p => { fakeGodot(p) } })
    await bridge.launch(config, { windowed: true })
    expect(procs[0].args.slice(2)).toEqual(['--', expect.stringMatching(/^--upforge-port=\d+$/), '--upforge-windowed'])
    bridge.kill()
    await bridge.launch(config)
    expect(procs[1].args).not.toContain('--upforge-windowed')
    bridge.kill()
  })

  it('forwards results with their launch, never events; one session-ended per launch', async () => {
    let godot: ReturnType<typeof fakeGodot> | null = null
    const { bridge, ended, results, procs } = setup({ godot: p => { godot = fakeGodot(p) } })
    const onResult = vi.fn()
    bridge.setResultCallback(onResult)
    await bridge.launch(config)
    await until(() => !!godot!.socket)
    godot!.socket!.write('{"scenario":"flick","score":61,"metadata":{"scoring_version":3}}\n')
    await until(() => results().length === 1)
    expect(results()[0].args[1]).toMatchObject({ scenario: 'flick', user_drill_id: 7, difficulty: 'medium' })
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ score: 61 }), expect.objectContaining({ user_drill_id: 7 }))
    procs[0].proc.emit('exit', 0)
    await until(() => ended().length === 1)
    expect(ended()).toEqual([expect.objectContaining({ reason: 'completed', scenario: 'flick' })])

    await bridge.launch({ ...config, user_drill_id: undefined })
    await until(() => !!godot!.socket && godot!.configs.length > 0)
    godot!.socket!.write('{"event":"aborted","reason":"unknown_scenario","scenario":"flick","message":"nope"}\n')
    await until(() => ended().length === 2)
    expect(ended()[1]).toMatchObject({ reason: 'unknown_scenario', message: 'nope' })
    expect(results()).toHaveLength(1)
    procs[1].proc.emit('exit', 0)
    await new Promise(r => setTimeout(r, 30))
    expect(ended()).toHaveLength(2)
  })

  it('a late exit of the old process does not clear the new launch', async () => {
    const { bridge, procs, ended } = setup({ godot: p => { fakeGodot(p) } })
    await bridge.launch(config)
    const first = procs[0].proc
    first.kill = () => { first.killed = true; return true } // exit arrives late, after the relaunch
    await bridge.launch(config)
    first.emit('exit', null)
    await new Promise(r => setTimeout(r, 30))
    expect(ended().map(e => e.reason)).toEqual(['user_exit'])
    bridge.kill()
    expect(procs[1].proc.killed).toBe(true) // Stop still reaches the current trainer
    expect(ended().map(e => e.reason)).toEqual(['user_exit', 'user_exit'])
  })

  it('reports a crash when the trainer exits without a result', async () => {
    const { bridge, procs, ended } = setup({ godot: p => { fakeGodot(p) } })
    await bridge.launch(config)
    procs[0].proc.emit('exit', 1)
    await until(() => ended().length === 1)
    expect(ended()[0]).toMatchObject({ reason: 'crashed', exitCode: 1 })
  })

  it('kills the process and reports launch_failed when it cannot connect', async () => {
    const { bridge, procs, ended } = setup({ connectTimeoutMs: 150 })
    await expect(bridge.launch(config)).rejects.toThrow(/connect/)
    expect(procs[0].proc.killed).toBe(true)
    expect(ended()).toEqual([expect.objectContaining({ reason: 'launch_failed' })])
  })

  it('turns a spawn error into launch_failed instead of an uncaught exception', async () => {
    const { bridge, ended } = setup({ godot: (_p, proc) => setImmediate(() => proc.emit('error', Object.assign(new Error('spawn EACCES'), { code: 'EACCES' }))) })
    await expect(bridge.launch(config)).rejects.toThrow('spawn EACCES')
    expect(ended()).toEqual([expect.objectContaining({ reason: 'launch_failed', message: 'spawn EACCES' })])
  })

  it('stops retrying as soon as the trainer exits before connecting (port bind failure)', async () => {
    const { bridge, ended } = setup({ connectTimeoutMs: 5000, godot: (_p, proc) => setTimeout(() => proc.emit('exit', 2), 30) })
    const t = Date.now()
    await expect(bridge.launch(config)).rejects.toThrow(/port/)
    expect(Date.now() - t).toBeLessThan(1000)
    expect(ended()[0]).toMatchObject({ reason: 'launch_failed' })
  })

  it('its own launch failures are already plain player messages', async () => {
    const { bridge } = setup({ connectTimeoutMs: 150 })
    const err = await bridge.launch(config).catch(e => e)
    expect(err).toBeInstanceOf(TrainerLaunchError)
    expect(trainerLaunchErrorMessage(err, true)).toBe(err.message)
  })

  it('closing the trainer for a game or a match ends the drill with that reason, not a silent user_exit', async () => {
    const { bridge, ended } = setup({ godot: p => { fakeGodot(p) } })
    await bridge.launch(config)
    bridge.kill('match_started')
    await bridge.launch(config)
    bridge.kill('game_started')
    expect(ended().map(e => e.reason)).toEqual(['match_started', 'game_started'])
  })
})

describe('a trainer that stays open between runs (keep_open)', () => {
  const open: DrillConfig = { ...config, keep_open: true, next_scenario: 'tracking' }
  const result = (scenario: string, score: number) => `{"scenario":"${scenario}","score":${score},"completed_at":"2026-11-22T19:00:${String(score).padStart(2, '0')}"}\n`
  /** Each launch message the fake trainer got, parsed (TCP may join or split them). */
  const configsOf = (godot: ReturnType<typeof fakeGodot>) => godot.configs.join('').split('\n').filter(Boolean).map(l => JSON.parse(l))
  const pause = (ms = 40) => new Promise(r => setTimeout(r, ms))

  it('a result ends its launch once and the window stays open; a launch the trainer did not ask for starts a fresh one', async () => {
    let godot: ReturnType<typeof fakeGodot> | null = null
    const { bridge, ended, results, procs } = setup({ godot: p => { godot = fakeGodot(p) } })
    await bridge.launch(open)
    await until(() => !!godot!.socket)
    godot!.socket!.write(result('flick', 61))
    await until(() => results().length === 1)
    expect(results()[0].args[1]).toMatchObject({ launchId: 1, keep_open: true, user_drill_id: 7 })
    expect(ended()).toEqual([expect.objectContaining({ launchId: 1, reason: 'completed' })])
    expect(procs[0].proc.killed).toBe(false)
    expect(bridge.isRunning).toBe(true) // open on its end card: the warm-up offer and game start still see it
    // A second result with no run started for it is never forwarded.
    godot!.socket!.write(result('flick', 62))
    await pause()
    expect(results()).toHaveLength(1)
    // Play again in the app while the trainer waits on its end card (it did not ask): a fresh trainer, no extra end.
    await bridge.launch(open)
    expect(procs).toHaveLength(2)
    expect(procs[0].proc.killed).toBe(true)
    expect(ended()).toHaveLength(1)
    bridge.kill()
  })

  it('R on the end card is a new launch of the same drill: trainer:run-started, then its own result, saved once', async () => {
    let godot: ReturnType<typeof fakeGodot> | null = null
    const { bridge, ended, results, procs, on } = setup({ godot: p => { godot = fakeGodot(p) } })
    const onResult = vi.fn()
    const onRunStarted = vi.fn()
    bridge.setResultCallback(onResult)
    bridge.setRunStartedCallback(onRunStarted)
    await bridge.launch(open)
    await until(() => !!godot!.socket)
    godot!.socket!.write(result('flick', 61))
    await until(() => results().length === 1)
    godot!.socket!.write('{"event":"run_started","reason":"restart","scenario":"flick"}\n')
    await until(() => on('trainer:run-started').length === 1)
    const again = on('trainer:run-started')[0]
    expect(again).toMatchObject({ launchId: 2, repeat_of: 1, scenario: 'flick', keep_open: true, user_drill_id: 7, difficulty: 'medium', duration_seconds: 60 })
    expect(onRunStarted).toHaveBeenCalledWith(again)
    expect(bridge.lastLaunch).toEqual(again)
    godot!.socket!.write(result('flick', 70))
    await until(() => results().length === 2)
    expect(results()[1].args[1]).toEqual(again)
    expect(onResult).toHaveBeenCalledTimes(2)
    expect(onResult.mock.calls.map(([r, l]) => [r.score, l.launchId])).toEqual([[61, 1], [70, 2]])
    expect(ended().map(e => [e.launchId, e.reason])).toEqual([[1, 'completed'], [2, 'completed']])
    expect(procs).toHaveLength(1)
    expect(configsOf(godot!)).toHaveLength(1) // the trainer started it itself: nothing was sent
    bridge.kill()
  })

  it('R in the middle of a run is the same launch: no new launch, one result', async () => {
    let godot: ReturnType<typeof fakeGodot> | null = null
    const { bridge, ended, results, on } = setup({ godot: p => { godot = fakeGodot(p) } })
    await bridge.launch(open)
    await until(() => !!godot!.socket)
    godot!.socket!.write('{"event":"run_started","reason":"restart","scenario":"flick"}\n')
    await pause()
    expect(on('trainer:run-started')).toHaveLength(0)
    godot!.socket!.write(result('flick', 55))
    await until(() => results().length === 1)
    expect(results()[0].args[1]).toMatchObject({ launchId: 1 })
    expect(ended().map(e => [e.launchId, e.reason])).toEqual([[1, 'completed']])
    bridge.kill()
  })

  it('N on the end card: the next drill goes to the same window on the same socket, as a new launch', async () => {
    let godot: ReturnType<typeof fakeGodot> | null = null
    const { bridge, ended, results, procs, on } = setup({ godot: p => { godot = fakeGodot(p) } })
    await bridge.launch(open)
    await until(() => !!godot!.socket)
    godot!.socket!.write(result('flick', 61))
    await until(() => results().length === 1)
    godot!.socket!.write('{"event":"next_drill","scenario":"flick","next":"tracking"}\n')
    await until(() => on('trainer:next-drill').length === 1)
    expect(on('trainer:next-drill')[0]).toEqual({ launchId: 1, scenario: 'flick', next: 'tracking' })
    const next: DrillConfig = { scenario: 'tracking', duration_seconds: 30, difficulty: 'easy', keep_open: true }
    await bridge.launch(next)
    expect(procs).toHaveLength(1)
    expect(procs[0].proc.killed).toBe(false)
    await until(() => configsOf(godot!).length === 2)
    expect(configsOf(godot!)[1]).toMatchObject({ scenario: 'tracking', duration_seconds: 30, keep_open: true, _upforge_meta: expect.any(Object) })
    expect(bridge.lastLaunch).toMatchObject({ launchId: 2, scenario: 'tracking', keep_open: true })
    expect(bridge.lastLaunch).not.toHaveProperty('repeat_of')
    godot!.socket!.write(result('tracking', 48))
    await until(() => results().length === 2)
    expect(results()[1].args[1]).toMatchObject({ launchId: 2, scenario: 'tracking' })
    expect(ended().map(e => [e.launchId, e.reason])).toEqual([[1, 'completed'], [2, 'completed']])
    // Each N is good for one launch: the one after it starts a fresh trainer.
    await bridge.launch(next)
    expect(procs).toHaveLength(2)
    bridge.kill()
  })

  it('the open window is used only right after N, and only after a result', async () => {
    let godot: ReturnType<typeof fakeGodot> | null = null
    const { bridge, results, procs, ended } = setup({ nextDrillReuseMs: 30, godot: p => { godot = fakeGodot(p) } })
    await bridge.launch(open)
    await until(() => !!godot!.socket)
    // N in the middle of a run (the trainer never sends it there) counts for nothing.
    godot!.socket!.write('{"event":"next_drill","scenario":"flick","next":"tracking"}\n')
    await pause()
    await bridge.launch(open)
    expect(procs).toHaveLength(2)
    expect(ended().map(e => e.reason)).toEqual(['user_exit'])
    await until(() => !!godot!.socket && configsOf(godot!).length > 0)
    godot!.socket!.write(result('flick', 61))
    await until(() => results().length === 1)
    godot!.socket!.write('{"event":"next_drill","scenario":"flick","next":"tracking"}\n')
    await pause(80) // longer than the reuse window: the player may have gone back to UpForge meanwhile
    await bridge.launch(open)
    expect(procs).toHaveLength(3)
    bridge.kill()
  })

  it('Esc on the end card brings UpForge forward, and the trainer closing then is not a crash', async () => {
    let godot: ReturnType<typeof fakeGodot> | null = null
    const { bridge, ended, results, procs, win } = setup({ godot: p => { godot = fakeGodot(p) } })
    await bridge.launch(open)
    await until(() => !!godot!.socket)
    godot!.socket!.write(result('flick', 61))
    await until(() => results().length === 1)
    godot!.socket!.write('{"event":"back_to_app","scenario":"flick"}\n')
    await until(() => win.focus.mock.calls.length === 1)
    expect(win.restore).toHaveBeenCalled()
    expect(win.show).toHaveBeenCalled()
    procs[0].proc.emit('exit', 0)
    await pause()
    expect(ended().map(e => e.reason)).toEqual(['completed'])
    expect(bridge.isRunning).toBe(false)
  })

  it('a crash on the end card ends nothing more; a crash in a run started with R ends that run', async () => {
    let godot: ReturnType<typeof fakeGodot> | null = null
    const { bridge, ended, results, procs, on } = setup({ godot: p => { godot = fakeGodot(p) } })
    await bridge.launch(open)
    await until(() => !!godot!.socket)
    godot!.socket!.write(result('flick', 61))
    await until(() => results().length === 1)
    godot!.socket!.write('{"event":"run_started","reason":"restart","scenario":"flick"}\n')
    await until(() => on('trainer:run-started').length === 1)
    procs[0].proc.emit('exit', 1)
    await until(() => ended().length === 2)
    expect(ended().map(e => [e.launchId, e.reason])).toEqual([[1, 'completed'], [2, 'crashed']])
    bridge.kill()
  })

  it('a trainer launched without keep_open gets no second run and no next drill (the warm-up offer, older trainers)', async () => {
    let godot: ReturnType<typeof fakeGodot> | null = null
    const { bridge, results, procs, on, ended } = setup({ godot: p => { godot = fakeGodot(p) } })
    await bridge.launch(config)
    await until(() => !!godot!.socket)
    godot!.socket!.write(result('flick', 61))
    await until(() => results().length === 1)
    expect(results()[0].args[1]).not.toHaveProperty('keep_open')
    godot!.socket!.write('{"event":"run_started","reason":"restart","scenario":"flick"}\n{"event":"next_drill","scenario":"flick"}\n')
    await pause()
    expect(on('trainer:run-started')).toHaveLength(0)
    expect(on('trainer:next-drill')).toHaveLength(0)
    godot!.socket!.write(result('flick', 62))
    await pause()
    expect(results()).toHaveLength(1)
    await bridge.launch({ ...config, keep_open: true })
    expect(procs).toHaveLength(2)
    expect(ended().map(e => e.reason)).toEqual(['completed'])
    bridge.kill()
  })
})

describe('resolveTrainerSpawn', () => {
  const trainerPath = '/app/resources/trainer/upforge-trainer'
  const base = { trainerPath, appPath: '/app/resources/app.asar', exists: (_p: string) => false }

  it('uses the bundled trainer when it is there', () => {
    expect(resolveTrainerSpawn({ ...base, packaged: true, platform: 'win32', exists: p => p === trainerPath })).toEqual({ cmd: trainerPath, args: [] })
  })

  it('a packaged app with the trainer missing says so plainly and never falls back to the Godot editor', () => {
    for (const platform of ['win32', 'darwin', 'linux'] as const) {
      // Godot installed on the machine (a developer's Mac) must not matter for a packaged build.
      const run = () => resolveTrainerSpawn({ ...base, packaged: true, platform, exists: p => /godot/i.test(p) })
      expect(run, platform).toThrow(TrainerLaunchError)
      expect(run, platform).toThrow('The aim trainer is missing from your UpForge install. Reinstall UpForge to restore it.')
    }
  })

  it('development builds keep the developer fallbacks', () => {
    const godot = '/Applications/Godot.app/Contents/MacOS/Godot'
    expect(resolveTrainerSpawn({ ...base, packaged: false, platform: 'darwin', exists: p => p === godot }))
      .toEqual({ cmd: godot, args: ['--path', path.resolve('/app/resources/app.asar', '..', 'upforge-trainer')] })
    expect(() => resolveTrainerSpawn({ ...base, packaged: false, platform: 'win32' })).toThrow(/export the Godot project/)
  })
})

describe('trainerLaunchErrorMessage', () => {
  const sysErr = (code: string) => Object.assign(new Error(`spawn ${code}`), { code })

  it('maps each launch failure to plain text with one action', () => {
    expect(trainerLaunchErrorMessage(sysErr('ENOENT'), true)).toBe('The aim trainer is missing from your UpForge install. Reinstall UpForge to restore it.')
    for (const code of ['EACCES', 'EPERM', 'UNKNOWN']) {
      expect(trainerLaunchErrorMessage(sysErr(code), true), code).toBe('Your antivirus or security settings blocked the aim trainer. Allow UpForge in your antivirus, then try again.')
    }
    expect(trainerLaunchErrorMessage(new Error('Could not pick a free port'), true)).toBe('The aim trainer did not start. Try again, or restart UpForge.')
  })

  it('never shows file paths or developer steps in a packaged app; development builds keep the detail', () => {
    const dev = new Error('Godot engine not found. Install from godotengine.org or: brew install godot')
    expect(trainerLaunchErrorMessage(dev, true)).not.toMatch(/Godot|brew|\//)
    expect(trainerLaunchErrorMessage(dev, false)).toBe(dev.message)
  })
})

describe('the app closes the trainer for a game with a reason the player is told', () => {
  it('index.ts never kills the trainer with the silent default reason', () => {
    const src = readFileSync(path.join(__dirname, 'index.ts'), 'utf8')
    expect(src).not.toMatch(/trainerBridge\.kill\(\)/)
    expect(src).toMatch(/trainerBridge\.kill\('game_started'\)/)
    expect(src).toMatch(/trainerBridge\.kill\('match_started'\)/)
  })
})
