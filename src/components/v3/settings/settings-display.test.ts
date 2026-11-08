import { describe, expect, it } from 'vitest'
import {
  canBuyReports,
  defaultLolPlatform,
  defaultValorantRegion,
  localStorageLine,
  untrackedCountdownLine,
  regionFromTimeZone,
  shortcutKeyParts,
  showPurchasedReports,
  valorantAccountsView,
} from './settings-display'
import { CROSSHAIR_GROUPS, sliderValueLabel } from './crosshair-editor'

describe('shortcutKeyParts', () => {
  it('shows mac symbols on macOS', () => {
    expect(shortcutKeyParts('CommandOrControl+Shift+U', true)).toEqual(['⌘', '⇧', 'U'])
    expect(shortcutKeyParts('Alt+F9', true)).toEqual(['⌥', 'F9'])
  })
  it('keeps Ctrl on Windows', () => {
    expect(shortcutKeyParts('CommandOrControl+Shift+U', false)).toEqual(['Ctrl', 'Shift', 'U'])
    expect(shortcutKeyParts('Control+F9', false)).toEqual(['Ctrl', 'F9'])
  })
  it('leaves a bare key alone', () => {
    expect(shortcutKeyParts('F8', true)).toEqual(['F8'])
  })
})

describe('region defaults', () => {
  it('uses the Valorant region already on the account', () => {
    expect(defaultValorantRegion({ riotRegion: 'eu' })).toBe('eu')
    expect(defaultLolPlatform({ riotRegion: 'eu' })).toBe('EUW1')
  })
  it('uses the League server for Valorant and vice versa', () => {
    expect(defaultValorantRegion({ lolPlatform: 'KR' })).toBe('kr')
    expect(defaultLolPlatform({ lolPlatform: 'na1' })).toBe('NA1')
  })
  it('falls back to the time zone, then the same default (NA) for both games', () => {
    expect(defaultValorantRegion({ timeZone: 'Europe/London' })).toBe('eu')
    expect(defaultLolPlatform({ timeZone: 'Europe/London' })).toBe('EUW1')
    expect(defaultValorantRegion({})).toBe('na')
    expect(defaultLolPlatform({})).toBe('NA1')
  })
  it('ignores unknown values', () => {
    expect(defaultValorantRegion({ riotRegion: 'mars', lolPlatform: 'XX' })).toBe('na')
  })
  it('maps time zones', () => {
    expect(regionFromTimeZone('Asia/Seoul')).toBe('kr')
    expect(regionFromTimeZone('America/Sao_Paulo')).toBe('br')
    expect(regionFromTimeZone('America/Mexico_City')).toBe('latam')
    expect(regionFromTimeZone('America/New_York')).toBe('na')
    expect(regionFromTimeZone('Australia/Sydney')).toBe('ap')
    expect(regionFromTimeZone('UTC')).toBeNull()
  })
})

describe('valorantAccountsView', () => {
  const user = { riot_name: 'LRAFam', riot_tag: '1337', riot_region: 'eu' }
  it('shows the signed-in Riot ID as main while the list is loading', () => {
    expect(valorantAccountsView([], false, user)).toEqual([{ id: 0, riot_name: 'LRAFam', riot_tag: '1337', riot_region: 'eu', is_active: true }])
  })
  it('uses the real rows once loaded', () => {
    const rows = [{ id: 7, riot_name: 'LRAFam', riot_tag: '1337', riot_region: 'eu', is_active: true }]
    expect(valorantAccountsView(rows, true, user)).toEqual(rows)
  })
  it('shows nothing (so the link form appears) when loaded and none are linked', () => {
    expect(valorantAccountsView([], true, user)).toEqual([])
  })
  it('shows nothing while loading when the user has no Riot ID', () => {
    expect(valorantAccountsView([], false, { riot_name: null, riot_tag: null })).toEqual([])
  })
})

describe('localStorageLine', () => {
  const fmt = (n: number) => `${n} B`
  it('says "on this PC" so it is not confused with cloud recordings', () => {
    expect(localStorageLine(0, '69.9 GB', fmt)).toBe('No recordings saved on this PC · 69.9 GB free')
    expect(localStorageLine(5, null, fmt)).toBe('5 B saved on this PC')
  })
})

describe('report purchase', () => {
  it('hides the purchase on unlimited plans', () => {
    expect(canBuyReports({ limit: null })).toBe(false)
    expect(canBuyReports({ limit: 3 })).toBe(true)
  })
  it('keeps purchased-credit info on unlimited plans only when credits exist', () => {
    expect(showPurchasedReports({ limit: null, purchased: 0 })).toBe(false)
    expect(showPurchasedReports({ limit: null, purchased: 2 })).toBe(true)
    expect(showPurchasedReports({ limit: 3, purchased: 0 })).toBe(true)
  })
})

describe('crosshair editor', () => {
  it('formats percentages and plain values', () => {
    expect(sliderValueLabel(0.85, true)).toBe('85%')
    expect(sliderValueLabel(2.5)).toBe('2.5')
  })
  it('covers dot, inner and outer lines with the classic ranges', () => {
    expect(CROSSHAIR_GROUPS.map(g => g.show)).toEqual(['dotShow', 'innerShow', 'outerShow'])
    expect(CROSSHAIR_GROUPS[1].sliders.find(s => s.key === 'innerLength')).toMatchObject({ min: 0, max: 30, step: 1 })
  })
})

describe('untrackedCountdownLine', () => {
  const fmt = (n: number) => `${n} B`
  const now = Date.UTC(2026, 10, 8)
  it('counts down the days before untracked files are auto-deleted', () => {
    expect(untrackedCountdownLine({ orphanScheduledCount: 2, orphanScheduledBytes: 10, orphanDeleteAt: now + 5 * 86_400_000 }, fmt, now))
      .toBe('2 untracked files (10 B) will be deleted in 5 days by auto-delete. Move them out of the recordings folder to keep them.')
    expect(untrackedCountdownLine({ orphanScheduledCount: 1, orphanScheduledBytes: 3, orphanDeleteAt: now + 3_600_000 }, fmt, now))
      .toMatch(/^1 untracked file \(3 B\) will be deleted within a day/)
  })
  it('is empty when nothing is scheduled', () => {
    expect(untrackedCountdownLine({ orphanScheduledCount: 0, orphanScheduledBytes: 0, orphanDeleteAt: null }, fmt, now)).toBe('')
  })
})
