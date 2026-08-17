export type DesktopOnboardingCampaignStatus = 'eligible' | 'started' | 'completed'

export interface DesktopOnboardingCampaignState {
  enabled: boolean
  campaign: string
  status: DesktopOnboardingCampaignStatus
  requires_onboarding: boolean
  bonus: {
    eligible: boolean
    claimed: boolean
    job_id: string | null
  }
}

export type DesktopOnboardingCampaignResult =
  | ({ ok: true } & DesktopOnboardingCampaignState)
  | { ok: false; error: string }

export function parseDesktopOnboardingCampaignState(
  value: unknown,
): DesktopOnboardingCampaignState | null {
  if (!value || typeof value !== 'object') return null
  const state = value as Record<string, unknown>
  const bonus = state.bonus
  if (!bonus || typeof bonus !== 'object') return null
  const bonusState = bonus as Record<string, unknown>

  if (
    typeof state.enabled !== 'boolean'
    || typeof state.campaign !== 'string'
    || !['eligible', 'started', 'completed'].includes(String(state.status))
    || typeof state.requires_onboarding !== 'boolean'
    || typeof bonusState.eligible !== 'boolean'
    || typeof bonusState.claimed !== 'boolean'
    || !(bonusState.job_id === null || typeof bonusState.job_id === 'string')
  ) {
    return null
  }

  return state as unknown as DesktopOnboardingCampaignState
}
