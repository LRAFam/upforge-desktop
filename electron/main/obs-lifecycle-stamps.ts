/**
 * When UpForge itself last launched or closed OBS. Read by OBS disconnect reports so a
 * close code 1001 ("Server stopping") can be told apart: UpForge's own restart, an OBS
 * instance UpForge just launched quitting, or the player closing OBS.
 */
let launchedAt: number | null = null
let closedAt: number | null = null

export function noteObsLaunchedByUpForge(now = Date.now()): void { launchedAt = now }
export function noteObsClosedByUpForge(now = Date.now()): void { closedAt = now }

export function obsLifecycleAges(now = Date.now()): {
  obs_launched_by_upforge_ms_ago: number | null
  obs_closed_by_upforge_ms_ago: number | null
} {
  return {
    obs_launched_by_upforge_ms_ago: launchedAt === null ? null : Math.max(0, now - launchedAt),
    obs_closed_by_upforge_ms_ago: closedAt === null ? null : Math.max(0, now - closedAt),
  }
}

export function resetObsLifecycleStampsForTests(): void {
  launchedAt = null
  closedAt = null
}
