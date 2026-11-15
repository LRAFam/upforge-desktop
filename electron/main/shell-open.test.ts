import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ openExternal: vi.fn(), showMessageBox: vi.fn(), warn: vi.fn() }))
vi.mock('electron', () => ({ shell: { openExternal: mocks.openExternal }, dialog: { showMessageBox: mocks.showMessageBox } }))
vi.mock('electron-log', () => ({ default: { warn: mocks.warn } }))
import { openExternalSafe } from './shell-open'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.openExternal.mockResolvedValue(undefined)
  mocks.showMessageBox.mockResolvedValue({ response: 0 })
})

it('opens a valid browser link without showing recovery', async () => {
  await expect(openExternalSafe('https://upforge.gg/dashboard')).resolves.toEqual({ ok: true })
  expect(mocks.openExternal).toHaveBeenCalledWith('https://upforge.gg/dashboard')
  expect(mocks.showMessageBox).not.toHaveBeenCalled()
})

it('turns missing application rejection into actionable recovery without logging the target URL', async () => {
  mocks.openExternal.mockRejectedValue(new Error('Failed to open: Application not found. (0x800401F5)'))
  await expect(openExternalSafe('https://upforge.gg/results?token=secret')).resolves.toEqual({ ok: false, error: expect.stringContaining('default browser') })
  expect(mocks.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.stringContaining('default browser') }))
  expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('token=secret')
})

it('also contains synchronous launcher failures and a failed recovery dialog', async () => {
  mocks.openExternal.mockImplementation(() => { throw new Error('Application not found') })
  mocks.showMessageBox.mockRejectedValue(new Error('window closed'))
  await expect(openExternalSafe('https://upforge.gg/dashboard')).resolves.toEqual({ ok: false, error: expect.any(String) })
})
