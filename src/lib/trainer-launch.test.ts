import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { asTrainerResult, drillHasLesson, launchConfigFromInfo, launchTrainer, sessionEndedMessage, shellOpensTrainerResult, trainerLaunchConfig } from './trainer-launch'

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
  it('"Show the lesson" asks the trainer for the drill’s guided lesson; "Play again" after it does not', async () => {
    const launch = vi.fn().mockResolvedValue({ ok: true, launchId: 5 })
    vi.stubGlobal('window', { api: { trainer: { launch } } })
    const res = await launchTrainer({ scenario: 'hold_angle', duration_seconds: 60, difficulty: 'hard', lesson: true })
    expect(launch).toHaveBeenLastCalledWith({ scenario: 'hold_angle', duration_seconds: 60, difficulty: 'hard', lesson: true })
    expect(res.config).toEqual({ scenario: 'hold_angle', duration_seconds: 60, difficulty: 'hard' })
    await launchTrainer(res.config)
    expect(launch).toHaveBeenLastCalledWith({ scenario: 'hold_angle', duration_seconds: 60, difficulty: 'hard' })
  })
  it('offers "Show the lesson" only on drills that have a guided lesson in the bundled trainer', () => {
    for (const scenario of ['head_height', 'angle_clearing', 'hold_angle', 'jiggle_peek', 'strafe_aim']) expect(drillHasLesson(scenario), scenario).toBe(true)
    for (const scenario of ['flick', 'distance_switching', 'trade_window', 'operator_hold', '', 'nope']) expect(drillHasLesson(scenario), scenario).toBe(false)
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
  it('a refused mouse or crosshair setting names the setting and where to change it, not "pick another drill"', () => {
    expect(sessionEndedMessage({ reason: 'invalid_config', message: 'mouse_settings.sensitivity must be above 0' }))
      .toBe('The trainer can’t use your in-game sensitivity setting. Check it in Settings › Trainer, then try again.')
    expect(sessionEndedMessage({ reason: 'invalid_config', message: 'mouse_settings.fov must be from 1 to 179' }))
      .toBe('The trainer can’t use your horizontal FOV setting. Check it in Settings › Trainer, then try again.')
    expect(sessionEndedMessage({ reason: 'invalid_config', message: 'crosshair_settings.color must be three numbers' }))
      .toBe('The trainer can’t use your crosshair settings. Check them in Settings › Trainer, then try again.')
    // Anything else about the drill keeps the general line.
    expect(sessionEndedMessage({ reason: 'invalid_config', message: 'difficulty must be easy, medium, hard or pro' }))
      .toBe('The trainer couldn’t read this drill’s settings. Try again, or pick another drill.')
  })
  it('says when UpForge closed the trainer because a game or a match started', () => {
    expect(sessionEndedMessage({ reason: 'game_started' })).toBe('Closed the trainer because your game opened. This drill was not saved.')
    expect(sessionEndedMessage({ reason: 'match_started' })).toBe('Closed the trainer because your match started. This drill was not saved.')
  })
})

describe('trainer results outside Practice', () => {
  it('the app shell opens the results screen for a drill started from Home (or any other screen)', () => {
    expect(shellOpensTrainerResult('/dashboard')).toBe(true)
    expect(shellOpensTrainerResult('/report/abc')).toBe(true)
  })
  it('leaves Practice, calibration and the results screen to handle their own results', () => {
    for (const path of ['/training', '/training/calibration', '/trainer-results', '/login', '/post-game']) {
      expect(shellOpensTrainerResult(path)).toBe(false)
    }
  })
  it('accepts only a well-formed result', () => {
    expect(asTrainerResult({ scenario: 'flick', score: 70, completed_at: '2026-11-16T10:00:00Z' })).not.toBeNull()
    expect(asTrainerResult({ scenario: 'flick' })).toBeNull()
    expect(asTrainerResult(null)).toBeNull()
  })
})

describe('the results screen shows a drill’s lesson again', () => {
  const view = readFileSync(resolve(__dirname, '../views/TrainerResultsView.vue'), 'utf8')
  it('offers "Show the lesson" only on drills that have one, and launches the same drill with lesson: true', () => {
    expect(view).toContain('drillHasLesson(store.launchConfig.scenario)')
    expect(view).toContain('launchFromResults({ ...store.launchConfig, lesson: true })')
    expect(view).toMatch(/<UfButton v-if="canShowLesson"[^>]*@click="showLesson">Show the lesson<\/UfButton>/)
  })
})
