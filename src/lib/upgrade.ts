/** Upgrade buttons: direct Stripe checkout for a specific plan/pack, else the logged-in pricing page. */
export type UpgradeIntent =
  | { kind: 'plan'; tier: 'plus' | 'pro' }
  | { kind: 'pack' }
  | { kind: 'browse'; path?: string }

export function openUpgrade(source: string, intent: UpgradeIntent = { kind: 'browse' }): void {
  const fallback = intent.kind === 'browse' && intent.path ? intent.path : '/pricing'
  void window.api.app.startCheckout(intent, source).catch(() => {
    window.open(`https://upforge.gg${fallback}`, '_blank')
  })
}
