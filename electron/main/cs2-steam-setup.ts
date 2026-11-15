/**
 * CS2 Steam setup — Steam persona for demo player matching, plus cleanup of a legacy demo cfg.
 */

import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'
import { getCandidateCS2CsgoDirs } from './cs2-demo-finder'

const execAsync = promisify(exec)
const IS_WIN = process.platform === 'win32'

// Legacy (removed): we used to write these into the player's CS2 cfg folder.
const LEGACY_DEMO_CFG_NAME = 'upforge_demo.cfg'
const LEGACY_AUTOEXEC_EXEC_LINE = 'exec upforge_demo'
const LEGACY_DEMO_CVAR_LINE = 'cl_demo_auto_recording 1'
const STEAM_ID_BASE = BigInt('76561197960265728')

async function getSteamPath(): Promise<string | null> {
  if (!IS_WIN) return null
  for (const key of [
    'HKCU\\Software\\Valve\\Steam',
    'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam',
    'HKLM\\SOFTWARE\\Valve\\Steam',
  ]) {
    for (const valueName of ['SteamPath', 'InstallPath']) {
      try {
        const { stdout } = await execAsync(
          `reg query "${key}" /v ${valueName}`,
          { windowsHide: true, timeout: 5000 },
        )
        const match = new RegExp(`${valueName}\\s+REG_SZ\\s+(.+)`, 'i').exec(stdout)
        if (match?.[1]?.trim()) return match[1].trim()
      } catch { /* try next */ }
    }
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

function readLoginUsersVdf(steamPath: string): string | null {
  const loginUsersPath = path.join(steamPath, 'config', 'loginusers.vdf')
  if (!fs.existsSync(loginUsersPath)) return null
  try {
    return fs.readFileSync(loginUsersPath, 'utf-8')
  } catch {
    return null
  }
}

function recentSteamIdFromLoginUsers(content: string): string | null {
  let recentSteamId: string | null = null
  const blockRe = /"(\d{17})"\s*\{([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(content)) !== null) {
    if (/"MostRecent"\s*"1"/.test(m[2])) {
      recentSteamId = m[1]
      break
    }
  }
  if (!recentSteamId) {
    const first = /"(\d{17})"/.exec(content)
    recentSteamId = first?.[1] ?? null
  }
  return recentSteamId
}

function personaFromLoginBlock(block: string): string | null {
  const match = /"PersonaName"\s*"([^"]*)"/.exec(block)
  const name = match?.[1]?.trim()
  return name || null
}

/** Steam display name for the active account — used to find kills in .dem files. */
export async function getSteamPersonaName(): Promise<string | null> {
  if (!IS_WIN) return null
  const steamPath = await getSteamPath()
  if (!steamPath) return null

  const content = readLoginUsersVdf(steamPath)
  if (!content) return null

  const recentSteamId = recentSteamIdFromLoginUsers(content)
  if (!recentSteamId) return null

  const blockRe = new RegExp(`"${recentSteamId}"\\s*\\{([^}]*)\\}`, 'g')
  const match = blockRe.exec(content)
  if (match) {
    const persona = personaFromLoginBlock(match[1])
    if (persona) return persona
  }

  const accountId = steamId64ToAccountId(recentSteamId)
  if (!accountId) return null

  const localConfigPath = path.join(steamPath, 'userdata', accountId, 'config', 'localconfig.vdf')
  if (!fs.existsSync(localConfigPath)) return null

  try {
    const localConfig = fs.readFileSync(localConfigPath, 'utf-8')
    const personaMatch = /"PersonaName"\s*"([^"]*)"/.exec(localConfig)
    const persona = personaMatch?.[1]?.trim()
    return persona || null
  } catch {
    return null
  }
}

/**
 * Older builds wrote `cfg/upforge_demo.cfg` (containing `cl_demo_auto_recording 1`)
 * and appended `exec upforge_demo` to the player's autoexec. That cvar does not
 * exist in CS2, so the edit did nothing. Undo it: drop our exec line and delete
 * our cfg only when it still holds exactly what we wrote.
 */
export function removeLegacyDemoCfgFromDir(cfgDir: string): boolean {
  let changed = false
  const autoexecPath = path.join(cfgDir, 'autoexec.cfg')
  if (fs.existsSync(autoexecPath)) {
    const content = fs.readFileSync(autoexecPath, 'utf-8')
    const lines = content.split(/\r?\n/)
    const kept = lines.filter((line) => line.trim() !== LEGACY_AUTOEXEC_EXEC_LINE)
    if (kept.length !== lines.length) {
      const eol = content.includes('\r\n') ? '\r\n' : '\n'
      const body = kept.join(eol).trimEnd()
      fs.writeFileSync(autoexecPath, body ? `${body}${eol}` : '', 'utf-8')
      changed = true
    }
  }
  const demoCfgPath = path.join(cfgDir, LEGACY_DEMO_CFG_NAME)
  if (fs.existsSync(demoCfgPath)) {
    const existing = fs.readFileSync(demoCfgPath, 'utf-8').trim()
    if (existing === LEGACY_DEMO_CVAR_LINE) {
      fs.unlinkSync(demoCfgPath)
      changed = true
    }
  }
  return changed
}

/** Remove the legacy demo cfg from every CS2 cfg folder on disk. Never throws. */
export async function removeLegacyCs2DemoConfig(): Promise<{ cleaned: string[] }> {
  if (!IS_WIN) return { cleaned: [] }
  const cleaned: string[] = []
  try {
    const csgoDirs = await getCandidateCS2CsgoDirs()
    for (const csgoDir of csgoDirs) {
      const cfgDir = path.join(csgoDir, 'cfg')
      try {
        if (removeLegacyDemoCfgFromDir(cfgDir)) {
          cleaned.push(cfgDir)
          log.info('[CS2Setup] Removed legacy demo cfg from', cfgDir)
        }
      } catch (err) {
        log.warn('[CS2Setup] Could not remove legacy demo cfg:', err instanceof Error ? err.message : String(err))
      }
    }
  } catch { /* CS2 not found — nothing to undo */ }
  return { cleaned }
}
