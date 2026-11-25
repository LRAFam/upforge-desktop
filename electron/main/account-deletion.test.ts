import { readMainRuntimeSource } from './__tests__/main-runtime-source'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { AxiosInstance } from 'axios'
import {
  accountError,
  cancelAccountDeletion,
  isSafeDownloadUrl,
  readAccountDeletion,
  readAccountExport,
  requestAccountDeletion,
  requestAccountExport,
} from './account-deletion'

function api(overrides: Partial<Record<'get' | 'post' | 'delete', unknown>>): AxiosInstance {
  return { get: vi.fn(), post: vi.fn(), delete: vi.fn(), ...overrides } as unknown as AxiosInstance
}
const httpError = (error: string) => Object.assign(new Error('422'), { response: { data: { error } } })

describe('account deletion (desktop → API)', () => {
  it('reads the pending request and summary, and survives a network error', async () => {
    const ok = api({ get: vi.fn().mockResolvedValue({ data: { pending: { status: 'pending', scheduled_for: '2026-11-23T10:00:00Z', can_cancel: true }, summary: { grace_days: 7 } } }) })
    await expect(readAccountDeletion(ok)).resolves.toMatchObject({ pending: { can_cancel: true }, summary: { grace_days: 7 } })
    expect(ok.get).toHaveBeenCalledWith('/api/account/deletion')

    const down = api({ get: vi.fn().mockRejectedValue(new Error('offline')) })
    await expect(readAccountDeletion(down)).resolves.toEqual({ pending: null, summary: null })
  })

  it('sends the password and typed email, and shows the server reason on failure', async () => {
    const ok = api({ post: vi.fn().mockResolvedValue({ data: { pending: { status: 'pending', scheduled_for: null, can_cancel: true } } }) })
    await expect(requestAccountDeletion(ok, 'pw', ' me@example.com ')).resolves.toMatchObject({ ok: true, pending: { status: 'pending' } })
    expect(ok.post).toHaveBeenCalledWith('/api/account/deletion', { password: 'pw', confirm_email: 'me@example.com' })

    const bad = api({ post: vi.fn().mockRejectedValue(httpError('That password is not right.')) })
    await expect(requestAccountDeletion(bad, 'x', 'me@example.com')).resolves.toEqual({ ok: false, error: 'That password is not right.' })
  })

  it('never calls the API without a password and email', async () => {
    const client = api({})
    await expect(requestAccountDeletion(client, '', 'me@example.com')).resolves.toMatchObject({ ok: false })
    await expect(requestAccountDeletion(client, 'pw', 42)).resolves.toMatchObject({ ok: false })
    expect(client.post).not.toHaveBeenCalled()
  })

  it('cancels with DELETE', async () => {
    const ok = api({ delete: vi.fn().mockResolvedValue({ data: { success: true } }) })
    await expect(cancelAccountDeletion(ok)).resolves.toEqual({ ok: true })
    expect(ok.delete).toHaveBeenCalledWith('/api/account/deletion')
  })

  it('requests and reads the data export', async () => {
    const exp = { status: 'pending', expires_at: null, download_url: null }
    const ok = api({ post: vi.fn().mockResolvedValue({ data: { export: exp } }), get: vi.fn().mockResolvedValue({ data: { export: exp } }) })
    await expect(requestAccountExport(ok)).resolves.toEqual({ ok: true, export: exp })
    await expect(readAccountExport(ok)).resolves.toEqual(exp)

    const limited = api({ post: vi.fn().mockRejectedValue(httpError('You can request one data download every 24 hours.')) })
    await expect(requestAccountExport(limited)).resolves.toEqual({ ok: false, error: 'You can request one data download every 24 hours.' })
  })

  it('only opens https download links', () => {
    expect(isSafeDownloadUrl('https://bucket.s3.amazonaws.com/x.zip?X-Amz-Signature=1')).toBe(true)
    expect(isSafeDownloadUrl('http://example.com/x.zip')).toBe(false)
    expect(isSafeDownloadUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeDownloadUrl(null)).toBe(false)
    expect(accountError(new Error('x'), 'fallback')).toBe('fallback')
  })

  it('Settings → Account shows the section, and the download link is re-read in the main process', () => {
    const pane = readFileSync(new URL('../../src/components/settings/SettingsAccountPane.vue', import.meta.url), 'utf8')
    const main = readMainRuntimeSource('main-startup.ts')
    expect(pane).toContain('<SettingsDeleteAccount v-if="user" :email="user.email" />')
    expect(main).toMatch(/'account:export-open', async \(\) => \{[\s\S]*readAccountExport\(mainProcess\.authManager\.getApi\(\)\)[\s\S]*isSafeDownloadUrl/)
  })
})
