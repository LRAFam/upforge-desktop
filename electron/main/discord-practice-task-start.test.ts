import { describe, expect, it, vi } from 'vitest'
import type { AuthManager } from './auth-manager'
import { trackDiscordPracticeTaskStart } from './discord-practice-task-start'

const event = 'fb7bb712-f306-4205-9c09-7e85c5d049bd'
function fixture() {
  const post = vi.fn(async () => ({ status: 204 }))
  const auth = { getToken: () => 'token-seven', getUser: () => ({ id: 7 }), getApi: () => ({ post }) } as unknown as AuthManager
  return { auth, post }
}
describe('Discord practice-loop actual task-start observation', () => {
  it('posts only the actual assignment and stable launch UUID, under captured account auth', () => {
    const f = fixture()
    trackDiscordPracticeTaskStart(f.auth, 7, 123, event)
    expect(f.post).toHaveBeenCalledWith('/api/experiments/discord-practice-loop/task-start', {
      drill_id: 123, event_id: event,
    }, { headers: { Authorization: 'Bearer token-seven' } })
  })
  it.each([undefined, 0, -1, 2.5])('does not infer a task for free play/invalid assignment (%s)', drill => {
    const f = fixture()
    trackDiscordPracticeTaskStart(f.auth, 7, drill, event)
    expect(f.post).not.toHaveBeenCalled()
  })
  it('refuses launches owned by a previous account or no account', () => {
    const f = fixture()
    trackDiscordPracticeTaskStart(f.auth, 8, 123, event)
    trackDiscordPracticeTaskStart(f.auth, null, 123, event)
    expect(f.post).not.toHaveBeenCalled()
  })
  it('does not wait for or throw on unavailable telemetry', async () => {
    const f = fixture(); f.post.mockRejectedValue(new Error('offline'))
    expect(trackDiscordPracticeTaskStart(f.auth, 7, 123, event)).toBeUndefined()
    await Promise.resolve()
  })
  it('does not turn a synchronous transport failure into a failed trainer launch', () => {
    const f = fixture(); f.post.mockImplementation(() => { throw new Error('transport unavailable') })
    expect(() => trackDiscordPracticeTaskStart(f.auth, 7, 123, event)).not.toThrow()
  })
})
