import { describe, expect, it, vi } from 'vitest'
import { enterUpForgeObsProfile, restorePlayerObsState } from './obs-player-settings-guard'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp', getAppPath: () => '/tmp', isPackaged: false } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

function fakeObs(state: { profile: string; scene: string; live?: Partial<Record<'record' | 'stream' | 'replay' | 'vcam', boolean>> }) {
  const call = vi.fn(async (method: string, args: Record<string, unknown> = {}) => {
    switch (method) {
      case 'GetProfileList': return { currentProfileName: state.profile, profiles: ['Streaming', 'UpForge'] }
      case 'SetCurrentProfile': state.profile = String(args.profileName); return {}
      case 'GetCurrentProgramScene': return { currentProgramSceneName: state.scene }
      case 'SetCurrentProgramScene': state.scene = String(args.sceneName); return {}
      case 'GetRecordStatus': return { outputActive: state.live?.record === true }
      case 'GetStreamStatus': return { outputActive: state.live?.stream === true }
      case 'GetReplayBufferStatus': return { outputActive: state.live?.replay === true }
      case 'GetVirtualCamStatus': return { outputActive: state.live?.vcam === true }
      default: return {}
    }
  })
  return { call }
}

describe('enterUpForgeObsProfile', () => {
  it('switches to the UpForge profile and remembers the player profile', async () => {
    const state = { profile: 'Streaming', scene: 'Main' }
    expect(await enterUpForgeObsProfile(fakeObs(state) as never)).toEqual({ active: true, previousProfile: 'Streaming' })
    expect(state.profile).toBe('UpForge')
  })

  it.each(['record', 'stream', 'replay', 'vcam'] as const)('never switches while %s output is live', async (output) => {
    const state = { profile: 'Streaming', scene: 'Main', live: { [output]: true } }
    const obs = fakeObs(state)
    expect(await enterUpForgeObsProfile(obs as never)).toEqual({ active: false, reason: 'outputs_active' })
    expect(obs.call).not.toHaveBeenCalledWith('SetCurrentProfile', expect.anything())
  })

  it('fails closed when output status cannot be read', async () => {
    const obs = fakeObs({ profile: 'Streaming', scene: 'Main' })
    const inner = obs.call.getMockImplementation()!
    obs.call.mockImplementation(async (method, args) => {
      if (method === 'GetStreamStatus') throw new Error('socket closed')
      return inner(method, args)
    })
    expect(await enterUpForgeObsProfile(obs as never)).toEqual({ active: false, reason: 'outputs_active' })
  })
})

describe('restorePlayerObsState', () => {
  it('puts back the scene and profile UpForge switched away from', async () => {
    const state = { profile: 'UpForge', scene: 'UpForge' }
    expect(await restorePlayerObsState(fakeObs(state) as never, { profileName: 'Streaming', sceneName: 'Main' }, 'UpForge')).toBe(true)
    expect(state).toEqual({ profile: 'Streaming', scene: 'Main' })
  })

  it('keeps a scene or profile the player picked themselves after the match', async () => {
    const state = { profile: 'Other', scene: 'BRB' }
    const obs = fakeObs(state)
    expect(await restorePlayerObsState(obs as never, { profileName: 'Streaming', sceneName: 'Main' }, 'UpForge')).toBe(true)
    expect(state).toEqual({ profile: 'Other', scene: 'BRB' })
    expect(obs.call).not.toHaveBeenCalledWith('SetCurrentProfile', expect.anything())
    expect(obs.call).not.toHaveBeenCalledWith('SetCurrentProgramScene', expect.anything())
  })

  it('waits while an output is still live', async () => {
    const state = { profile: 'UpForge', scene: 'UpForge', live: { stream: true } }
    expect(await restorePlayerObsState(fakeObs(state) as never, { profileName: 'Streaming', sceneName: 'Main' }, 'UpForge')).toBe(false)
    expect(state.profile).toBe('UpForge')
  })
})
