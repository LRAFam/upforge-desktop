import { pathToFileURL } from 'url'
import { join } from 'path'

export function rendererEntryUrl(): string {
  return process.env['ELECTRON_RENDERER_URL']
    ?? pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
}

export function isTrustedRendererUrl(target: string, entry = rendererEntryUrl()): boolean {
  try {
    const candidate = new URL(target)
    const trusted = new URL(entry)
    return candidate.protocol === trusted.protocol
      && candidate.host === trusted.host
      && candidate.pathname === trusted.pathname
  } catch {
    return false
  }
}
