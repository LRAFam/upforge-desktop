/**
 * Error-reporting key for the main process.
 *
 * The key is inlined at BUILD time via `define` in electron.vite.config.ts
 * (CI sets VITE_ERROR_REPORTING_KEY on the build step). The packaged app has
 * no such env var at runtime, so reading process.env alone sent every
 * main-process crash report without X-Error-Key → API 401.
 *
 * Runtime env stays as a fallback for `npm run dev` and tests.
 */
declare const __UPFORGE_ERROR_REPORTING_KEY__: string | undefined

const INLINED_KEY: string =
  typeof __UPFORGE_ERROR_REPORTING_KEY__ !== 'undefined' ? __UPFORGE_ERROR_REPORTING_KEY__ : ''

export function resolveErrorReportingKey(
  inlined: string = INLINED_KEY,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return inlined || env['VITE_ERROR_REPORTING_KEY'] || ''
}

export const ERROR_REPORTING_KEY = resolveErrorReportingKey()
