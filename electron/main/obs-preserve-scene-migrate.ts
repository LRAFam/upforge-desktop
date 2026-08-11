export type ObsPreserveSceneMigrateInput = {
  obsPreserveActiveScene?: boolean
  obsPreserveSceneDefaultV2?: boolean
}

export function migrateObsPreserveSceneDefaultV2<T extends ObsPreserveSceneMigrateInput>(
  parsed: T,
): T {
  const next = { ...parsed }
  if (next.obsPreserveSceneDefaultV2 === true) {
    return next
  }
  next.obsPreserveActiveScene = false
  next.obsPreserveSceneDefaultV2 = true
  return next
}
