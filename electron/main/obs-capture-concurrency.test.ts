import { expect, it, vi } from 'vitest'
import { ensureUpForgeCapture, getUpForgeCaptureConfig } from './obs-setup'

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('./game-window-finder', () => ({ resolveObsCaptureWindow: async () => 'Valorant' }))

function server() {
  let input: { inputName: string; inputKind: unknown; inputSettings: unknown } | null = null
  const call = vi.fn(async (method: string, args?: Record<string, unknown>) => {
    if (method === 'GetInputList') return { inputs: input ? [{ ...input }] : [] }
    if (method === 'GetInputSettings') return input
    if (method === 'CreateInput') {
      if (input) throw new Error('A source already exists by that input name.')
      input = { inputName: String(args!.inputName), inputKind: args!.inputKind, inputSettings: args!.inputSettings }
    }
    return {}
  })
  return { call }
}

it('serializes overlapping capture setup against the same OBS connection', async () => {
  const obs = server()
  await expect(Promise.all([
    ensureUpForgeCapture(obs as never, 'valorant'),
    ensureUpForgeCapture(obs as never, 'valorant'),
  ])).resolves.toHaveLength(2)
  expect(obs.call.mock.calls.filter(([method]) => method === 'CreateInput')).toHaveLength(1)
})

it('allows a new setup after the previous request failed', async () => {
  const obs = server()
  obs.call.mockRejectedValueOnce(new Error('Disconnected'))
  await expect(ensureUpForgeCapture(obs as never, 'valorant')).rejects.toThrow('Disconnected')
  await expect(ensureUpForgeCapture(obs as never, 'valorant')).resolves.toMatchObject({ inputCreated: true })
})

function existingInputServer(options: { raceOnCreate?: boolean; wrongKind?: boolean; removeFails?: boolean } = {}) {
  const config = getUpForgeCaptureConfig('valorant', 'Valorant')
  let exists = !options.raceOnCreate
  let attached = false
  const obs = { call: vi.fn(async (method: string) => {
    if (method === 'GetInputList') return { inputs: exists ? [{ inputName: 'UpForge Capture' }] : [] }
    if (method === 'GetInputSettings') return { inputKind: options.wrongKind ? 'monitor_capture' : config.inputKind, inputSettings: config.inputSettings }
    if (method === 'GetSceneItemList') return { sceneItems: attached ? [{ sourceName: 'UpForge Capture', sceneItemId: 1 }] : [] }
    if (method === 'RemoveInput') {
      if (options.removeFails) throw new Error('Input is still referenced')
      exists = false
    }
    if (method === 'CreateInput') {
      if (options.raceOnCreate) exists = true
      if (exists) throw Object.assign(new Error('A source already exists by that input name.'), { code: 601 })
      exists = true
      attached = true
    }
    if (method === 'CreateSceneItem') attached = true
    return {}
  }) }
  return obs
}

it('reattaches the existing capture input instead of leaving the gameplay scene empty', async () => {
  const obs = existingInputServer()
  await expect(ensureUpForgeCapture(obs as never, 'valorant')).resolves.toMatchObject({ inputCreated: false })
  expect(obs.call).toHaveBeenCalledWith('CreateSceneItem', { sceneName: 'UpForge', sourceName: 'UpForge Capture', sceneItemEnabled: true })
  expect(obs.call).not.toHaveBeenCalledWith('RemoveInput', expect.anything())
})

it('reuses a compatible source created by another OBS connection between list and create', async () => {
  const obs = existingInputServer({ raceOnCreate: true })
  await expect(ensureUpForgeCapture(obs as never, 'valorant')).resolves.toMatchObject({ inputCreated: false })
  expect(obs.call).toHaveBeenCalledWith('SetInputSettings', expect.objectContaining({ inputName: 'UpForge Capture' }))
  expect(obs.call).toHaveBeenCalledWith('CreateSceneItem', expect.objectContaining({ sourceName: 'UpForge Capture' }))
})

it('recovers a compatible source left behind when OBS refuses removal', async () => {
  const obs = existingInputServer({ removeFails: true })
  await expect(ensureUpForgeCapture(obs as never, 'valorant', { forceRecreate: true })).resolves.toMatchObject({ inputCreated: false })
  expect(obs.call).toHaveBeenCalledWith('SetInputSettings', expect.objectContaining({ inputName: 'UpForge Capture' }))
})

it('does not repurpose a colliding desktop capture source', async () => {
  const obs = existingInputServer({ raceOnCreate: true, wrongKind: true })
  await expect(ensureUpForgeCapture(obs as never, 'valorant')).rejects.toThrow('already exists')
  expect(obs.call).not.toHaveBeenCalledWith('SetInputSettings', expect.anything())
  expect(obs.call).not.toHaveBeenCalledWith('CreateSceneItem', expect.anything())
})

it('creates the new capture kind once OBS finishes releasing an old incompatible input', async () => {
  const config = getUpForgeCaptureConfig('valorant', 'Valorant')
  let exists = true
  let createCalls = 0
  let listCalls = 0
  const obs = { call: vi.fn(async (method: string) => {
    if (method === 'GetInputList') {
      listCalls++
      // Still listed during setup and the first release poll, gone after that.
      if (listCalls >= 4) exists = false
      return { inputs: exists ? [{ inputName: 'UpForge Capture' }] : [] }
    }
    if (method === 'GetInputSettings') return { inputKind: 'monitor_capture', inputSettings: {} }
    if (method === 'GetSceneItemList') return { sceneItems: [] }
    if (method === 'CreateInput') {
      createCalls++
      if (exists) throw new Error('A source already exists by that input name.')
    }
    return {}
  }) }
  await expect(ensureUpForgeCapture(obs as never, 'valorant', { forceRecreate: true })).resolves.toMatchObject({ inputCreated: true })
  expect(createCalls).toBe(2)
  expect(obs.call).toHaveBeenLastCalledWith('CreateInput', expect.objectContaining({ inputKind: config.inputKind }))
})

/**
 * OBS keeps a removed input's name taken until its last reference is released, but
 * refuses to add that removed source to a scene ("Failed to create the scene item.").
 */
function lingeringRemovedInputServer(releaseAfterCreates: number) {
  const config = getUpForgeCaptureConfig('valorant', 'Valorant')
  let createAttempts = 0
  let attached = false
  const lingering = () => createAttempts <= releaseAfterCreates
  const obs = { call: vi.fn(async (method: string) => {
    if (method === 'GetInputList') return { inputs: [] }
    if (method === 'GetInputSettings') return { inputKind: config.inputKind, inputSettings: config.inputSettings }
    if (method === 'GetSceneItemList') return { sceneItems: attached ? [{ sourceName: 'UpForge Capture', sceneItemId: 1 }] : [] }
    if (method === 'CreateInput') {
      createAttempts++
      if (lingering()) throw Object.assign(new Error('A source already exists by that input name.'), { code: 601 })
      attached = true
    }
    if (method === 'CreateSceneItem') {
      throw Object.assign(new Error('Failed to create the scene item.'), { code: 700 })
    }
    return {}
  }) }
  return obs
}

it('creates a fresh capture input when the colliding one is a removed copy OBS will not add to the scene', async () => {
  vi.useFakeTimers()
  try {
    const obs = lingeringRemovedInputServer(2)
    const setup = ensureUpForgeCapture(obs as never, 'valorant')
    await vi.advanceTimersByTimeAsync(5_000)
    await expect(setup).resolves.toMatchObject({ inputCreated: true })
    expect(obs.call.mock.calls.filter(([method]) => method === 'CreateInput')).toHaveLength(3)
  } finally {
    vi.useRealTimers()
  }
})

it('names the OBS error code, scene and input when the capture item still cannot be created', async () => {
  vi.useFakeTimers()
  try {
    const obs = lingeringRemovedInputServer(Infinity)
    const setup = expect(ensureUpForgeCapture(obs as never, 'valorant')).rejects.toThrow(
      'Failed to create the scene item. (OBS code 700; scene "UpForge"; input "UpForge Capture")',
    )
    await vi.advanceTimersByTimeAsync(10_000)
    await setup
  } finally {
    vi.useRealTimers()
  }
})
