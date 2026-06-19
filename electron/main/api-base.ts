/** Shared API base URL for main-process HTTP clients. */
export function getApiBaseUrl(): string {
  const fromEnv = process.env['VITE_API_URL']?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return 'https://api.upforge.gg'
}

/** Web app base URL for opening coach dashboard / results in the browser. */
export function getFrontendBaseUrl(): string {
  const fromEnv = process.env['VITE_FRONTEND_URL']?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return 'https://upforge.gg'
}
