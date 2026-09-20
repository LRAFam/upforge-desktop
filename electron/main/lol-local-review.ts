/** A bounded coaching snapshot captured from the local League client, not Match-V5. */
export interface LolLocalReview {
  source: 'live_client'
  version: 1
  champion: string
  map: string
  duration_seconds: number
  kills: number
  deaths: number
  assists: number
  cs: number | null
}

export function hasLolLocalReview(data: { game?: string; lolLocalReview?: LolLocalReview | null } | null | undefined): boolean {
  const s = data?.lolLocalReview
  return data?.game === 'lol' && s?.source === 'live_client' && s.version === 1
    && typeof s.champion === 'string' && s.champion.trim().length > 0
    && ["Summoner's Rift", 'Howling Abyss'].includes(s.map)
    && Number.isFinite(s.duration_seconds) && s.duration_seconds >= 60
    && [s.kills, s.deaths, s.assists].every(v => Number.isInteger(v) && v >= 0)
    && (s.cs === null || (Number.isInteger(s.cs) && s.cs >= 0))
}
