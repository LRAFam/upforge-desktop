import { describe, expect, it, vi } from 'vitest'
import { isStripeCheckoutUrl, safeWebPath, startCheckout, type CheckoutDeps } from './billing-checkout'

function deps(post: CheckoutDeps['post']) {
  return {
    post,
    openExternal: vi.fn(),
    openWebPath: vi.fn(),
    trackUpgradeClicked: vi.fn(),
  }
}

describe('startCheckout', () => {
  it('opens Stripe checkout for a plan without a web login', async () => {
    const post = vi.fn().mockResolvedValue({ status: 200, data: { checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_1' } })
    const d = deps(post)
    const res = await startCheckout({ kind: 'plan', tier: 'plus' }, 'riot_link', d)
    expect(post).toHaveBeenCalledWith('/api/payment/subscription-checkout', { tier: 'plus' })
    expect(d.openExternal).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1')
    expect(d.openWebPath).not.toHaveBeenCalled()
    expect(d.trackUpgradeClicked).toHaveBeenCalledWith('riot_link')
    expect(res).toEqual({ ok: true, opened: 'stripe' })
  })

  it('buys the report pack through the bundle endpoint', async () => {
    const post = vi.fn().mockResolvedValue({ status: 200, data: { checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_2' } })
    const d = deps(post)
    await startCheckout({ kind: 'pack' }, 'dashboard', d)
    expect(post).toHaveBeenCalledWith('/api/payment/bundle-checkout', { bundle: '3-pack' })
    expect(d.openExternal).toHaveBeenCalledOnce()
  })

  it('sends subscribers to billing instead of a second subscription', async () => {
    const d = deps(vi.fn().mockResolvedValue({ status: 409, data: { success: false } }))
    const res = await startCheckout({ kind: 'plan', tier: 'pro' }, 'x', d)
    expect(d.openWebPath).toHaveBeenCalledWith('/profile-payments')
    expect(res.opened).toBe('billing')
  })

  it('falls back to the logged-in pricing page when checkout is unavailable or logged out', async () => {
    const unavailable = deps(vi.fn().mockResolvedValue({ status: 503, data: { error: 'not configured' } }))
    expect((await startCheckout({ kind: 'plan', tier: 'plus' }, 'x', unavailable)).opened).toBe('pricing')
    expect(unavailable.openWebPath).toHaveBeenCalledWith('/pricing')

    const failed = deps(vi.fn().mockRejectedValue(new Error('network')))
    expect((await startCheckout({ kind: 'pack' }, 'x', failed)).reason).toBe('checkout_request_failed')

    const loggedOut = deps(null)
    expect((await startCheckout({ kind: 'plan', tier: 'plus' }, 'x', loggedOut)).reason).toBe('logged_out')
    expect(loggedOut.openExternal).not.toHaveBeenCalled()
  })

  it('never opens a non-Stripe URL returned by the API', async () => {
    const d = deps(vi.fn().mockResolvedValue({ status: 200, data: { checkout_url: 'https://evil.example/pay' } }))
    const res = await startCheckout({ kind: 'plan', tier: 'plus' }, 'x', d)
    expect(d.openExternal).not.toHaveBeenCalled()
    expect(res.opened).toBe('pricing')
  })

  it('browse opens only relative upforge paths in the web shell', async () => {
    const d = deps(null)
    await startCheckout({ kind: 'browse', path: '/pricing#reports' }, 'x', d)
    expect(d.openWebPath).toHaveBeenCalledWith('/pricing#reports')
    expect(safeWebPath('https://evil.example')).toBe('/pricing')
    expect(safeWebPath('//evil.example')).toBe('/pricing')
    expect(isStripeCheckoutUrl('http://checkout.stripe.com/x')).toBe(false)
  })
})
