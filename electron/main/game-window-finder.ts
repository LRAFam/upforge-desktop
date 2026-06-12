/**
 * Resolve OBS window strings (title:class:executable) for running games.
 * CS2 / Deadlock block game-capture hooks — window_capture needs an accurate window id.
 */

import { exec } from 'child_process'
import log from 'electron-log'

const IS_WIN = process.platform === 'win32'

const GAME_PROCESS: Record<string, { exe: string; processName: string }> = {
  valorant: { exe: 'VALORANT-Win64-Shipping.exe', processName: 'VALORANT-Win64-Shipping' },
  cs2: { exe: 'cs2.exe', processName: 'cs2' },
  deadlock: { exe: 'deadlock.exe', processName: 'deadlock' },
}

/** Static fallbacks when the game process has no visible window yet. */
export const OBS_WINDOW_FALLBACKS: Record<string, string> = {
  valorant: 'VALORANT  :UnrealWindow:VALORANT-Win64-Shipping.exe',
  cs2: 'Counter-Strike 2:SDL_app:cs2.exe',
  deadlock: 'Deadlock:SDL_app:deadlock.exe',
}

/**
 * Find the largest visible window owned by a game process.
 * Returns OBS format `Title:ClassName:executable.exe`, or null if not running.
 */
export async function findObsWindowString(game: string): Promise<string | null> {
  const normalized = game.toLowerCase()
  const meta = GAME_PROCESS[normalized]
  if (!meta) return OBS_WINDOW_FALLBACKS[normalized] ?? null
  if (!IS_WIN) return OBS_WINDOW_FALLBACKS[normalized] ?? null

  const script = [
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Text;',
    'using System.Runtime.InteropServices;',
    'public class UpForgeWin {',
    '  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);',
    '  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnum, IntPtr lParam);',
    '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);',
    '  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);',
    '  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);',
    '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);',
    '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);',
    '  public struct RECT { public int L, T, R, B; }',
    '  public static string Find(uint[] pids, string exeFile) {',
    '    string best = null; int bestArea = 0;',
    '    EnumWindows((h, _) => {',
    '      uint pid; GetWindowThreadProcessId(h, out pid);',
    '      bool match = false;',
    '      for (int i = 0; i < pids.Length; i++) { if (pids[i] == pid) { match = true; break; } }',
    '      if (!match || !IsWindowVisible(h)) return true;',
    '      var title = new StringBuilder(512); GetWindowText(h, title, 512);',
    '      if (title.Length == 0) return true;',
    '      RECT rect; if (!GetWindowRect(h, out rect)) return true;',
    '      int area = Math.Max(0, rect.R - rect.L) * Math.Max(0, rect.B - rect.T);',
    '      if (area < 400 * 300) return true;',
    '      if (area > bestArea) {',
    '        var cls = new StringBuilder(256); GetClassName(h, cls, 256);',
    '        best = title.ToString() + ":" + cls.ToString() + ":" + exeFile;',
    '        bestArea = area;',
    '      }',
    '      return true;',
    '    }, IntPtr.Zero);',
    '    return best;',
    '  }',
    '}"@;',
    `$procs = Get-Process -Name '${meta.processName}' -ErrorAction SilentlyContinue;`,
    'if (!$procs) { Write-Output ""; exit 0 };',
    '$pids = @($procs | ForEach-Object { [uint32]$_.Id });',
    `$result = [UpForgeWin]::Find($pids, '${meta.exe}');`,
    'if ($result) { Write-Output $result }',
  ].join(' ')

  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`,
      { windowsHide: true, timeout: 8000 },
      (err, stdout) => {
        if (err) {
          log.debug('[GameWindowFinder] Lookup failed for', game, err.message)
          resolve(null)
          return
        }
        const line = stdout.trim()
        if (line && line.includes(':')) {
          log.info('[GameWindowFinder] Resolved window for', game, ':', line)
          resolve(line)
          return
        }
        resolve(null)
      },
    )
  })
}

/** Prefer a live window; fall back to static OBS defaults. */
export async function resolveObsCaptureWindow(game: string): Promise<string> {
  const normalized = game.toLowerCase()
  const live = await findObsWindowString(normalized)
  if (live) return live
  return OBS_WINDOW_FALLBACKS[normalized] ?? OBS_WINDOW_FALLBACKS.valorant
}
