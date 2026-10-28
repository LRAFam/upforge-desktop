import { afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ call: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), setup: vi.fn() }))
vi.mock('obs-websocket-js', () => ({ OBSWebSocket: class {
  call = mocks.call
  connect = mocks.connect
  disconnect = mocks.disconnect
  on = vi.fn()
} }))
vi.mock('electron', () => ({ app: { getPath: () => '/tmp', getAppPath: () => '/tmp' }, nativeImage: {} }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } }))
vi.mock('./obs-profile-installer', () => ({ ensureObsProfileInstalled: vi.fn(), resolveObsWebSocketPassword: () => '' }))
vi.mock('./obs-setup', () => ({ setupUpForgeScene: mocks.setup }))
import { OBSRecorder } from './obs-recorder'

afterEach(() => { vi.useRealTimers(); vi.resetAllMocks() })

describe('OBS connection lifecycle', () => {
  it('preserves an authentication failure instead of masking it with another host probe', async () => {
    mocks.connect
      .mockRejectedValueOnce(new Error('Authentication failed.'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
    mocks.disconnect.mockResolvedValue(undefined)
    const rec = new OBSRecorder(() => ({ host: '127.0.0.1', port: 4455, password: 'wrong', replayBufferSeconds: 0, obsPreserveActiveScene: false }))
    expect(await rec.connect()).toMatchObject({ ok: false, error: expect.stringContaining('password incorrect') })
    expect(mocks.connect).toHaveBeenCalledTimes(1)
    expect(mocks.setup).not.toHaveBeenCalled()
  })

  it('does not rebuild capture when OBS recording status cannot be read', async () => {
    mocks.connect.mockResolvedValue({ obsWebSocketVersion: '5.7.4' })
    mocks.disconnect.mockResolvedValue(undefined)
    mocks.call.mockImplementation(async (request) => {
      if (request === 'GetVersion') return { obsVersion: '32.0.1' }
      throw new Error('Recording status unavailable')
    })
    mocks.setup.mockResolvedValue({ ok: true })
    const rec = new OBSRecorder(() => ({ host: '127.0.0.1', port: 4455, password: '', replayBufferSeconds: 0, obsPreserveActiveScene: false }))
    expect(await rec.connect()).toMatchObject({ ok: false })
    expect(mocks.setup).not.toHaveBeenCalled()
    expect(rec.isConnected()).toBe(false)
  })

  it('bounds a stuck recording-status request and allows a subsequent connection', async () => {
    vi.useFakeTimers()
    mocks.connect.mockResolvedValue({ obsWebSocketVersion: '5.7.4' })
    mocks.disconnect.mockResolvedValue(undefined)
    mocks.call.mockImplementation(async (request) => {
      if (request === 'GetVersion') return { obsVersion: '32.0.1' }
      return new Promise(() => {})
    })
    mocks.setup.mockResolvedValue({ ok: true })
    const rec = new OBSRecorder(() => ({ host: '127.0.0.1', port: 4455, password: '', replayBufferSeconds: 0, obsPreserveActiveScene: false }))
    const settled = vi.fn()
    const result = rec.connect().then(settled)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ ok: false }))
    await result
    expect(mocks.setup).not.toHaveBeenCalled()
    mocks.call.mockImplementation(async request => request === 'GetVersion' ? { obsVersion: '32.0.1' } : { outputActive: false })
    expect(await rec.connect()).toMatchObject({ ok: true })
  })

  it('rejects a missing outputActive field instead of treating it as idle', async () => {
    mocks.connect.mockResolvedValue({ obsWebSocketVersion: '5.7.4' })
    mocks.disconnect.mockResolvedValue(undefined)
    mocks.call.mockImplementation(async request => request === 'GetVersion' ? { obsVersion: '32.0.1' } : {})
    mocks.setup.mockResolvedValue({ ok: true })
    const rec = new OBSRecorder(() => ({ host: '127.0.0.1', port: 4455, password: '', replayBufferSeconds: 0, obsPreserveActiveScene: false }))
    expect(await rec.connect()).toMatchObject({ ok: false })
    expect(mocks.setup).not.toHaveBeenCalled()
  })

  it('does not advertise readiness or configure scenes during OBS startup', async () => {
    vi.useFakeTimers()
    mocks.connect.mockResolvedValue({ obsWebSocketVersion: '5.7.4' })
    mocks.disconnect.mockResolvedValue(undefined)
    let probes = 0
    mocks.call.mockImplementation(async (request) => {
      if (request === 'GetVersion') {
        if (++probes < 3) throw new Error('OBS is not ready to perform the request.')
        return { obsVersion: '32.0.1' }
      }
      return { outputActive: false }
    })
    mocks.setup.mockResolvedValue({ ok: true })
    const rec = new OBSRecorder(() => ({ host: '127.0.0.1', port: 4455, password: '', replayBufferSeconds: 0, obsPreserveActiveScene: false }))
    const changed = vi.fn()
    rec.onConnectionChange = changed
    const first = rec.connect()
    const second = rec.connect()
    await vi.advanceTimersByTimeAsync(500)
    expect(rec.isConnected()).toBe(false)
    expect(mocks.setup).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalledWith(true)
    await vi.advanceTimersByTimeAsync(500)
    expect(await first).toMatchObject({ ok: true })
    expect(await second).toMatchObject({ ok: true })
    expect(mocks.connect).toHaveBeenCalledTimes(1)
    expect(mocks.setup).toHaveBeenCalledTimes(1)
    expect(changed).toHaveBeenCalledWith(true)
  })
})
