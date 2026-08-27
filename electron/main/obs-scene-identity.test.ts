import { describe, expect, it } from 'vitest'
import { isRegisteredObsScene, type ObsSceneIdentity } from './obs-scene-identity'

const registered: ObsSceneIdentity = {
  collectionName: 'Gameplay',
  sceneName: 'UpForge',
  sceneUuid: 'scene-uuid-1',
}

describe('isRegisteredObsScene', () => {
  it('uses UUID identity so a renamed gameplay scene remains registered', () => {
    expect(isRegisteredObsScene({
      collectionName: 'Gameplay',
      sceneName: 'Ranked capture',
      sceneUuid: 'scene-uuid-1',
    }, registered)).toBe(true)
  })

  it('rejects a same-named scene from another collection', () => {
    expect(isRegisteredObsScene({
      collectionName: 'Marketing',
      sceneName: 'UpForge',
      sceneUuid: 'scene-uuid-1',
    }, registered)).toBe(false)
  })

  it('rejects a replacement scene with the registered visible name', () => {
    expect(isRegisteredObsScene({
      collectionName: 'Gameplay',
      sceneName: 'UpForge',
      sceneUuid: 'scene-uuid-2',
    }, registered)).toBe(false)
  })

  it('does not downgrade a UUID registration when active UUID data is missing', () => {
    expect(isRegisteredObsScene({
      collectionName: 'Gameplay',
      sceneName: 'UpForge',
      sceneUuid: null,
    }, registered)).toBe(false)
  })

  it('falls back to collection-scoped names when OBS exposes no UUIDs', () => {
    expect(isRegisteredObsScene({
      collectionName: 'Gameplay',
      sceneName: 'UpForge',
      sceneUuid: null,
    }, { ...registered, sceneUuid: null })).toBe(true)
  })

  it('fails closed when active scene information is unavailable', () => {
    expect(isRegisteredObsScene(null, registered)).toBe(false)
  })
})
