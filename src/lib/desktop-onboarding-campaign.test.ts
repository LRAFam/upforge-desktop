import { describe, expect, it } from 'vitest'
import { parseDesktopOnboardingCampaignState } from './desktop-onboarding-campaign'

describe('parseDesktopOnboardingCampaignState', () => {
  it('accepts the canonical campaign response', () => {
    expect(parseDesktopOnboardingCampaignState({
      enabled: true,
      campaign: 'desktop_relaunch_2026_08',
      status: 'eligible',
      requires_onboarding: true,
      bonus: {
        eligible: true,
        claimed: false,
        job_id: null,
      },
    })).toEqual({
      enabled: true,
      campaign: 'desktop_relaunch_2026_08',
      status: 'eligible',
      requires_onboarding: true,
      bonus: {
        eligible: true,
        claimed: false,
        job_id: null,
      },
    })
  })

  it('rejects missing or invented campaign fields', () => {
    expect(parseDesktopOnboardingCampaignState({
      campaign: 'desktop_relaunch_2026_08',
      status: 'eligible',
      bonus: { eligible: true, claimed: false, job_id: null },
    })).toBeNull()

    expect(parseDesktopOnboardingCampaignState({
      enabled: true,
      campaign: 'desktop_relaunch_2026_08',
      status: 'waiting',
      requires_onboarding: true,
      bonus: { eligible: true, claimed: false, job_id: null },
    })).toBeNull()
  })
})
