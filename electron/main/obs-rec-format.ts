/**
 * Crash-safe OBS recording container selection.
 *
 * Plain MP4 writes its index (moov atom) only at the end — interrupted recordings
 * become unreadable. MKV and Hybrid MP4 survive abrupt stops.
 */

import log from 'electron-log'
import type OBSWebSocket from 'obs-websocket-js'

export type CrashSafeObsRecFormat = 'hybrid_mp4' | 'mkv'

export function parseObsStudioVersion(
  version: string | null | undefined,
): { major: number; minor: number; patch: number } | null {
  if (!version) return null
  const match = version.trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] ?? 0),
  }
}

/** Hybrid MP4 is available from OBS Studio 30.2+. */
export function supportsHybridMp4(obsStudioVersion: string | null | undefined): boolean {
  const parsed = parseObsStudioVersion(obsStudioVersion)
  if (!parsed) return false
  if (parsed.major > 30) return true
  if (parsed.major === 30 && parsed.minor >= 2) return true
  return false
}

export function crashSafeObsRecFormat(
  obsStudioVersion: string | null | undefined,
): CrashSafeObsRecFormat {
  return supportsHybridMp4(obsStudioVersion) ? 'hybrid_mp4' : 'mkv'
}

async function setProfileParam(
  obs: OBSWebSocket,
  parameterCategory: string,
  parameterName: string,
  parameterValue: string,
): Promise<void> {
  try {
    await obs.call('SetProfileParameter', { parameterCategory, parameterName, parameterValue })
  } catch (err) {
    log.warn(
      `[OBS RecFormat] SetProfileParameter ${parameterCategory}/${parameterName} failed:`,
      err instanceof Error ? err.message : err,
    )
  }
}

/** Apply MKV (OBS 28–30.1) or Hybrid MP4 (OBS 30.2+) before recording starts. */
export async function applyCrashSafeObsRecFormat(
  obs: OBSWebSocket,
  obsStudioVersion: string | null | undefined,
): Promise<CrashSafeObsRecFormat> {
  const format = crashSafeObsRecFormat(obsStudioVersion)

  if (format === 'hybrid_mp4') {
    await setProfileParam(obs, 'SimpleOutput', 'RecFormat2', 'hybrid_mp4')
  } else {
    await setProfileParam(obs, 'SimpleOutput', 'RecFormat', 'mkv')
  }

  log.info(
    `[OBS RecFormat] Applied ${format} for OBS ${obsStudioVersion ?? 'unknown'}`,
  )
  return format
}
