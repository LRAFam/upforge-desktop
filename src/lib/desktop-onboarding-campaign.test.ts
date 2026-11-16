import { describe, expect, it, vi } from 'vitest'
import { parseDesktopOnboardingCampaignState, syncPendingOnboardingCampaign } from './desktop-onboarding-campaign'

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

describe('syncPendingOnboardingCampaign', () => {
  const state = {
    ok: true as const,
    enabled: true,
    campaign: 'c',
    status: 'completed' as const,
    requires_onboarding: false,
    bonus: { eligible: false, claimed: false, job_id: null },
  }

  it('clears the pending flag once the API confirms', async () => {
    const saveSettings = vi.fn(async () => {})
    await expect(syncPendingOnboardingCampaign({ complete: async () => state, saveSettings })).resolves.toBe(true)
    expect(saveSettings).toHaveBeenCalledWith({ onboardingCampaignSyncPending: false })
  })

  it('keeps the flag (retry next launch) when the API errors or is unreachable', async () => {
    const saveSettings = vi.fn(async () => {})
    await expect(syncPendingOnboardingCampaign({
      complete: async () => ({ ok: false, error: 'Could not load onboarding campaign' }),
      saveSettings,
    })).resolves.toBe(false)
    await expect(syncPendingOnboardingCampaign({
      complete: async () => { throw new Error('IPC down') },
      saveSettings,
    })).resolves.toBe(false)
    expect(saveSettings).not.toHaveBeenCalled()
  })
})
