/**
 * Owner report (Nov 2026): "Valorant: Jett on Sunset shows as unknown map and agent".
 * Every current map path and playable agent uuid from valorant-api.com must resolve to its
 * display name from the static tables alone (offline, empty fallback cache), in the main process
 * and in the renderer, whatever form Riot or an older build stored it in.
 * Refresh the fixture: valorant-api.com /v1/maps and /v1/agents?isPlayableCharacter=true.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import content from './__fixtures__/valorant-api-content.json'
import { resolveAgentName, resolveMapName } from './riot-lookup-tables'
import { __setValorantContentTestHooks } from './valorant-content-fallback'
import { formatMapLabel, getAgentImage, getMapImage, normalizeAgentName, normalizeMapAssetKey } from '../../src/lib/valorant'
import { recordingMapLabel, recordingPlayerLabel } from '../../src/lib/recording-display'

const lastSegment = (mapUrl: string) => mapUrl.split('/').filter(Boolean).pop()!

beforeEach(() => {
  // Offline: a lookup must never depend on the valorant-api.com name refresh.
  __setValorantContentTestHooks({ reset: true, fetch: vi.fn(async () => { throw new Error('offline') }) })
})
afterEach(() => { __setValorantContentTestHooks({ reset: true }) })

describe('main process (riot-lookup-tables) — every current map and agent', () => {
  it.each(content.maps.map(m => [m.mapUrl, m.displayName]))('map %s → %s', (mapUrl, name) => {
    expect(resolveMapName(mapUrl)).toBe(name)
    expect(resolveMapName(mapUrl.toUpperCase())).toBe(name)
    expect(resolveMapName(lastSegment(mapUrl))).toBe(name)
  })

  it.each(content.agents.map(a => [a.uuid, a.displayName]))('agent %s → %s', (uuid, name) => {
    expect(resolveAgentName(uuid)).toBe(name)
    expect(resolveAgentName(uuid.toUpperCase())).toBe(name)
    expect(resolveAgentName(` ${uuid} `)).toBe(name)
  })

  it('Jett on Sunset (the reported match)', () => {
    expect(resolveMapName('/Game/Maps/Juliett/Juliett')).toBe('Sunset')
    expect(resolveAgentName('add6443a-41bd-e414-f6ad-e58d267f4e95')).toBe('Jett')
  })

  it('unknown content falls back to a readable name, not a raw path', () => {
    expect(resolveMapName('/Game/Maps/Glacier/Glacier')).toBe('Glacier')
    expect(resolveMapName('/Game/Maps/HURM/HURM_Frost/HURM_Frost')).toBe('HURM Frost')
  })
})

describe('renderer (src/lib/valorant) — every stored form shows the map and agent', () => {
  it.each(content.maps.map(m => [m.mapUrl, m.displayName]))('map %s → %s', (mapUrl, name) => {
    for (const stored of [name, mapUrl, lastSegment(mapUrl), lastSegment(mapUrl).toLowerCase(), name.toUpperCase()]) {
      expect(formatMapLabel(stored), stored).toBe(name)
      expect(recordingMapLabel({ game: 'valorant', map: stored }), stored).toBe(name)
    }
  })

  it.each(content.maps.filter(m => m.competitive).map(m => [m.mapUrl, m.displayName]))('competitive map %s has art', (mapUrl, name) => {
    expect(getMapImage(name)).toMatch(/^https:\/\/media\.valorant-api\.com\/maps\//)
    expect(getMapImage(mapUrl)).toBe(getMapImage(name))
    expect(normalizeMapAssetKey(mapUrl)).toBe(normalizeMapAssetKey(name))
  })

  it.each(content.agents.map(a => [a.uuid, a.displayName]))('agent %s → %s', (uuid, name) => {
    expect(normalizeAgentName(uuid)).toBe(name)
    expect(normalizeAgentName(uuid.toUpperCase())).toBe(name)
    expect(getAgentImage(name)).toContain(uuid)
    expect(getAgentImage(name.toUpperCase())).toContain(uuid)
    expect(recordingPlayerLabel({ game: 'valorant', agent: uuid, timeline: null })).toBe(name)
  })

  it('an unknown map path shows its last segment, not the whole path', () => {
    expect(formatMapLabel('/Game/Maps/Glacier/Glacier')).toBe('Glacier')
  })
})
