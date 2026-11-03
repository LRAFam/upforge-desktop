import { describe, expect, it } from 'vitest'
import { PENDING_TTL_MS, PendingDeepLink, findDeepLinkInArgv, parseUpforgeDeepLink } from './deep-link'

describe('parseUpforgeDeepLink', () => {
  it('accepts the coach invite shapes', () => {
    expect(parseUpforgeDeepLink('upforge://roster/join?coach=123')).toEqual({ kind: 'roster-join', coachId: 123 })
    expect(parseUpforgeDeepLink('upforge://roster/join?code=42')).toEqual({ kind: 'roster-join', coachId: 42 })
    expect(parseUpforgeDeepLink('upforge://coaches/7')).toEqual({ kind: 'roster-join', coachId: 7 })
    expect(parseUpforgeDeepLink('UPFORGE://Roster/join/?coach=9')).toEqual({ kind: 'roster-join', coachId: 9 })
  })

  it('rejects other schemes, hosts, paths and extra parameters', () => {
    for (const bad of [
      'https://upforge.gg/coaches/123',
      'upforge://roster/leave?coach=1',
      'upforge://roster/join',
      'upforge://roster/join?coach=1&redirect=https://evil.example',
      'upforge://coaches/123?next=x',
      'upforge://coaches/123/extra',
      'upforge://settings/account',
      'upforge://user:pw@roster/join?coach=1',
      'upforge://roster:9000/join?coach=1',
      'javascript:alert(1)',
      'file:///etc/passwd',
    ]) expect(parseUpforgeDeepLink(bad), bad).toBeNull()
  })

  it('rejects malformed or oversized coach ids and non-strings', () => {
    for (const bad of ['0', '-1', '01', '1e3', 'abc', '1234567890', '12 3', '%31']) {
      expect(parseUpforgeDeepLink(`upforge://roster/join?coach=${bad}`), bad).toBeNull()
    }
    expect(parseUpforgeDeepLink(`upforge://roster/join?coach=1&x=${'a'.repeat(300)}`)).toBeNull()
    expect(parseUpforgeDeepLink(null)).toBeNull()
    expect(parseUpforgeDeepLink(123)).toBeNull()
  })
})

describe('parseUpforgeDeepLink · analysis results', () => {
  it('accepts upforge://analysis/<game>/<id> for the four games', () => {
    expect(parseUpforgeDeepLink('upforge://analysis/valorant/123')).toEqual({ kind: 'open-analysis', game: 'valorant', analysisId: 123 })
    expect(parseUpforgeDeepLink('upforge://analysis/cs2/9')).toEqual({ kind: 'open-analysis', game: 'cs2', analysisId: 9 })
    expect(parseUpforgeDeepLink('upforge://analysis/deadlock/4567')).toEqual({ kind: 'open-analysis', game: 'deadlock', analysisId: 4567 })
    expect(parseUpforgeDeepLink('upforge://analysis/lol/9999999999')).toEqual({ kind: 'open-analysis', game: 'lol', analysisId: 9999999999 })
    // Windows may add a trailing slash; scheme/host/game case is tolerated.
    expect(parseUpforgeDeepLink('UPFORGE://Analysis/LoL/5/')).toEqual({ kind: 'open-analysis', game: 'lol', analysisId: 5 })
  })

  it('rejects unknown games', () => {
    for (const bad of ['upforge://analysis/dota/1', 'upforge://analysis/overwatch/1', 'upforge://analysis//1', 'upforge://analysis/1']) {
      expect(parseUpforgeDeepLink(bad), bad).toBeNull()
    }
  })

  it('rejects bad ids', () => {
    for (const bad of ['0', '01', '-1', '1e3', 'abc', '12345678901', '1.5', '%31', ' 1']) {
      expect(parseUpforgeDeepLink(`upforge://analysis/valorant/${bad}`), bad).toBeNull()
    }
  })

  it('rejects extra junk', () => {
    for (const bad of [
      'upforge://analysis/valorant/1?next=https://evil.example',
      'upforge://analysis/valorant/1#x',
      'upforge://analysis/valorant/1/extra',
      'upforge://analysis/valorant/1/../2',
      'upforge://user@analysis/valorant/1',
      'upforge://analysis:80/valorant/1',
      'upforge://analysis/valorant/results/1',
      `upforge://analysis/valorant/1${'/'.repeat(300)}`,
    ]) expect(parseUpforgeDeepLink(bad), bad).toBeNull()
  })

  it('is held until a signed-in renderer takes it', () => {
    const p = new PendingDeepLink(() => 0)
    expect(p.offer('upforge://analysis/cs2/3')).toEqual({ kind: 'open-analysis', game: 'cs2', analysisId: 3 })
    expect(p.take(false)).toBeNull()
    expect(p.take(true)).toEqual({ kind: 'open-analysis', game: 'cs2', analysisId: 3 })
    expect(p.take(true)).toBeNull()
  })
})

describe('findDeepLinkInArgv', () => {
  it('finds the link among normal launch arguments', () => {
    expect(findDeepLinkInArgv(['C:\\UpForge.exe', '--flag', 'upforge://coaches/5'])).toBe('upforge://coaches/5')
    expect(findDeepLinkInArgv(['UpForge.exe', '--hidden'])).toBeNull()
  })
})

describe('PendingDeepLink', () => {
  it('holds a link until a signed-in session takes it, once', () => {
    const p = new PendingDeepLink()
    expect(p.offer('upforge://coaches/5')).toEqual({ kind: 'roster-join', coachId: 5 })
    expect(p.take(false)).toBeNull()
    expect(p.hasPending()).toBe(true)
    expect(p.take(true)).toEqual({ kind: 'roster-join', coachId: 5 })
    expect(p.take(true)).toBeNull()
  })

  it('ignores disallowed links and keeps the previous one', () => {
    const p = new PendingDeepLink()
    p.offer('upforge://coaches/5')
    expect(p.offer('https://evil.example')).toBeNull()
    expect(p.take(true)).toEqual({ kind: 'roster-join', coachId: 5 })
  })

  it('drops a link that waited too long', () => {
    let t = 1_000
    const p = new PendingDeepLink(() => t)
    p.offer('upforge://coaches/5')
    t += PENDING_TTL_MS + 1
    expect(p.hasPending()).toBe(false)
    expect(p.take(true)).toBeNull()
  })
})
