import { afterEach, describe, expect, it, vi } from 'vitest'
import { launchConfigFromInfo, launchTrainer, sessionEndedMessage, trainerLaunchConfig } from './trainer-launch'

afterEach(() => { vi.unstubAllGlobals() })

describe('trainer launch helper', () => {
  it('always sends duration_seconds, and user_drill_id only for a real drill', () => {
    expect(trainerLaunchConfig({ scenario: 'flick' })).toEqual({ scenario: 'flick', duration_seconds: 60, difficulty: 'medium' })
    expect(trainerLaunchConfig({ scenario: 'flick', duration_seconds: 90, difficulty: 'hard', user_drill_id: 4 }))
      .toEqual({ scenario: 'flick', duration_seconds: 90, difficulty: 'hard', user_drill_id: 4 })
    expect(trainerLaunchConfig({ scenario: 'flick', user_drill_id: null })).not.toHaveProperty('user_drill_id')
  })
  it('surfaces { ok: false } and thrown errors as a failure', async () => {
    const launch = vi.fn().mockResolvedValueOnce({ ok: false, error: 'Binary missing' }).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ ok: true, launchId: 3 })
    vi.stubGlobal('window', { api: { trainer: { launch } } })
    expect(await launchTrainer({ scenario: 'flick' })).toMatchObject({ ok: false, error: 'Binary missing' })
    expect(await launchTrainer({ scenario: 'flick' })).toMatchObject({ ok: false, error: 'boom' })
    expect(await launchTrainer({ scenario: 'gridshot', duration_seconds: 30 })).toMatchObject({ ok: true, launchId: 3, config: { scenario: 'gridshot', duration_seconds: 30 } })
    expect(launch).toHaveBeenLastCalledWith({ scenario: 'gridshot', duration_seconds: 30, difficulty: 'medium' })
    expect(launch.mock.calls.every(([cfg]) => !('duration' in cfg))).toBe(true)
  })
  it('rebuilds "Play again" from the launch main sent with the result', () => {
    expect(launchConfigFromInfo({ launchId: 1, scenario: 'flick', duration_seconds: 60, difficulty: 'pro', user_drill_id: 9 }))
      .toEqual({ scenario: 'flick', duration_seconds: 60, difficulty: 'pro', user_drill_id: 9 })
    expect(launchConfigFromInfo(undefined)).toBeNull()
  })
  it('says nothing when the player quit, a short line otherwise', () => {
    expect(sessionEndedMessage({ reason: 'user_exit' })).toBeNull()
    expect(sessionEndedMessage({ reason: 'completed' })).toBeNull()
    expect(sessionEndedMessage({ reason: 'launch_failed', message: 'x' })).toBeNull()
    expect(sessionEndedMessage({ reason: 'crashed' })).toMatch(/closed/)
    expect(sessionEndedMessage({ reason: 'unknown_scenario' })).toMatch(/Update UpForge/)
    expect(sessionEndedMessage({ reason: 'invalid_config' })).toBeTruthy()
    expect(sessionEndedMessage({ reason: 'error' })).toBeTruthy()
  })
})
