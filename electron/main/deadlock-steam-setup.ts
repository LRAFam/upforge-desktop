/**
 * Silently ensure Deadlock launches with -condebug so console.log match detection works.
 * Merges into existing Steam launch options — no manual Properties → Launch Options step.
 */

import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'

const execAsync = promisify(exec)
const IS_WIN = process.platform === 'win32'
export const DEADLOCK_STEAM_APP_ID = '1422450'
const CONDEBUG_FLAG = '-condebug'
const STEAM_ID_BASE = BigInt('76561197960265728')

export interface DeadlockSteamSetupResult {
  ok: boolean
  alreadyConfigured: boolean
  /** Game must be restarted (not just UpForge) for -condebug to take effect. */
  needsGameRestart: boolean
  error?: string
}

async function getSteamPath(): Promise<string | null> {
  if (!IS_WIN) return null
  try {
    const { stdout } = await execAsync(
      'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath',
      { windowsHide: true, timeout: 5000 },
    )
    const match = /InstallPath\s+REG_SZ\s+(.+)/i.exec(stdout)
    if (match) return match[1].trim()
  } catch {
    try {
      const { stdout } = await execAsync(
        'reg query "HKLM\\SOFTWARE\\Valve\\Steam" /v InstallPath',
        { windowsHide: true, timeout: 5000 },
      )
      const match = /InstallPath\s+REG_SZ\s+(.+)/i.exec(stdout)
      if (match) return match[1].trim()
    } catch { /* ignore */ }
  }
  return null
}

function steamId64ToAccountId(steamId64: string): string | null {
  try {
    const id = BigInt(steamId64)
    if (id <= STEAM_ID_BASE) return null
    return (id - STEAM_ID_BASE).toString()
  } catch {
    return null
  }
}

async function findSteamUserDataConfigDir(): Promise<string | null> {
  const steamPath = await getSteamPath()
  if (!steamPath) return null

  const loginUsersPath = path.join(steamPath, 'config', 'loginusers.vdf')
  if (!fs.existsSync(loginUsersPath)) return null

  let content = ''
  try {
    content = fs.readFileSync(loginUsersPath, 'utf-8')
  } catch {
    return null
  }

  let recentSteamId: string | null = null
  const blockRe = /"(\d{17})"\s*\{([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(content)) !== null) {
    const block = m[2]
    if (/"MostRecent"\s*"1"/.test(block)) {
      recentSteamId = m[1]
      break
    }
  }

  if (!recentSteamId) {
    const first = /"(\d{17})"/.exec(content)
    recentSteamId = first?.[1] ?? null
  }
  if (!recentSteamId) return null

  const accountId = steamId64ToAccountId(recentSteamId)
  if (!accountId) return null

  const configDir = path.join(steamPath, 'userdata', accountId, 'config')
  return fs.existsSync(configDir) ? configDir : null
}

function mergeLaunchOptions(existing: string, flag: string): { merged: string; changed: boolean } {
  const trimmed = existing.trim()
  if (!trimmed) return { merged: flag, changed: true }
  const tokens = trimmed.split(/\s+/).filter(Boolean)
  if (tokens.includes(flag)) return { merged: trimmed, changed: false }
  return { merged: `${trimmed} ${flag}`, changed: true }
}

function patchLaunchOptionsInLocalConfig(
  content: string,
  appId: string,
  flag: string,
): { content: string; changed: boolean } {
  const appMarker = `"${appId}"`
  const appIdx = content.indexOf(appMarker)

  if (appIdx >= 0) {
    const windowEnd = Math.min(content.length, appIdx + 1200)
    const slice = content.slice(appIdx, windowEnd)
    const launchRe = /"LaunchOptions"\s*"([^"]*)"/
    const match = launchRe.exec(slice)
    if (match) {
      const { merged, changed } = mergeLaunchOptions(match[1], flag)
      if (!changed) return { content, changed: false }
      const replacement = `"LaunchOptions"\t"${merged}"`
      const start = appIdx + match.index!
      const end = start + match[0].length
      return {
        content: content.slice(0, start) + replacement + content.slice(end),
        changed: true,
      }
    }

    const braceIdx = slice.indexOf('{')
    if (braceIdx >= 0) {
      const insertAt = appIdx + braceIdx + 1
      const insertion = `\n\t\t\t"LaunchOptions"\t\t"${flag}"`
      return {
        content: content.slice(0, insertAt) + insertion + content.slice(insertAt),
        changed: true,
      }
    }
  }

  const appsRe = /"Apps"\s*\{/
  const appsMatch = appsRe.exec(content)
  if (!appsMatch) return { content, changed: false }

  const insertAt = appsMatch.index! + appsMatch[0].length
  const block = `\n\t\t\t"${appId}"\n\t\t\t{\n\t\t\t\t"LaunchOptions"\t\t"${flag}"\n\t\t\t}`
  return {
    content: content.slice(0, insertAt) + block + content.slice(insertAt),
    changed: true,
  }
}

export function launchOptionsIncludeCondebug(options: string | null | undefined): boolean {
  if (!options) return false
  return options.split(/\s+/).includes(CONDEBUG_FLAG)
}

/** Write -condebug into Steam per-game launch options if missing. */
export async function ensureDeadlockSteamLaunchOptions(): Promise<DeadlockSteamSetupResult> {
  if (!IS_WIN) {
    return { ok: false, alreadyConfigured: false, needsGameRestart: false, error: 'Windows only' }
  }

  const configDir = await findSteamUserDataConfigDir()
  if (!configDir) {
    return { ok: false, alreadyConfigured: false, needsGameRestart: false, error: 'Steam user config not found' }
  }

  const localConfigPath = path.join(configDir, 'localconfig.vdf')
  if (!fs.existsSync(localConfigPath)) {
    return { ok: false, alreadyConfigured: false, needsGameRestart: false, error: 'localconfig.vdf not found' }
  }

  try {
    const original = fs.readFileSync(localConfigPath, 'utf-8')
    const { content, changed } = patchLaunchOptionsInLocalConfig(original, DEADLOCK_STEAM_APP_ID, CONDEBUG_FLAG)

    if (!changed) {
      return { ok: true, alreadyConfigured: true, needsGameRestart: false }
    }

    fs.writeFileSync(`${localConfigPath}.upforge.bak`, original, 'utf-8')
    fs.writeFileSync(localConfigPath, content, 'utf-8')
    log.info('[DeadlockSteam] Added -condebug to Deadlock Steam launch options')
    return { ok: true, alreadyConfigured: false, needsGameRestart: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn('[DeadlockSteam] Failed to patch localconfig.vdf:', msg)
    return { ok: false, alreadyConfigured: false, needsGameRestart: false, error: msg }
  }
}
