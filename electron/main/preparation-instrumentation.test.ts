import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron-log', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const trackFunnelEvent = vi.fn()
const trackPreparationStarted = vi.fn()
const trackPreparationCompleted = vi.fn()

vi.mock('./funnel-events', () => ({
  trackFunnelEvent: (...args: unknown[]) => trackFunnelEvent(...args),
  trackPreparationStarted: (...args: unknown[]) => trackPreparationStarted(...args),
  trackPreparationCompleted: (...args: unknown[]) => trackPreparationCompleted(...args),
}))

import {
  beginPreparation,
  setPrepStep,
  completePreparation,
  failPreparation,
  getActivePrepHeartbeat,
} from './preparation-instrumentation'

describe('preparation-instrumentation', () => {
  beforeEach(() => {
    trackFunnelEvent.mockClear()
    trackPreparationStarted.mockClear()
    trackPreparationCompleted.mockClear()
    completePreparation()
  })

  afterEach(() => {
    completePreparation()
  })

  it('tracks start and step heartbeats state', () => {
    beginPreparation('valorant', null)
    expect(trackPreparationStarted).toHaveBeenCalledWith('valorant')
    setPrepStep('dashboard_row', 'rec-1')
    const hb = getActivePrepHeartbeat()
    expect(hb?.step).toBe('dashboard_row')
    expect(hb?.recordingId).toBe('rec-1')
  })

  it('emits preparation_failed with code and step', () => {
    beginPreparation('valorant', 'rec-1')
    setPrepStep('compress')
    const result = failPreparation('Preparing did not complete — open the dashboard')
    expect(result.code).toBe('preparation_settled_stuck')
    expect(result.step).toBe('compress')
    expect(trackFunnelEvent).toHaveBeenCalledWith(
      'preparation_failed',
      expect.objectContaining({ failure_code: 'preparation_settled_stuck', prep_step: 'compress' }),
    )
    expect(getActivePrepHeartbeat()).toBeNull()
  })

  it('completes preparation', () => {
    beginPreparation('valorant')
    completePreparation('valorant')
    expect(trackPreparationCompleted).toHaveBeenCalledWith('valorant')
    expect(getActivePrepHeartbeat()).toBeNull()
  })
})
