/**
 * OBS must start with cwd = bin/64bit (or the folder containing the exe).
 * Launching from another cwd fails locale/plugin load and WebSocket never binds.
 * @see https://github.com/obsproject/obs-studio/issues/2966
 */

import path from 'path'

export function obsExecutableWorkingDirectory(exePath: string): string {
  // OBS install paths on Windows use backslashes; Node on macOS/Linux treats `\`
  // as a normal character, so always use win32.dirname for drive-letter paths.
  if (/^[A-Za-z]:[\\/]/.test(exePath) || exePath.includes('\\')) {
    return path.win32.dirname(exePath)
  }
  return path.dirname(exePath)
}

/**
 * `cmd /c start` args that set Start-In via `/d` so OBS finds locale + plugins.
 * Order: title, /min, /d cwd, exe, obs args…
 */
export function buildObsCmdStartArgs(exePath: string, obsArgs: string[]): string[] {
  const cwd = obsExecutableWorkingDirectory(exePath)
  return ['/c', 'start', '""', '/min', '/d', cwd, exePath, ...obsArgs]
}
