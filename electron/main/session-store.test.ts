import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  MAX_QUEUED_SIGNOUTS, desktopDeviceName, loadCachedUser, markTokenIssued, pickCachedUserFields, queueSignOutEvent, readInstallId,
  readSignOutEvents, saveCachedUser, takeSignOutEvents, tokenAgeDays,
} from './session-store'

let dir = ''
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-session-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('install id', () => {
  it('is created once and reused', () => {
    const a = readInstallId(dir)
    expect(readInstallId(dir)).toBe(a)
    expect(desktopDeviceName(a)).toBe(`desktop-${a}`)
  })
  it('replaces a corrupt id file', () => {
    fs.writeFileSync(path.join(dir, 'install-id'), 'not-a-uuid')
    const id = readInstallId(dir, () => '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e')
    expect(id).toBe('0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e')
  })
  it('falls back to the legacy slot name for a bad id', () => {
    expect(desktopDeviceName('nope')).toBe('desktop')
  })
})

describe('cached user', () => {
  it('keeps only non-secret fields', () => {
    saveCachedUser(dir, { id: 3, name: 'Ada', email: 'ada@example.com', tier: 'free', riot_puuid: 'p', lol_puuid: 'q' } as never)
    const raw = fs.readFileSync(path.join(dir, 'auth-user.json'), 'utf8')
    expect(raw).not.toContain('ada@example.com')
    expect(raw).not.toContain('riot_puuid')
    expect(loadCachedUser<{ id: number; name: string; email: string }>(dir)).toEqual({ id: 3, name: 'Ada', tier: 'free', email: '' })
  })
  it('ignores a corrupt file', () => {
    fs.writeFileSync(path.join(dir, 'auth-user.json'), '{"user":{"id":"x"}}')
    expect(loadCachedUser(dir)).toBeNull()
  })
})

describe('token age', () => {
  it('counts whole days since the token was issued', () => {
    markTokenIssued(dir, 1_000)
    expect(tokenAgeDays(dir, 1_000 + 3 * 86_400_000 + 5)).toBe(3)
    expect(tokenAgeDays(dir, 0)).toBeNull()
  })
})

describe('sign-out queue', () => {
  it('is capped to the newest events and emptied when taken', () => {
    for (let i = 0; i < MAX_QUEUED_SIGNOUTS + 5; i++) queueSignOutEvent(dir, { reason: 'http_401', at: String(i) })
    const events = readSignOutEvents(dir)
    expect(events).toHaveLength(MAX_QUEUED_SIGNOUTS)
    expect(events[0].at).toBe('5')
    expect(takeSignOutEvents(dir)).toHaveLength(MAX_QUEUED_SIGNOUTS)
    expect(readSignOutEvents(dir)).toEqual([])
  })
})

describe('pickCachedUserFields: linked Riot accounts', () => {
  it('keeps only display fields, never PUUIDs', () => {
    const out = pickCachedUserFields({ id: 1, email: 'x@y.z', riot_accounts: [{ id: 3, riot_name: 'A', riot_tag: '1', is_active: true, puuid: 'secret-puuid', created_at: 'x' }] }) as { email?: string; riot_accounts?: Array<Record<string, unknown>> }
    expect(out.email).toBeUndefined()
    expect(out.riot_accounts).toEqual([{ id: 3, riot_name: 'A', riot_tag: '1', is_active: true }])
  })
})
