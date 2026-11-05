import { describe, expect, it, vi } from 'vitest'
import { dismissCoachingDrill } from './coaching-drill-dismiss'

describe('dismissCoachingDrill (trainer:dismiss-coaching-drill)', () => {
  it('POSTs /api/drills/{id}/dismiss', async () => {
    const post = vi.fn().mockResolvedValue({ data: { ok: true } })
    await expect(dismissCoachingDrill({ post } as any, 'tok', 42)).resolves.toEqual({ ok: true })
    expect(post).toHaveBeenCalledWith('/api/drills/42/dismiss')
  })

  it('returns an error (does not throw) when the API refuses or the network fails', async () => {
    const http = vi.fn().mockRejectedValue(Object.assign(new Error('Request failed'), { response: { status: 500 } }))
    const res = await dismissCoachingDrill({ post: http } as any, 'tok', 7)
    expect(res.ok).toBe(false)
    expect(res).toMatchObject({ error: expect.stringContaining('HTTP 500') })
    const net = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    expect(await dismissCoachingDrill({ post: net } as any, 'tok', 7)).toMatchObject({ ok: false, error: expect.stringContaining('ECONNRESET') })
  })

  it('does not call the API without a token or a valid id', async () => {
    const post = vi.fn()
    expect((await dismissCoachingDrill({ post } as any, null, 1)).ok).toBe(false)
    expect((await dismissCoachingDrill({ post } as any, 'tok', '1/../x')).ok).toBe(false)
    expect((await dismissCoachingDrill({ post } as any, 'tok', 0)).ok).toBe(false)
    expect(post).not.toHaveBeenCalled()
  })
})
