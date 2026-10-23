/**
 * Upgrade buttons → payment without logging in again.
 *
 * - A specific plan or report pack: ask the API (already authenticated) for a Stripe
 *   Checkout session and open it in the user's browser.
 * - Anything else, or if checkout can't be created: open the pricing page in the in-app
 *   web shell, which carries the desktop login.
 */

export type CheckoutIntent =
  | { kind: 'plan'; tier: 'plus' | 'pro' }
  | { kind: 'pack' }
  | { kind: 'browse'; path?: string }

export interface CheckoutDeps {
  /** POST to the API with the user's token; null when logged out. */
  post: ((path: string, body: Record<string, unknown>) => Promise<{ status: number; data: unknown }>) | null
  openExternal: (url: string) => Promise<void> | void
  /** Open an upforge.gg path in the logged-in web shell. */
  openWebPath: (path: string) => Promise<void> | void
  trackUpgradeClicked: (source: string) => void
}

export interface CheckoutResult {
  ok: boolean
  opened: 'stripe' | 'pricing' | 'billing'
  reason?: string
}

const DEFAULT_PRICING_PATH = '/pricing'
const BILLING_PATH = '/profile-payments'

/** Only relative upforge paths are accepted for the web shell. */
export function safeWebPath(path: string | undefined): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return DEFAULT_PRICING_PATH
  return path
}

export function isStripeCheckoutUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (u.hostname === 'checkout.stripe.com' || u.hostname.endsWith('.stripe.com'))
  } catch {
    return false
  }
}

export async function startCheckout(
  intent: CheckoutIntent,
  source: string,
  deps: CheckoutDeps,
): Promise<CheckoutResult> {
  deps.trackUpgradeClicked(source)

  const pricing = async (path: string, reason?: string): Promise<CheckoutResult> => {
    await deps.openWebPath(safeWebPath(path))
    return { ok: true, opened: 'pricing', reason }
  }

  if (intent.kind === 'browse') return pricing(intent.path ?? DEFAULT_PRICING_PATH)
  if (!deps.post) return pricing(DEFAULT_PRICING_PATH, 'logged_out')

  const [endpoint, body] = intent.kind === 'plan'
    ? ['/payment/subscription-checkout', { tier: intent.tier }]
    : ['/payment/bundle-checkout', { bundle: '3-pack' }]

  let res: { status: number; data: unknown }
  try {
    res = await deps.post(endpoint, body)
  } catch {
    return pricing(DEFAULT_PRICING_PATH, 'checkout_request_failed')
  }

  if (res.status === 409) {
    // Already subscribed: send them to manage billing instead of a second subscription.
    await deps.openWebPath(BILLING_PATH)
    return { ok: true, opened: 'billing', reason: 'already_subscribed' }
  }

  const url = (res.data as { checkout_url?: unknown } | null)?.checkout_url
  if (res.status >= 200 && res.status < 300 && isStripeCheckoutUrl(url)) {
    await deps.openExternal(url)
    return { ok: true, opened: 'stripe' }
  }
  return pricing(DEFAULT_PRICING_PATH, `checkout_unavailable_${res.status}`)
}
