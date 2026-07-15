import { describe, expect, it } from 'vitest'
import {
  recordingPlayerImage,
  recordingPlayerLabel,
  resolveRecordingAgent,
} from './recording-display'
import type { PendingRecording } from '../env.d.ts'

function rec(overrides: Partial<PendingRecording> = {}): PendingRecording {
  return {
    id: '1',
    path: '/tmp/a.mp4',
    game: 'valorant',
    map: 'Breeze',
    agent: null,
    gameMode: 'COMPETITIVE',
    recordedAt: Date.now(),
    fileSize: 1,
    analysed: false,
    ...overrides,
  } as PendingRecording
}

describe('resolveRecordingAgent', () => {
  it('prefers top-level agent', () => {
    expect(resolveRecordingAgent(rec({ agent: 'Jett', timeline: { agent: 'Sage' } as PendingRecording['timeline'] }))).toBe('Jett')
  })

  it('falls back to timeline.agent then finalStats.agent', () => {
    expect(
      resolveRecordingAgent(
        rec({
          agent: null,
          timeline: { agent: 'Omen', finalStats: { kills: 0, deaths: 0, assists: 0, score: 0, headshotPct: null, agent: 'Cypher' } },
        }),
      ),
    ).toBe('Omen')
    expect(
      resolveRecordingAgent(
        rec({
          agent: null,
          timeline: { agent: null, finalStats: { kills: 0, deaths: 0, assists: 0, score: 0, headshotPct: null, agent: 'Cypher' } },
        }),
      ),
    ).toBe('Cypher')
  })
})

describe('recordingPlayerLabel / image', () => {
  it('shows Unknown agent only when no agent is available anywhere', () => {
    expect(recordingPlayerLabel(rec({ agent: null, timeline: null }))).toBe('Unknown agent')
  })

  it('uses timeline agent for label and portrait when rec.agent is stale', () => {
    const stale = rec({
      agent: null,
      timeline: { agent: 'Reyna' },
    })
    expect(recordingPlayerLabel(stale)).toBe('Reyna')
    expect(recordingPlayerImage(stale)).toContain('media.valorant-api.com/agents/')
  })
})
