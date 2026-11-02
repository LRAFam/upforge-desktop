import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { webMoreLinks } from './web-explore-links'

describe('webMoreLinks', () => {
  it('shows the Valorant improvement loop and libraries', () => {
    expect(webMoreLinks('valorant').map(l => l.label)).toEqual([
      'Roadmap', 'Weekly goals', 'Skill profile', 'Rank challenge', 'Trends', 'Playstyle', 'Mental', 'Lineups', 'Playbooks', 'Guides',
    ])
  })

  it('shows only game-relevant links for other games', () => {
    expect(webMoreLinks('cs2').map(l => l.path)).toEqual(['/guides'])
    expect(webMoreLinks('deadlock').map(l => l.path)).toEqual(['/guides'])
    expect(webMoreLinks('lol')).toEqual([])
  })

  it('never links the retired /valorant/playstyle redirect', () => {
    expect(webMoreLinks('valorant').some(l => l.path === '/valorant/playstyle')).toBe(false)
  })

  // When the web repo sits next to the desktop (monorepo checkout), every link must be a real page.
  const pages = join(__dirname, '../../../upforge-frontend/app/pages')
  const hasWeb = (() => { try { return statSync(pages).isDirectory() } catch { return false } })()
  it.runIf(hasWeb)('every link is a page on the web', () => {
    const names = new Set(readdirSync(pages))
    for (const game of ['valorant', 'cs2', 'deadlock', 'lol'] as const) {
      for (const l of webMoreLinks(game)) {
        const seg = l.path.slice(1)
        expect(names.has(`${seg}.vue`) || names.has(seg), l.path).toBe(true)
      }
    }
  })
})
