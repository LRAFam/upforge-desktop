/**
 * CS2 Steam setup — auto demo recording cfg + Steam persona for demo player matching.
 */

import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'
import { getCandidateCS2CsgoDirs } from './cs2-demo-finder'

const execAsync = promisify(exec)
const IS_WIN = process.platform === 'win32'

const DEMO_CFG_NAME = 'upforge_demo.cfg'
const AUTOEXEC_EXEC_LINE = 'exec upforge_demo'
const DEMO_CVAR_LINE = 'cl_demo_auto_recording 1'
const STEAM_ID_BASE = BigInt('76561197960265728')

export interface Cs2DemoSetupResult {
  ok: boolean
  cfgPaths: string[]
  needsRestart: boolean
  error?: string
}

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

function writeDemoCfg(cfgDir: string): string {
  const demoCfgPath = path.join(cfgDir, DEMO_CFG_NAME)
  const contents = `${DEMO_CVAR_LINE}\n`
  if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true })
  if (fs.existsSync(demoCfgPath)) {
    const existing = fs.readFileSync(demoCfgPath, 'utf-8').trim()
    if (existing === contents.trim()) return demoCfgPath
  }
  fs.writeFileSync(demoCfgPath, contents, 'utf-8')
  return demoCfgPath
}

function mergeAutoexec(cfgDir: string): boolean {
  const autoexecPath = path.join(cfgDir, 'autoexec.cfg')
  let content = ''
  if (fs.existsSync(autoexecPath)) {
    content = fs.readFileSync(autoexecPath, 'utf-8')
    if (/cl_demo_auto_recording\s+1/i.test(content)) return false
    if (content.includes(AUTOEXEC_EXEC_LINE)) return false
  }

  if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true })
  const next = content.trimEnd() + (content.trim() ? '\n' : '') + `${AUTOEXEC_EXEC_LINE}\n`
  fs.writeFileSync(autoexecPath, next, 'utf-8')
  return true
}

/**
 * Install cl_demo_auto_recording via cfg/upforge_demo.cfg + autoexec exec line.
 * Writes to every CS2 cfg folder on disk (game/csgo and legacy csgo paths).
 */
export async function ensureCs2DemoRecordingConfig(): Promise<Cs2DemoSetupResult> {
  if (!IS_WIN) {
    return { ok: false, cfgPaths: [], needsRestart: false, error: 'Windows only' }
  }

  const csgoDirs = await getCandidateCS2CsgoDirs()
  if (!csgoDirs.length) {
    return { ok: false, cfgPaths: [], needsRestart: false, error: 'CS2 not found' }
  }

  try {
    const cfgPaths: string[] = []
    let needsRestart = false

    for (const csgoDir of csgoDirs) {
      const cfgDir = path.join(csgoDir, 'cfg')
      writeDemoCfg(cfgDir)
      if (mergeAutoexec(cfgDir)) needsRestart = true
      cfgPaths.push(path.join(cfgDir, DEMO_CFG_NAME))
      log.info('[CS2Setup] Demo recording cfg ready at', cfgDir)
    }

    return { ok: true, cfgPaths, needsRestart }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn('[CS2Setup] Failed to write demo cfg:', msg)
    return { ok: false, cfgPaths: [], needsRestart: false, error: msg }
  }
}
