import { describe, expect, it, vi } from 'vitest'
import type { AxiosInstance } from 'axios'
import { parseAiTrainingOptOut, readAiTraining, saveAiTraining } from './ai-training'

function api(overrides: Partial<Record<'get' | 'put', unknown>>): AxiosInstance {
  return { get: vi.fn(), put: vi.fn(), ...overrides } as unknown as AxiosInstance
}

describe('AI-training setting (server value)', () => {
  it('reads the server opt-out from the profile', () => {
    expect(parseAiTrainingOptOut({ profile: { user: { ai_training_opt_out: false } } })).toBe(false)
    expect(parseAiTrainingOptOut({ profile: { user: { ai_training_opt_out: true } } })).toBe(true)
  })

  it('returns null when the server has no value instead of guessing', () => {
    expect(parseAiTrainingOptOut({ profile: { user: {} } })).toBeNull()
    expect(parseAiTrainingOptOut(null)).toBeNull()
    expect(parseAiTrainingOptOut({ profile: { user: { ai_training_opt_out: 'no' } } })).toBeNull()
  })

  it('reads via GET /api/profile and survives a network error', async () => {
    const ok = api({ get: vi.fn().mockResolvedValue({ data: { profile: { user: { ai_training_opt_out: true } } } }) })
    await expect(readAiTraining(ok)).resolves.toEqual({ optOut: true })
    expect(ok.get).toHaveBeenCalledWith('/api/profile')

    const down = api({ get: vi.fn().mockRejectedValue(new Error('offline')) })
    await expect(readAiTraining(down)).resolves.toEqual({ optOut: null })
  })

  it('saves via PUT /api/profile/update and trusts the server echo', async () => {
    const put = vi.fn().mockResolvedValue({ data: { success: true, ai_training_opt_out: true } })
    await expect(saveAiTraining(api({ put }), true)).resolves.toEqual({ optOut: true })
    expect(put).toHaveBeenCalledWith('/api/profile/update', { ai_training_opt_out: true })
  })

  it('propagates a failed save so the toggle can revert', async () => {
    const put = vi.fn().mockRejectedValue(new Error('500'))
    await expect(saveAiTraining(api({ put }), false)).rejects.toThrow('500')
  })
})
