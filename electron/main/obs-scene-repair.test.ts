import { expect, it, vi } from 'vitest'
import { setupUpForgeScene } from './obs-setup'

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))
vi.mock('./game-window-finder', () => ({ resolveObsCaptureWindow: async () => 'Valorant' }))

it('repairs a missing UpForge scene without deleting or switching the player scene', async () => {
  const scenes = [{ sceneName: 'Player stream', sceneUuid: 'player-uuid' }]
  const obs = { call: vi.fn(async (method: string, args?: Record<string, unknown>) => {
    if (method === 'GetSceneList') return { scenes }
    if (method === 'CreateScene') scenes.push({ sceneName: String(args!.sceneName), sceneUuid: 'upforge-uuid' })
    if (method === 'GetSceneCollectionList') return { currentSceneCollectionName: 'Player collection' }
    if (method === 'GetInputList') return { inputs: [] }
    if (method === 'GetSceneItemList') return { sceneItems: [] }
    return {}
  }) }
  const result = await setupUpForgeScene(obs as never, 'valorant', { switchScene: false, writeProfile: false })
  expect(result).toMatchObject({ ok: true, sceneCreated: true, inputCreated: true, sceneIdentity: { sceneUuid: 'upforge-uuid' } })
  expect(scenes[0]).toEqual({ sceneName: 'Player stream', sceneUuid: 'player-uuid' })
  const methods = obs.call.mock.calls.map(([method]) => method)
  for (const forbidden of ['RemoveScene', 'RemoveInput', 'SetCurrentProgramScene', 'SetProfileParameter']) {
    expect(methods).not.toContain(forbidden)
  }
})

it('fails closed when a non-scene source owns the UpForge name', async () => {
  const obs = { call: vi.fn(async (method: string) => {
    if (method === 'GetSceneList') return { scenes: [{ sceneName: 'Player stream' }] }
    if (method === 'CreateScene') throw new Error('A source already exists by that name.')
    throw new Error(`Unexpected ${method}`)
  }) }
  const result = await setupUpForgeScene(obs as never, 'valorant', { switchScene: false, writeProfile: false })
  expect(result).toMatchObject({ ok: false, sceneCreated: false, inputCreated: false })
  expect(obs.call.mock.calls.map(([method]) => method)).toEqual(['GetSceneList', 'CreateScene'])
})
