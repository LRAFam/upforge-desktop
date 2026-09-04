import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import tls from 'tls'
import { EventEmitter } from 'events'
vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir(), getAppPath: () => os.tmpdir(), isPackaged: false }, nativeImage: {} }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
import { OBSRecorder } from './obs-recorder'
import { RecordingsStore } from './recordings-store'
import { FfmpegProgressParser } from './ffmpeg-progress'
import { backgroundWork } from './background-work'
import { RiotLocalApi } from './riot-local-api'

afterEach(() => { vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); backgroundWork.configure(() => false) })

describe('performance cleanup regressions', () => {
  it('still reconnects an unexpectedly closed Riot socket while tracking', async () => {
    vi.useFakeTimers()
    const sockets: EventEmitter[] = []
    vi.spyOn(tls, 'connect').mockImplementation(() => {
      const socket = Object.assign(new EventEmitter(), { destroy: vi.fn(), write: vi.fn() })
      sockets.push(socket)
      return socket as never
    })
    const riot = Object.create(RiotLocalApi.prototype)
    Object.assign(riot, { wsGeneration: 0, lockfileData: { port: 1234, password: 'fake' }, matchData: {}, matchEnded: false })
    riot._connectWebSocket()
    sockets[0]!.emit('close')
    await vi.advanceTimersByTimeAsync(5000)
    expect(sockets).toHaveLength(2)
    riot._disconnectWebSocket()
    sockets[1]!.emit('close')
    await vi.advanceTimersByTimeAsync(6000)
    expect(sockets).toHaveLength(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('allows one OBS kill poll at a time and ignores results from a stopped session', async () => {
    const obs = Object.create(OBSRecorder.prototype)
    let resolvePoll!: (value: unknown) => void
    const request = vi.fn(() => new Promise(resolve => { resolvePoll = resolve }))
    Object.assign(obs, {
      _liveKillGeneration: 0, _killPollInFlight: null, _matchOwnedRecording: true,
      _startedAt: Date.now(), _localPlayerName: 'Player', _seenKillIds: new Set(),
      _liveKillStamps: [], _riotGet: request,
    })
    const polling = obs._pollKillEvents()
    await obs._pollKillEvents()
    expect(request).toHaveBeenCalledOnce()
    obs._stopLiveKillPoll()
    resolvePoll({ Events: [{ EventName: 'Kill', EventID: 1, KillerName: 'Player', EventTime: 10 }] })
    await polling
    expect(obs._liveKillStamps).toEqual([])
    obs._localPlayerName = 'Player'
    const nextPoll = obs._pollKillEvents()
    resolvePoll({ Events: [] })
    await nextPoll
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does not reconnect a Riot socket during or after manual stop', async () => {
    vi.useFakeTimers()
    const sockets: Array<EventEmitter & { destroyed: boolean; destroy: () => void }> = []
    vi.spyOn(tls, 'connect').mockImplementation(() => {
      const socket = Object.assign(new EventEmitter(), {
        destroyed: false,
        destroy() { socket.destroyed = true; queueMicrotask(() => socket.emit('close')) },
        write: vi.fn(),
      })
      sockets.push(socket)
      return socket as never
    })
    const riot = Object.create(RiotLocalApi.prototype)
    let finishRefresh!: () => void
    Object.assign(riot, {
      wsGeneration: 0, lockfileData: { port: 1234, password: 'fake' },
      matchData: { matchId: 'test', killEvents: [], roundSummaries: [] },
      matchEnded: false, region: 'eu', accessToken: 'fake', entitlementsToken: 'fake',
      _refreshTokens: () => new Promise<void>(resolve => { finishRefresh = resolve }),
      _fetchMatchDetailsWithRetries: async () => true,
    })
    riot._connectWebSocket()
    const stopping = riot.stop()
    await vi.advanceTimersByTimeAsync(6000)
    expect(sockets).toHaveLength(1)
    finishRefresh()
    await stopping
    expect(riot.matchData).toBeNull()
    expect(sockets[0]!.destroyed).toBe(true)
    expect(riot.wsSocket).toBeNull()
  })

  it('ignores a late OBS probe and releases the next session timer', async () => {
    vi.useFakeTimers()
    const obs = Object.create(OBSRecorder.prototype)
    let resolveProbe!: (v: unknown) => void
    Object.assign(obs, {
      _liveKillGeneration: 0, _seenKillIds: new Set(), _liveKillPollTimer: null,
      _riotGet: () => new Promise(resolve => { resolveProbe = resolve }),
      _fetchLocalPlayerName: vi.fn(), _pollKillEvents: vi.fn(),
    })
    obs._startLiveKillPoll()
    obs._stopLiveKillPoll()
    resolveProbe({})
    await Promise.resolve()
    expect(vi.getTimerCount()).toBe(0)
    obs._startLiveKillPoll()
    resolveProbe({})
    await Promise.resolve()
    expect(vi.getTimerCount()).toBe(1)
    obs._stopLiveKillPoll()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(4000)
    expect(obs._pollKillEvents).not.toHaveBeenCalled()
  })

  it('keeps upload and analysis progress in memory without rewriting the catalogue', () => {
    const store = Object.create(RecordingsStore.prototype)
    store.userId = 1
    store.filePath = path.join(os.tmpdir(), 'audit-recordings.json')
    store.recordings = [{ id: 'target', timeline: { example: 'x'.repeat(1024 * 1024) } }]
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined)
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
    for (let i = 0; i < 10; i++) store.setUploadProgress('target', 50)
    expect(write).not.toHaveBeenCalled()
    expect(store.recordings[0].uploadProgress).toBe(50)
    store.setAnalysisProgress('target', 30, 'review')
    expect(store.recordings[0].analysisProgress).toBe(30)
    expect(write).not.toHaveBeenCalled()
    store.markArchived('target', 'archive-id')
    expect(write).toHaveBeenCalledOnce()
  })

  it('parses split FFmpeg records incrementally without retaining historical logs', () => {
    const parser = new FfmpegProgressParser()
    expect(parser.push('Dura')).toBeNull()
    expect(parser.push('tion: 01:00:00.00\nframe=1 time=00:')).toBeNull()
    expect(parser.push('36:00.00\r')).toBe(60)
    for (let i = 0; i < 10000; i++) expect(parser.push('frame=1 time=00:36:00.00\r')).toBe(60)
    const internals = parser as unknown as { pending: string }
    expect(internals.pending).toBe('')
    parser.push('x'.repeat(50000))
    expect(internals.pending.length).toBeLessThanOrEqual(4096)
    expect(parser.push('\nframe=2 time=00:54:00.00\n')).toBe(90)
  })
})
