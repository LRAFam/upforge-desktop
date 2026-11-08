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

/**
 * Scheme guard for anything handed to shell.openExternal. Only https: (plus http:
 * for an explicitly allowed host, e.g. the local dev frontend) is ever opened —
 * file:, smb:, ms-msdt:, javascript:, custom protocol handlers etc. are refused.
 */
export function isSafeExternalUrl(target: string, httpAllowedHosts: readonly string[] = []): boolean {
  if (typeof target !== 'string' || /[\u0000-\u001f\u007f]/.test(target)) return false
  try {
    const candidate = new URL(target)
    if (candidate.username !== '' || candidate.password !== '') return false
    if (candidate.protocol === 'https:') return candidate.hostname !== ''
    if (candidate.protocol === 'http:') {
      return httpAllowedHosts.map(h => h.toLowerCase()).includes(candidate.hostname.toLowerCase())
    }
    return false
  } catch {
    return false
  }
}

export function isTrustedExternalUrl(target: string): boolean {
  if (!isSafeExternalUrl(target)) return false
  return ALLOWED_EXTERNAL_HOSTS.has(new URL(target).hostname.toLowerCase())
}
