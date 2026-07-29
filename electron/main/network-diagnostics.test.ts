import { describe, expect, it } from 'vitest'
import {
  formatNetworkProbeSummary,
  formatSupportBundle,
  hostnameFromUrl,
  isLikelyNetworkFailure,
  riotPdHostname,
  type NetworkDiagnosticsSnapshot,
} from './network-diagnostics'

function sampleSnapshot(overrides: Partial<NetworkDiagnosticsSnapshot> = {}): NetworkDiagnosticsSnapshot {
  return {
    at: 1_700_000_000_000,
    trigger: 'test',
    region: 'na',
    apiBase: 'https://api.upforge.gg',
    hosts: [
      {
        hostname: 'pd.na.a.pvp.net',
        role: 'riot_pd',
        lookupAny: { ok: false, error: 'getaddrinfo ENOTFOUND pd.na.a.pvp.net', ms: 12 },
        lookupV4: { ok: false, error: 'getaddrinfo ENOTFOUND pd.na.a.pvp.net', ms: 11 },
      },
      {
        hostname: 'api.upforge.gg',
        role: 'upforge_api',
        lookupAny: { ok: true, address: '1.2.3.4', family: 4, ms: 5 },
        lookupV4: { ok: true, address: '1.2.3.4', family: 4, ms: 4 },
      },
    ],
    lastRiotMatchDetails: {
      at: 1_700_000_000_100,
      error: 'getaddrinfo ENOTFOUND pd.na.a.pvp.net',
    },
    lastUploadError: null,
    node: { version: '20.0.0', platform: 'win32', arch: 'x64' },
    ...overrides,
  }
}

describe('hostnameFromUrl', () => {
  it('parses API hostnames', () => {
    expect(hostnameFromUrl('https://api.upforge.gg')).toBe('api.upforge.gg')
    expect(hostnameFromUrl('https://api.upforge.gg/api/x')).toBe('api.upforge.gg')
  })

  it('returns null for invalid URLs', () => {
    expect(hostnameFromUrl('not-a-url')).toBeNull()
  })
})

describe('riotPdHostname', () => {
  it('builds PD host from shard (br/latam → na)', () => {
    expect(riotPdHostname('na')).toBe('pd.na.a.pvp.net')
    expect(riotPdHostname('br')).toBe('pd.na.a.pvp.net')
    expect(riotPdHostname('latam')).toBe('pd.na.a.pvp.net')
    expect(riotPdHostname('EU')).toBe('pd.eu.a.pvp.net')
  })

  it('rejects empty or unsafe regions', () => {
    expect(riotPdHostname(null)).toBeNull()
    expect(riotPdHostname('na.evil')).toBeNull()
  })
})

describe('isLikelyNetworkFailure', () => {
  it('detects DNS and socket errors', () => {
    expect(isLikelyNetworkFailure('getaddrinfo ENOTFOUND pd.na.a.pvp.net')).toBe(true)
    expect(isLikelyNetworkFailure('socket hang up')).toBe(true)
    expect(isLikelyNetworkFailure('HTTP 404')).toBe(false)
  })
})

describe('formatNetworkProbeSummary', () => {
  it('summarizes host outcomes for Activity', () => {
    const summary = formatNetworkProbeSummary(sampleSnapshot())
    expect(summary).toContain('pd.na.a.pvp.net FAIL')
    expect(summary).toContain('api.upforge.gg OK 1.2.3.4')
  })
})

describe('formatSupportBundle', () => {
  it('includes network, riot, and activity sections', () => {
    const text = formatSupportBundle({
      version: '2.10.43',
      network: sampleSnapshot(),
      activityLog: [{ time: 1_700_000_000_200, message: 'Riot match stats fetch failed' }],
      riot: {
        lockfileFound: true,
        region: 'na',
        accessTokenPresent: true,
        entitlementsTokenPresent: true,
        currentMatchId: 'abc',
        lastSessionLoopState: 'MENUS',
        clientVersion: 'release-x',
        lastMatchDetailsFetch: {
          at: 1_700_000_000_100,
          error: 'getaddrinfo ENOTFOUND pd.na.a.pvp.net',
        },
      },
    })
    expect(text).toContain('UpForge Support Bundle v2.10.43')
    expect(text).toContain('=== NETWORK ===')
    expect(text).toContain('pd.na.a.pvp.net')
    expect(text).toContain('=== ACTIVITY LOG ===')
    expect(text).toContain('Riot match stats fetch failed')
    expect(text).not.toContain('—')
  })
})
