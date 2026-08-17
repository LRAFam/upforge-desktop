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

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'upforge.gg',
  'www.upforge.gg',
  'discord.gg',
])

export function isTrustedExternalUrl(target: string): boolean {
  if (/[\u0000-\u001f\u007f]/.test(target)) return false
  try {
    const candidate = new URL(target)
    return candidate.protocol === 'https:'
      && candidate.username === ''
      && candidate.password === ''
      && ALLOWED_EXTERNAL_HOSTS.has(candidate.hostname.toLowerCase())
  } catch {
    return false
  }
}
