import type { MatchData } from './riot-types'

export interface LolAccountIdentity {
  gameName: string
  tagLine: string
  platform: string
}

export interface LolCaptureContext {
  account: LolAccountIdentity | null
  matchId: string | null
  queueId: number | null
}

const PLATFORM_REGIONS: Record<string, string> = {
  BR1: 'americas', LA1: 'americas', LA2: 'americas', NA1: 'americas',
  OC1: 'sea', JP1: 'asia', KR: 'asia', EUN1: 'europe', EUW1: 'europe',
  TR1: 'europe', RU: 'europe', PH2: 'sea', SG2: 'sea', TH2: 'sea', TW2: 'sea', VN2: 'sea',
}

export function lolPlatformToMatchV5Region(platform: string | null | undefined): string | null {
  return platform ? PLATFORM_REGIONS[platform.trim().toUpperCase()] ?? null : null
}

/** LoginDataPacket uses short region names on some League client versions. */
export function normalizeLolPlatform(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim().toUpperCase()
  const aliases: Record<string, string> = {
    NA: 'NA1', BR: 'BR1', LAN: 'LA1', LAS: 'LA2', EUW: 'EUW1', EUNE: 'EUN1',
    OCE: 'OC1', JP: 'JP1', TR: 'TR1', PH: 'PH2', SG: 'SG2', TH: 'TH2', TW: 'TW2', VN: 'VN2',
  }
  const platform = aliases[raw] ?? raw
  return PLATFORM_REGIONS[platform] ? platform : null
}

export function captureLolAccount(summoner: { gameName?: string; tagLine?: string }, platform: unknown): LolAccountIdentity | null {
  const gameName = summoner.gameName?.trim()
  const tagLine = summoner.tagLine?.trim()
  const normalizedPlatform = normalizeLolPlatform(platform)
  return gameName && tagLine && normalizedPlatform ? { gameName, tagLine, platform: normalizedPlatform } : null
}

/** Apply only the context captured for this game, never the account linked at review time. */
export function applyLolCaptureContext(timeline: MatchData, context: LolCaptureContext | null): MatchData {
  if (!context) return timeline
  const account = context.account
  // If the live player differs, the LCU session changed during capture. Do not attach it.
  if (account && timeline.playerName && timeline.playerTag && (
    account.gameName.toLowerCase() !== timeline.playerName.toLowerCase()
    || account.tagLine.toLowerCase() !== timeline.playerTag.toLowerCase()
  )) return timeline
  if (context.queueId != null) timeline.queueId = String(context.queueId)
  if (context.matchId) timeline.matchId = context.matchId
  timeline.lolAccount = account ? { ...account } : null
  if (account) {
    timeline.playerName = account.gameName
    timeline.playerTag = account.tagLine
    timeline.region = lolPlatformToMatchV5Region(account.platform)
  }
  return timeline
}
