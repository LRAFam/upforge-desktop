export interface ObsSceneIdentity {
  collectionName: string | null
  sceneName: string
  sceneUuid: string | null
}

/**
 * Match an OBS scene within its scene collection. UUID is preferred because it
 * survives user renames; names are only a compatibility fallback for OBS builds
 * that do not expose scene UUIDs.
 */
export function isRegisteredObsScene(
  active: ObsSceneIdentity | null,
  registered: ObsSceneIdentity | null,
): boolean {
  if (!active || !registered) return false
  if (
    active.collectionName
    && registered.collectionName
    && active.collectionName !== registered.collectionName
  ) return false

  if (active.sceneUuid && registered.sceneUuid) {
    return active.sceneUuid === registered.sceneUuid
  }

  // Do not silently downgrade a UUID-backed registration to a name match. That
  // could adopt an unrelated scene with the same visible name after a deletion.
  if (active.sceneUuid || registered.sceneUuid) return false
  return active.sceneName === registered.sceneName
}
