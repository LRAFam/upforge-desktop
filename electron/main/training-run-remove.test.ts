import { describe, expect, it, vi } from 'vitest'
import { removeTrainingRun, REMOVE_RUN_FAILED } from './training-run-remove'

describe('removeTrainingRun (trainer:remove-run)', () => {
  it('DELETEs /api/training/sessions/{id}', async () => {
    const del = vi.fn().mockResolvedValue({ data: { ok: true } })
    await expect(removeTrainingRun({ delete: del } as any, 'tok', 42)).resolves.toEqual({ ok: true })
    expect(del).toHaveBeenCalledWith('/api/training/sessions/42')
  })

  it('treats 404 as already removed', async () => {
    const del = vi.fn().mockRejectedValue(Object.assign(new Error('Not found'), { response: { status: 404 } }))
    expect(await removeTrainingRun({ delete: del } as any, 'tok', 7)).toEqual({ ok: true })
  })

  it('returns a calm error (does not throw) when the API refuses or the network fails', async () => {
    const http = vi.fn().mockRejectedValue(Object.assign(new Error('Request failed'), { response: { status: 500 } }))
    expect(await removeTrainingRun({ delete: http } as any, 'tok', 7)).toEqual({ ok: false, error: REMOVE_RUN_FAILED })
    const net = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    expect(await removeTrainingRun({ delete: net } as any, 'tok', 7)).toEqual({ ok: false, error: REMOVE_RUN_FAILED })
  })

  it('does not call the API without a token or a valid id', async () => {
    const del = vi.fn()
    expect((await removeTrainingRun({ delete: del } as any, null, 1)).ok).toBe(false)
    expect((await removeTrainingRun({ delete: del } as any, 'tok', '1/../x')).ok).toBe(false)
    expect((await removeTrainingRun({ delete: del } as any, 'tok', 0)).ok).toBe(false)
    expect((await removeTrainingRun({ delete: del } as any, 'tok', 1.5)).ok).toBe(false)
    expect(del).not.toHaveBeenCalled()
  })
})
