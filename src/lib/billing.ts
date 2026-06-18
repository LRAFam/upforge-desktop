/** Stripe statuses where the user should update their payment method. */
export function isPaymentPastDue(status: string | null | undefined): boolean {
  return status === 'past_due'
}

export async function openBillingPortal(): Promise<{ ok: boolean; error?: string }> {
  return window.api.billing.openPortal()
}
