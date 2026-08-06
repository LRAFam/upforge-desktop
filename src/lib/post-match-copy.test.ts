import { describe, expect, it } from 'vitest'
import {
  matchDataReadyStartingUpload,
  matchDataSourceLabel,
  waitingMatchDataBeforeAnalyse,
  waitingMatchDataSubtitle,
} from './post-match-copy'

describe('post-match-copy game awareness', () => {
  it('labels match-data source per game', () => {
    expect(matchDataSourceLabel('valorant')).toContain('Riot')
    expect(matchDataSourceLabel('cs2')).toContain('CS2')
    expect(matchDataSourceLabel('deadlock')).toContain('Deadlock')
    expect(matchDataSourceLabel('lol')).toContain('League')
    expect(matchDataSourceLabel('unknown')).toBe('match stats')
  })

  it('builds waiting / ready lines without hard-coding Riot for CS2', () => {
    expect(waitingMatchDataBeforeAnalyse('cs2')).toContain('CS2')
    expect(waitingMatchDataBeforeAnalyse('cs2')).not.toContain('Riot')
    expect(waitingMatchDataSubtitle('deadlock')).toContain('Deadlock')
    expect(matchDataReadyStartingUpload('valorant')).toContain('Riot')
  })
})
