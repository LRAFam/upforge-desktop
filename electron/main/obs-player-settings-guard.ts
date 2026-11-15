/**
 * Keep the player's own OBS setup intact.
 *
 * Output mode, encoder, canvas and recording folder all live in the active OBS
 * profile. UpForge writes those only while its own "UpForge" profile is active:
 * it switches to that profile before a match, then puts the player's profile and
 * program scene back afterwards. While anything is live (stream, recording,
 * replay buffer, virtual camera) it changes nothing at all.
 */

import log from 'electron-log'
import type OBSWebSocket from 'obs-websocket-js'
import { readGuidedObsOutputs } from './obs-guided-setup'
import { UPFORGE_OBS_PROFILE_NAME } from './obs-profile-installer'
import { withTimeout } from './promise-timeout'

type ObsCaller = Pick<OBSWebSocket, 'call'>

const GUARD_REQUEST_TIMEOUT_MS = 3000

function bounded<T>(request: Promise<T>, what: string): Promise<T> {
  return withTimeout(request, GUARD_REQUEST_TIMEOUT_MS, `OBS ${what} timed out`)
}

/** What UpForge changed and must put back once its match output has stopped. */
export interface PlayerObsRestore {
  /** Profile active before UpForge switched to its own; null when no switch happened. */
  profileName: string | null
  /** Program scene active before UpForge switched to its gameplay scene. */
  sceneName: string | null
}

/** True when any OBS output is live. Unknown status counts as live (fail closed). */
export async function anyObsOutputActive(obs: ObsCaller): Promise<boolean> {
  try {
    const outputs = await bounded(readGuidedObsOutputs(obs as never), 'output status')
    if (outputs.recording || outputs.streaming || outputs.replayBuffer) return true
  } catch (err) {
    log.warn('[OBS Guard] Could not read OBS output status — leaving OBS settings alone:', err)
    return true
  }
  try {
    const virtualCam = await bounded(obs.call('GetVirtualCamStatus'), 'virtual camera status') as { outputActive?: boolean }
    return virtualCam.outputActive === true
  } catch {
    // Older OBS builds or no virtual camera output: nothing live there.
    return false
  }
}

export async function getCurrentObsProfile(obs: ObsCaller): Promise<{ current: string | null; profiles: string[] }> {
  const res = await bounded(obs.call('GetProfileList'), 'profile list') as { currentProfileName?: string; profiles?: string[] }
  return { current: res.currentProfileName ?? null, profiles: res.profiles ?? [] }
}

/** Profile writes are allowed only while UpForge's own profile is active. */
export async function isUpForgeProfileActive(obs: ObsCaller): Promise<boolean> {
  try {
    return (await getCurrentObsProfile(obs)).current === UPFORGE_OBS_PROFILE_NAME
  } catch (err) {
    log.warn('[OBS Guard] Could not read the active OBS profile:', err)
    return false
  }
}

export type EnterUpForgeProfileResult =
  | { active: true; previousProfile: string | null }
  | { active: false; reason: 'outputs_active' | 'switch_failed' }

/**
 * Switch OBS to the UpForge profile so later writes never land in the player's profile.
 * `previousProfile` is the player's profile to restore (null when UpForge was already active).
 */
export async function enterUpForgeObsProfile(obs: ObsCaller): Promise<EnterUpForgeProfileResult> {
  try {
    const { current, profiles } = await getCurrentObsProfile(obs)
    if (current === UPFORGE_OBS_PROFILE_NAME) return { active: true, previousProfile: null }
    if (await anyObsOutputActive(obs)) return { active: false, reason: 'outputs_active' }
    if (profiles.includes(UPFORGE_OBS_PROFILE_NAME)) {
      await obs.call('SetCurrentProfile', { profileName: UPFORGE_OBS_PROFILE_NAME })
    } else {
      // CreateProfile also makes the new profile current.
      await obs.call('CreateProfile', { profileName: UPFORGE_OBS_PROFILE_NAME })
    }
    if ((await getCurrentObsProfile(obs)).current !== UPFORGE_OBS_PROFILE_NAME) {
      return { active: false, reason: 'switch_failed' }
    }
    log.info('[OBS Guard] Switched OBS to the UpForge profile (was', current, ')')
    return { active: true, previousProfile: current }
  } catch (err) {
    log.warn('[OBS Guard] Could not switch to the UpForge OBS profile:', err)
    return { active: false, reason: 'switch_failed' }
  }
}

/**
 * Put back what UpForge changed. Returns true when nothing is left to restore.
 * Leaves OBS alone if the player has since picked another profile or scene,
 * and waits (returns false) while any output is still live.
 */
export async function restorePlayerObsState(
  obs: ObsCaller,
  restore: PlayerObsRestore,
  gameplaySceneName: string,
): Promise<boolean> {
  if (!restore.profileName && !restore.sceneName) return true
  try {
    if (await anyObsOutputActive(obs)) return false
    if (restore.sceneName) {
      const program = await bounded(obs.call('GetCurrentProgramScene'), 'scene status') as { currentProgramSceneName?: string }
      if (program.currentProgramSceneName === gameplaySceneName) {
        await obs.call('SetCurrentProgramScene', { sceneName: restore.sceneName })
        log.info('[OBS Guard] Restored the player program scene:', restore.sceneName)
      }
    }
    if (restore.profileName) {
      const { current } = await getCurrentObsProfile(obs)
      if (current === UPFORGE_OBS_PROFILE_NAME) {
        await obs.call('SetCurrentProfile', { profileName: restore.profileName })
        log.info('[OBS Guard] Restored the player OBS profile:', restore.profileName)
      }
    }
    return true
  } catch (err) {
    log.warn('[OBS Guard] Could not restore the player OBS settings yet:', err)
    return false
  }
}
