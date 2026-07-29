/**
 * Valorant PD hosts use a shard, not always the client region id.
 * Region `br` / `latam` share the `na` PD shard (pd.na.a.pvp.net).
 * See: https://valapidocs.techchrism.me (shard table).
 */

const PD_SHARD_BY_REGION: Record<string, string> = {
  na: 'na',
  pbe: 'na',
  latam: 'na',
  // Riot chat session sometimes returns "la" instead of "latam".
  la: 'na',
  br: 'na',
  eu: 'eu',
  euw: 'eu',
  eun: 'eu',
  ap: 'ap',
  kr: 'kr',
  // Legacy mistaken normalize stored "ko" for Korea — PD host is still kr.
  ko: 'kr',
}

export function riotPdShard(region: string | null | undefined): string | null {
  if (!region) return null
  const key = region.replace(/\d+$/, '').toLowerCase()
  if (!/^[a-z]+$/.test(key)) return null
  return PD_SHARD_BY_REGION[key] ?? key
}

export function riotPdHostname(region: string | null | undefined): string | null {
  const shard = riotPdShard(region)
  if (!shard) return null
  return `pd.${shard}.a.pvp.net`
}
