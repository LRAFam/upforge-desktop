import { app } from 'electron'
import { exec, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import log from 'electron-log'
import {
  downloadValveDemoArchive,
  type ValveDemoDownloadProgressHandler,
} from './valve-demo-download'
import {
  CMsgGCCStrike15_v2_MatchListSchema,
  fromBinary,
  type CMsgGCCStrike15_v2_MatchList,
} from 'csgo-protobuf'
import { getCs2ValveDemoDownloadDir } from './cs2-demo-dirs'
import {
  pickValveMatchForSession,
  valveMatchFromProtobuf,
  type ValveMatchSummary,
} from './cs2-valve-match'

const execAsync = promisify(exec)
const IS_WIN = process.platform === 'win32'

const BOILER_EXIT = {
  Success: 0,
  Error: 1,
  InvalidArgs: 2,
  CommunicationFailure: 3,
  AlreadyConnected: 4,
  SteamRestartRequired: 5,
  SteamNotRunningOrLoggedIn: 6,
  UserNotLoggedIn: 7,
  NoMatchesFound: 8,
  WriteFileFailure: 9,
} as const

export type ValveDemoDownloadResult =
  | { ok: true; demoPath: string; match: ValveMatchSummary }
  | { ok: false; error: string; code?: string }

function boilerPlatformDir(): string {
  if (process.platform === 'win32') return 'win32-x64'
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  }
  return 'linux-x64'
}

function resolveBoilerWritterExe(): string {
  const platformDir = boilerPlatformDir()
  const exeName = process.platform === 'win32' ? 'boiler-writter.exe' : 'boiler-writter'
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'boiler-writter', platformDir, exeName)
  }
  return path.join(
    app.getAppPath(),
    'node_modules',
    '@akiver',
    'boiler-writter',
    'dist',
    'bin',
    platformDir,
    exeName,
  )
}

async function isSteamRunning(): Promise<boolean> {
  if (!IS_WIN) return false
  try {
    const { stdout } = await execAsync('tasklist /fi "IMAGENAME eq steam.exe" /fo csv /nh', {
      windowsHide: true,
      timeout: 5000,
    })
    return stdout.toLowerCase().includes('steam.exe')
  } catch {
    return false
  }
}

async function killCs2Processes(): Promise<void> {
  if (!IS_WIN) return
  try {
    await execAsync('taskkill /IM cs2.exe /F', { windowsHide: true })
    await sleep(800)
  } catch {
    /* not running */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function boilerExitMessage(code: number): string {
  switch (code) {
    case BOILER_EXIT.SteamNotRunningOrLoggedIn:
      return 'Steam is not running or not logged in — open Steam and try again.'
    case BOILER_EXIT.UserNotLoggedIn:
      return 'No Steam account is logged in.'
    case BOILER_EXIT.SteamRestartRequired:
      return 'Steam needs a restart before UpForge can fetch CS2 demos.'
    case BOILER_EXIT.AlreadyConnected:
      return 'CS2 is still connected to Steam — close CS2 completely, then retry.'
    case BOILER_EXIT.CommunicationFailure:
      return 'Could not reach the CS2 Game Coordinator — check Steam connection.'
    case BOILER_EXIT.NoMatchesFound:
      return 'No recent Valve matchmaking matches found on this Steam account.'
    default:
      return `Steam demo lookup failed (code ${code}).`
  }
}

async function fetchRecentValveMatchesFromGc(): Promise<CMsgGCCStrike15_v2_MatchList> {
  const exe = resolveBoilerWritterExe()
  if (!fs.existsSync(exe)) {
    throw new Error('Demo downloader binary is missing from this build.')
  }

  const infoPath = path.join(app.getPath('temp'), `upforge-matches-${Date.now()}.info`)
  await killCs2Processes()

  return new Promise((resolve, reject) => {
    const child = spawn(exe, [infoPath], {
      windowsHide: true,
      cwd: path.dirname(exe),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      if (text.startsWith('STEAMID:')) {
        log.info('[CS2ValveDemo] Steam account', text.slice(8).trim())
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text) log.info('[CS2ValveDemo] boiler:', text)
    })

    child.on('error', (err) => reject(err))

    child.on('exit', (code) => {
      void (async () => {
        if (code !== BOILER_EXIT.Success) {
          reject(new Error(boilerExitMessage(code ?? BOILER_EXIT.Error)))
          return
        }
        if (!fs.existsSync(infoPath)) {
          reject(new Error('Steam returned no match list.'))
          return
        }
        try {
          const bytes = new Uint8Array(fs.readFileSync(infoPath))
          fs.unlink(infoPath, () => {})
          resolve(fromBinary(CMsgGCCStrike15_v2_MatchListSchema, bytes))
        } catch (parseErr) {
          reject(parseErr instanceof Error ? parseErr : new Error(String(parseErr)))
        }
      })()
    })
  })
}

export async function listRecentValveMatches(): Promise<ValveMatchSummary[]> {
  const list = await fetchRecentValveMatchesFromGc()
  return list.matches
    .map((m) => valveMatchFromProtobuf(m))
    .filter((m): m is ValveMatchSummary => m !== null)
}

/**
 * Download the best-matching Valve MM demo for a session via Steam Game Coordinator.
 * Requires Steam running + logged in on Windows.
 */
export async function downloadCs2ValveDemoForSession(opts: {
  matchSessionStartMs: number
  gsiMap?: string | null
  customReplayDir?: string
  onProgress?: ValveDemoDownloadProgressHandler
}): Promise<ValveDemoDownloadResult> {
  if (!IS_WIN) {
    return { ok: false, error: 'Valve demo download is only supported on Windows.', code: 'unsupported' }
  }

  if (!(await isSteamRunning())) {
    return { ok: false, error: 'Steam is not running — open Steam, then retry demo sync.', code: 'steam_offline' }
  }

  const downloadDir = await getCs2ValveDemoDownloadDir(opts.customReplayDir)
  if (!downloadDir) {
    return { ok: false, error: 'CS2 install folder not found.', code: 'no_cs2_dir' }
  }
  fs.mkdirSync(downloadDir, { recursive: true })

  let matches: ValveMatchSummary[]
  try {
    opts.onProgress?.({ phase: 'gc_lookup', bytesDone: 0, bytesTotal: null, pct: null })
    matches = await listRecentValveMatches()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn('[CS2ValveDemo] GC fetch failed:', message)
    return { ok: false, error: message, code: 'gc_failed' }
  }

  const match = pickValveMatchForSession(matches, opts.matchSessionStartMs, opts.gsiMap)
  if (!match) {
    return {
      ok: false,
      error: 'No matching Valve matchmaking demo in your last 8 games.',
      code: 'no_match',
    }
  }

  const demoPath = path.join(downloadDir, `${match.fileName}.dem`)
  if (fs.existsSync(demoPath)) {
    return { ok: true, demoPath, match }
  }

  try {
    log.info('[CS2ValveDemo] Downloading', match.demoUrl, '→', demoPath)
    await downloadValveDemoArchive(match.demoUrl, demoPath, opts.onProgress)
    return { ok: true, demoPath, match }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn('[CS2ValveDemo] Download failed:', message)
    try { fs.unlinkSync(`${demoPath}.part`) } catch { /* ignore */ }
    try { fs.unlinkSync(demoPath) } catch { /* ignore */ }
    return { ok: false, error: message, code: 'download_failed' }
  }
}
