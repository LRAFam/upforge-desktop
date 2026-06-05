import { app } from 'electron'
import { join } from 'path'

/** Resolve bundled spatial assets (dev + packaged). */
export function spatialResourcePath(...parts: string[]): string {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'spatial')
    : join(app.getAppPath(), 'resources', 'spatial')
  return join(base, ...parts)
}
