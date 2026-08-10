import { describe, expect, it } from 'vitest'
import { analysisResultsUrl, desktopVodResultsUrl } from './games'

describe('desktopVodResultsUrl', () => {
  it('routes CS2 analysis_logs to the shared valorant results viewer', () => {
    expect(desktopVodResultsUrl('cs2', 532)).toBe('https://upforge.gg/valorant/results/532')
  })

  it('routes LoL analysis_logs to the shared valorant results viewer', () => {
    expect(desktopVodResultsUrl('lol', 532)).toBe('https://upforge.gg/valorant/results/532')
  })

  it('keeps web-style game paths for Valorant and Deadlock analysis ids', () => {
    expect(desktopVodResultsUrl('valorant', 10)).toBe('https://upforge.gg/valorant/results/10')
    expect(desktopVodResultsUrl('deadlock', 10)).toBe('https://upforge.gg/deadlock/results/10')
  })
})

describe('analysisResultsUrl', () => {
  it('uses per-game web results paths for native game ids', () => {
    expect(analysisResultsUrl('lol', 3)).toBe('https://upforge.gg/lol/results/3')
    expect(analysisResultsUrl('cs2', 'job-1')).toBe('https://upforge.gg/cs2/results/job-1')
  })
})
