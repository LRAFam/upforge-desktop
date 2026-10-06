import { describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ focused: true, idle: 0 }))
vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: () => ({ isFocused: () => state.focused, isMinimized: () => false }) },
  powerMonitor: { getSystemIdleTime: () => state.idle },
}))
vi.mock('electron-log', () => ({ default: { debug: vi.fn() } }))
vi.mock('../renderer-trust', () => ({ isTrustedRendererUrl: (url: string) => url === 'app://trusted' }))
import { setupProductUsageHandlers } from './product-usage-ipc'
import type { IpcMain } from 'electron'
import type { AuthManager } from '../auth-manager'
let nextId = 0
function fixture() {
  state.focused = true; state.idle = 0
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const post = vi.fn(async () => {})
  const auth = { getToken: () => 'token', getUser: () => ({ id: 42 }), getApi: () => ({ post }) }
  setupProductUsageHandlers({ handle: (name: string, fn: (...args: unknown[]) => unknown) => handlers.set(name, fn) } as unknown as IpcMain, auth as unknown as AuthManager)
  const frame = { url: 'app://trusted' }
  const event = { senderFrame: frame, sender: { id: ++nextId, mainFrame: frame, once: vi.fn() } }
  return { post, event, sample: (e = event, feature: string | null = 'report') => handlers.get('product-usage:sample')!(e, { feature, active: true, visit: true }) }
}
describe('desktop usage transport', () => {
  it('delivers only fixed categories under main-process authentication', async () => {
    const f = fixture(); f.sample(); await Promise.resolve()
    expect(f.post).toHaveBeenCalledWith('/api/product-usage', expect.objectContaining({ channel: 'desktop', events: expect.arrayContaining([expect.objectContaining({ event: 'page_view', feature: 'report', active_ms: 0 })]) }))
    expect(JSON.stringify(f.post.mock.calls)).not.toContain('app://trusted')
  })
  it('ignores native idle, unfocused windows and arbitrary feature paths', () => {
    const f = fixture()
    state.focused = false; f.sample()
    state.focused = true; state.idle = 60; f.sample()
    state.idle = 0; f.sample(f.event, '/private/path')
    expect(f.post).not.toHaveBeenCalled()
  })
  it('rejects subframes even if their URL looks trusted', () => {
    const f = fixture()
    f.sample({ ...f.event, senderFrame: { url: 'app://trusted' } })
    expect(f.post).not.toHaveBeenCalled()
  })
})
