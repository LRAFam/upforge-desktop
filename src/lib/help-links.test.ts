import { afterEach, describe, expect, it, vi } from 'vitest'
import { HELP_GLOSSARY_URL, HELP_TROUBLESHOOTING_URL, HELP_URL, openHelp } from './help-links'

describe('help links', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('points at the upforge.gg help page anchors', () => {
    expect(HELP_URL).toBe('https://upforge.gg/help')
    expect(HELP_TROUBLESHOOTING_URL).toBe('https://upforge.gg/help#troubleshooting')
    expect(HELP_GLOSSARY_URL).toBe('https://upforge.gg/help#glossary')
  })

  it('opens the page in the system browser through the safe-open IPC', async () => {
    const openUrl = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('window', { api: { app: { openUrl } } })
    await openHelp(HELP_TROUBLESHOOTING_URL)
    expect(openUrl).toHaveBeenCalledWith('https://upforge.gg/help#troubleshooting')
  })

  it('does not throw when the bridge is missing or fails', async () => {
    vi.stubGlobal('window', {})
    await expect(openHelp()).resolves.toBeUndefined()
    vi.stubGlobal('window', { api: { app: { openUrl: vi.fn().mockRejectedValue(new Error('no')) } } })
    await expect(openHelp()).resolves.toBeUndefined()
  })
})
