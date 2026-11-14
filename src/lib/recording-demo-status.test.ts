import { describe, expect, it } from 'vitest'
import { demoSyncExplainer, demoSyncExplainerShort } from './recording-demo-status'
import { waitingMatchDataSubtitle } from './post-match-copy'

// The Valve demo can only be fetched once CS2 is closed: the copy must say so plainly.
describe('CS2 demo wait copy', () => {
  it('says coaching starts when you close CS2', () => {
    for (const line of [demoSyncExplainer('cs2'), demoSyncExplainerShort('cs2'), waitingMatchDataSubtitle('cs2')]) {
      expect(line).toContain('Coaching starts when you close CS2')
    }
  })

  it('keeps attach as the between-match route', () => {
    expect(demoSyncExplainer('cs2')).toMatch(/attach/i)
    expect(demoSyncExplainerShort('cs2')).toMatch(/attach/i)
  })

  it('leaves Deadlock copy alone', () => {
    expect(demoSyncExplainer('deadlock')).not.toContain('CS2')
  })
})
