import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveAgentName, resolveMapName } from './riot-lookup-tables'
import {
  __setValorantContentTestHooks,
  initValorantContentFallback,
  parseAgentNames,
  parseMapNames,
  refreshValorantContentNames,
} from './valorant-content-fallback'
import { getAgentImage, getAgentRole, normalizeAgentName, formatMapLabel, getMapImage } from '../../src/lib/valorant'
import { abilityNameForAgentSlot } from '../../src/lib/valorant-ability-images'
import { resolveRecordingAgent } from '../../src/lib/recording-display'

const HUSH = 'ddd5a15c-4fbe-42fa-3789-11a55ca5ee04'
const FUTURE_AGENT = '0a1b2c3d-1111-2222-3333-444455556666'

function jsonResponse(body: unknown) {
  const text = JSON.stringify(body)
  return { ok: true, headers: { get: () => String(text.length) }, text: async () => text }
}

function fakeFetch() {
  return vi.fn(async (url: string) => url.includes('/agents')
    ? jsonResponse({ data: [{ uuid: FUTURE_AGENT, displayName: 'Nova' }, { uuid: 'not-a-uuid', displayName: 'Bad' }] })
    : jsonResponse({ data: [{ mapUrl: '/Game/Maps/Glacier/Glacier', displayName: 'Glacier' }] }))
}

describe('Valorant names for new content', () => {
  let tmp: string
  let clock = 1_800_000_000_000

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-valcontent-'))
    clock = 1_800_000_000_000
    __setValorantContentTestHooks({ reset: true, now: () => clock })
  })
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

  it('resolves Hush and Summit from the static tables', () => {
    const fetch = fakeFetch()
    __setValorantContentTestHooks({ fetch })
    expect(resolveAgentName(HUSH)).toBe('Hush')
    expect(resolveAgentName(HUSH.toUpperCase())).toBe('Hush')
    expect(resolveMapName('/Game/Maps/Plummet/Plummet')).toBe('Summit')
    expect(resolveMapName('/Game/Maps/Rook/Rook')).toBe('Corrode')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('falls back to fetched names for an agent or map the tables lack, and caches them', async () => {
    const fetch = fakeFetch()
    __setValorantContentTestHooks({ fetch })
    // No cache yet: init starts one background fetch; until it lands the raw id comes back.
    initValorantContentFallback(tmp)
    expect(resolveAgentName(FUTURE_AGENT)).toBe(FUTURE_AGENT)
    await refreshValorantContentNames()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(resolveAgentName(FUTURE_AGENT)).toBe('Nova')
    expect(resolveMapName('/Game/Maps/Glacier/Glacier')).toBe('Glacier')

    // Persisted to userData and reloaded on the next start without a network call.
    expect(fs.existsSync(path.join(tmp, 'valorant-content-names.json'))).toBe(true)
    const offline = vi.fn(async () => { throw new Error('offline') })
    __setValorantContentTestHooks({ reset: true, fetch: offline, now: () => clock })
    initValorantContentFallback(tmp)
    expect(resolveAgentName(FUTURE_AGENT)).toBe('Nova')
    expect(offline).not.toHaveBeenCalled()
  })

  it('rate-limits refreshes and survives a failed fetch', async () => {
    const failing = vi.fn(async () => { throw new Error('timeout') })
    __setValorantContentTestHooks({ fetch: failing })
    expect(resolveAgentName(FUTURE_AGENT)).toBe(FUTURE_AGENT)
    await refreshValorantContentNames()
    expect(resolveAgentName(FUTURE_AGENT)).toBe(FUTURE_AGENT)
    await refreshValorantContentNames()
    expect(failing).toHaveBeenCalledTimes(2) // agents + maps, once
  })

  it('rejects oversized responses', async () => {
    const huge = vi.fn(async () => ({ ok: true, headers: { get: () => String(50 * 1024 * 1024) }, text: async () => '{}' }))
    __setValorantContentTestHooks({ fetch: huge })
    await refreshValorantContentNames()
    expect(resolveAgentName(FUTURE_AGENT)).toBe(FUTURE_AGENT)
  })

  it('parses only valid rows', () => {
    expect(parseAgentNames({ data: [{ uuid: HUSH, displayName: 'Hush' }, { uuid: 'x', displayName: 'Bad' }] })).toEqual({ [HUSH]: 'Hush' })
    expect(parseMapNames({ data: [{ mapUrl: '/Game/Maps/Plummet/Plummet', displayName: 'Summit' }, { displayName: 'NoUrl' }] })).toEqual({ plummet: 'Summit' })
    expect(parseAgentNames(null)).toEqual({})
  })
})

describe('renderer tables know Hush and Summit', () => {
  it('has Hush art, role, abilities and turns stored uuids into names', () => {
    expect(getAgentImage('Hush')).toBe(`https://media.valorant-api.com/agents/${HUSH}/displayicon.png`)
    expect(getAgentRole('Hush')).toBe('Duelist')
    expect(abilityNameForAgentSlot('Hush', 'ultimate')).toBe('Suspension')
    expect(normalizeAgentName(HUSH)).toBe('Hush')
    expect(normalizeAgentName(FUTURE_AGENT)).toBe(FUTURE_AGENT)
    expect(getAgentImage(FUTURE_AGENT)).toBe(`https://media.valorant-api.com/agents/${FUTURE_AGENT}/displayicon.png`)
    expect(resolveRecordingAgent({ game: 'valorant', agent: HUSH, timeline: null } as never)).toBe('Hush')
    expect(formatMapLabel('Plummet')).toBe('Summit')
    expect(getMapImage('Summit')).toContain('756da597-416b-c0f2-f47b-afbdf28670bc')
  })
})
