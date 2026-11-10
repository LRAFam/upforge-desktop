const STEAM64_BASE = 76561197960265728n
const MAX_ACCOUNT_ID = 4294967295n

/** Exact individual Steam64 IDs; numbers cannot preserve all 64-bit digits. */
export function validCapturedCs2SteamId(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{17}$/.test(value)) return false
  const accountId = BigInt(value) - STEAM64_BASE
  return accountId > 0n && accountId <= MAX_ACCOUNT_ID
}

/** Only recording-time GSI identity corroborated by the demo target can leave the desktop. */
export function capturedCs2PlayerSteamId(timeline: unknown): string | null {
  if (!timeline || typeof timeline !== 'object') return null
  const row = timeline as Record<string, unknown>
  if (row.game !== 'cs2' || !row.cs2Live || typeof row.cs2Live !== 'object') return null
  const captured = (row.cs2Live as Record<string, unknown>).playerSteamId
  return validCapturedCs2SteamId(captured) && row.playerSteamId === captured ? captured : null
}
