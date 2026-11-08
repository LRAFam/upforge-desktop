/**
 * dev-access.ts
 * Main-process gate for developer/debug IPC channels. The renderer hides the
 * Dev view, but the handlers themselves must refuse in packaged builds unless
 * dev mode is on or the signed-in user is an admin.
 */

export const DEV_ACCESS_DENIED = 'Developer access required'

export interface DevAccessContext {
  isDev: boolean
  devModeEnabled?: boolean
  isAdmin?: boolean
}

export function canUseDeveloperTools(ctx: DevAccessContext): boolean {
  return Boolean(ctx.isDev || ctx.devModeEnabled || ctx.isAdmin)
}

/** Wrap an ipcMain.handle callback so it rejects unless `allowed()` passes at call time. */
export function devOnly<A extends unknown[], R>(
  allowed: () => boolean,
  channel: string,
  handler: (...args: A) => R | Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    if (!allowed()) throw new Error(`${DEV_ACCESS_DENIED} (${channel})`)
    return handler(...args)
  }
}
