/** True when the Electron preload exposed `window.api`. */
export function hasDesktopApi(): boolean {
  return typeof window !== 'undefined' && window.api != null
}

export function getDesktopApi(): Window['api'] | undefined {
  return hasDesktopApi() ? window.api : undefined
}
