/**
 * UI v3 onboarding: status dot tones and game logos for the wizard steps.
 * Tones map to the v3 colour jobs: ok = win teal, warn = gold, error = loss,
 * live = something happening now (pulses), rec = recording (red, pulses), idle = not started.
 */
import type { PrimaryGame } from '../../../lib/games'
import valorantLogo from '../../../assets/games/valorant-logo.png'
import cs2Logo from '../../../assets/games/cs2-icon.png'
import deadlockLogo from '../../../assets/games/deadlock-icon.png'
import lolLogo from '../../../assets/games/lol-icon.webp'

export type StatusTone = 'ok' | 'warn' | 'error' | 'live' | 'rec' | 'idle'

export const ONBOARDING_GAME_LOGOS: Record<PrimaryGame, string> = {
  valorant: valorantLogo,
  cs2: cs2Logo,
  deadlock: deadlockLogo,
  lol: lolLogo,
}

/** Step 4 recording check: error first, then passed, then running, else idle. */
export function recordingCheckTone(s: { error: boolean; ready: boolean; connecting: boolean }): StatusTone {
  if (s.error) return 'warn'
  if (s.ready) return 'ok'
  if (s.connecting) return 'live'
  return 'idle'
}

/** Mission capture checks (OBS / Valorant / Capture / Recording). */
export function captureCheckTone(state: string): StatusTone {
  if (state === 'ok') return 'ok'
  if (state === 'active') return 'rec'
  if (state === 'error') return 'warn'
  return 'idle'
}

/** Mission progress rows (recording → riot → upload → analysis). */
export function progressRowTone(state: string): StatusTone {
  if (state === 'complete') return 'ok'
  if (state === 'active') return 'live'
  return 'idle'
}

/** The whole first-match mission. */
export function missionStageTone(stage: string): StatusTone {
  if (stage === 'recording') return 'rec'
  if (stage === 'ready') return 'ok'
  if (stage === 'failed') return 'warn'
  return 'live'
}

/** Same rule as the old message tone: unverified/disconnected = warn, recording = rec, else ok. */
export function captureMessageTone(s: {
  obsConnected: boolean
  valorantInFront: boolean
  captureVerified: boolean
  obsRecording: boolean
}): StatusTone {
  if (!s.obsConnected || (s.valorantInFront && !s.captureVerified)) return 'warn'
  if (s.obsRecording) return 'rec'
  return 'ok'
}
