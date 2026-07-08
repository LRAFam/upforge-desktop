import type { MatchData } from './riot-local-api'

export interface UploadPlayerIdentity {
  riotName: string
  riotTag: string
}

/** Player label sent to desktop-submissions presign — Riot ID for Valorant, Steam/demo name otherwise. */
export function resolveUploadPlayerIdentity(
  game: string,
  timeline: MatchData | null,
  user: { riot_name?: string | null; riot_tag?: string | null; name?: string | null } | null,
  recording?: { riotName?: string | null; riotTag?: string | null },
  cs2SteamName?: string | null,
): UploadPlayerIdentity {
  if (game === 'valorant') {
    return {
      riotName:
        recording?.riotName?.trim()
        || timeline?.playerName?.trim()
        || user?.riot_name?.trim()
        || '',
      riotTag:
        recording?.riotTag?.trim()
        || timeline?.playerTag?.trim()
        || user?.riot_tag?.trim()
        || '',
    }
  }

  return {
    riotName:
      recording?.riotName?.trim()
      || timeline?.playerName?.trim()
      || cs2SteamName?.trim()
      || user?.name?.trim()
      || 'Player',
    riotTag: recording?.riotTag?.trim() || 'NA',
  }
}
