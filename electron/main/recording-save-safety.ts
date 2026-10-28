import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export const UNSAFE_RECORDING_DIRECTORY = 'Choose a recording folder outside the UpForge installation folder. App updates replace that folder and can delete your videos.'

export function isInsideDirectory(candidate: string, directory: string, paths = path): boolean {
  const relative = paths.relative(paths.resolve(directory), paths.resolve(candidate))
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative))
}

/** Resolve existing parents too, so a not-yet-created folder below a junction is checked. */
function physicalPath(directory: string): string {
  try {
    return fs.realpathSync(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const parent = path.dirname(directory)
    if (parent === directory) return directory
    return path.join(physicalPath(parent), path.basename(directory))
  }
}

export function recordingDirectoryProblem(directory: string): string | null {
  if (!app?.isPackaged || !directory.trim()) return null
  const installDirectory = path.dirname(app.getPath('exe'))
  const candidate = path.resolve(directory)
  if (isInsideDirectory(candidate, installDirectory)
    || isInsideDirectory(physicalPath(candidate), physicalPath(installDirectory))) {
    return UNSAFE_RECORDING_DIRECTORY
  }
  return null
}

/** New profile folders must exist before OBS and the free-space check use them. */
export function prepareRecordingDirectory(directory: string): void {
  try {
    const problem = recordingDirectoryProblem(directory)
    if (problem) throw new Error(problem)
    fs.mkdirSync(directory, { recursive: true })
  } catch (error) {
    throw new Error(`Could not prepare recording folder "${directory}". Check that the drive is connected and the folder is writable.`, { cause: error })
  }
}
