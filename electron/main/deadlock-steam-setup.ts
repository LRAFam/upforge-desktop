/**
 * @deprecated Deadlock no longer uses -condebug. Kept for IPC compatibility.
 */

export interface DeadlockSteamSetupResult {
  ok: boolean
  alreadyConfigured: boolean
  needsGameRestart: boolean
  error?: string
}

/** No-op — match detection uses Steam httpcache instead of launch options. */
export async function ensureDeadlockSteamLaunchOptions(): Promise<DeadlockSteamSetupResult> {
  return { ok: true, alreadyConfigured: true, needsGameRestart: false }
}

export function launchOptionsIncludeCondebug(): boolean {
  return true
}
