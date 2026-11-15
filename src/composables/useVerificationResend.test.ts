import { describe, expect, it, vi } from 'vitest'
import { isEmailUnverified, useVerificationResend } from './useVerificationResend'

describe('isEmailUnverified', () => {
  it('only matches a failed login with the email_unverified code', () => {
    expect(isEmailUnverified({ ok: false, code: 'email_unverified' })).toBe(true)
    expect(isEmailUnverified({ ok: false, code: 'other' })).toBe(false)
    expect(isEmailUnverified({ ok: false })).toBe(false)
    expect(isEmailUnverified({ ok: true, code: 'email_unverified' })).toBe(false)
    expect(isEmailUnverified(null)).toBe(false)
  })
})

describe('useVerificationResend', () => {
  it('offers resend after an unverified login and clears it after any other result', () => {
    const r = useVerificationResend(() => vi.fn())
    r.noteLoginResult({ ok: false, code: 'email_unverified' })
    expect(r.needsVerification.value).toBe(true)
    r.noteLoginResult({ ok: false, code: 'invalid_credentials' })
    expect(r.needsVerification.value).toBe(false)
  })

  it('sends the typed email and shows the server message', async () => {
    const api = vi.fn().mockResolvedValue({ ok: true, message: 'Sent.' })
    const r = useVerificationResend(() => api)
    await r.resend('a@b.co')
    expect(api).toHaveBeenCalledWith('a@b.co')
    expect(r.resendNote.value).toBe('Sent.')
    expect(r.resendError.value).toBe('')
    expect(r.resending.value).toBe(false)
  })

  it('shows the error from a failed resend, or a fallback when the call throws', async () => {
    const r = useVerificationResend(() => vi.fn().mockResolvedValue({ ok: false, error: 'Too many requests.' }))
    await r.resend('a@b.co')
    expect(r.resendError.value).toBe('Too many requests.')

    const t = useVerificationResend(() => vi.fn().mockRejectedValue(new Error('ipc')))
    await t.resend('a@b.co')
    expect(t.resendError.value).toMatch(/Could not send/)
  })
})
