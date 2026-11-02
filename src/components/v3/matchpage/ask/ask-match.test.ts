import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoachHistory } from '../../../../lib/workspace-coach'
import { answerBlocks, askAnalysisId, askButtonLabel, exhaustedMessage, matchMoment, momentLabel, usageLine, useAskMatch, LOCKED_MESSAGE, type AskMatchApi, type AskMatchContext } from './ask-match'

const usage = (o: Partial<CoachHistory['usage']> = {}) => ({ analysis_remaining: 15, daily_remaining: 30, chat_credits: 0, unlimited: false, ...o })
const history = (o: Partial<CoachHistory> = {}): CoachHistory => ({ items: [], locked: false, usage: usage(), ...o })

function mockApi(h: CoachHistory | (() => CoachHistory) = history()) {
  const get = () => (typeof h === 'function' ? h() : h)
  return {
    history: vi.fn<AskMatchApi['history']>(async () => ({ ok: true, data: get() })),
    ask: vi.fn<AskMatchApi['ask']>(async () => ({ ok: true, data: { id: 'q1', status: 'queued', moments: [], question: 'x', answer: null, created_at: '' } })),
    credits: vi.fn<AskMatchApi['credits']>(async () => ({ ok: true, data: { checkout_url: 'https://checkout.stripe.com/pay/abc' } })),
    openUrl: vi.fn<AskMatchApi['openUrl']>(async () => undefined),
    newId: vi.fn(() => '11111111-1111-4111-8111-111111111111'),
  }
}
const ctx = (o: Partial<AskMatchContext> = {}): (() => AskMatchContext) => () => ({ analysisId: 42, position: 754.6, round: 4, ...o })

describe('ask-match helpers', () => {
  it('accepts only positive integer analysis ids', () => {
    expect(askAnalysisId(42)).toBe(42)
    for (const bad of [0, -1, 1.5, '42', null, undefined, Number.NaN]) expect(askAnalysisId(bad)).toBeNull()
  })

  it('builds one moment for this match within the API limits', () => {
    expect(matchMoment(ctx()())).toEqual({ analysis_id: 42, position: 754.6, round: 4 })
    expect(matchMoment(ctx({ position: Number.NaN, round: 120 })())).toEqual({ analysis_id: 42, position: 0, round: null })
    expect(matchMoment(ctx({ analysisId: null })())).toBeNull()
  })

  it('labels the moment with a 1-based round', () => {
    expect(momentLabel({ position: 754.6, round: 4 })).toBe('Round 5 · 12:34')
    expect(momentLabel({ position: 65, round: null })).toBe('1:05')
  })

  it('shows the real allowance with correct plurals', () => {
    expect(usageLine(history({ usage: usage({ analysis_remaining: 1, daily_remaining: 9, chat_credits: 1 }) }))).toBe('1 included question left · 1 Coach Credit')
    expect(usageLine(history({ usage: usage({ analysis_remaining: 15, daily_remaining: 3, chat_credits: 20 }) }))).toBe('3 included questions left · 20 Coach Credits')
    expect(usageLine(history({ usage: usage({ unlimited: true }) }))).toBe('Admin access')
    expect(usageLine(history({ locked: true }))).toBe('')
    expect(usageLine(null)).toBe('')
  })

  it('explains which limit ran out', () => {
    expect(exhaustedMessage(history({ usage: usage({ analysis_remaining: 0 }) }))).toMatch(/^You have used the included questions for this match\./)
    expect(exhaustedMessage(history({ usage: usage({ daily_remaining: 0 }) }))).toMatch(/^You have used today’s included questions\./)
  })

  it('labels the primary button by state', () => {
    const base = { sending: false, working: false, pending: false, access: 'included' as const }
    expect(askButtonLabel(base)).toBe('Ask')
    expect(askButtonLabel({ ...base, access: 'credit' })).toBe('Ask using 1 credit')
    expect(askButtonLabel({ ...base, access: 'exhausted' })).toBe('No questions available')
    expect(askButtonLabel({ ...base, pending: true })).toBe('Retry this question')
    expect(askButtonLabel({ ...base, working: true })).toBe('Coach is working…')
  })

  it('turns light markdown answers into plain text blocks (no HTML)', () => {
    const blocks = answerBlocks('# What You Can Learn\n\n**Round 1** shares one pattern.\n---\n- Timing <b>x</b>\n2. **Check** trades')
    expect(blocks).toEqual([
      { kind: 'heading', parts: [{ text: 'What You Can Learn', bold: false }] },
      { kind: 'para', parts: [{ text: 'Round 1', bold: true }, { text: ' shares one pattern.', bold: false }] },
      { kind: 'item', parts: [{ text: 'Timing <b>x</b>', bold: false }] },
      { kind: 'item', parts: [{ text: '2. ', bold: false }, { text: 'Check', bold: true }, { text: ' trades', bold: false }] },
    ])
    expect(answerBlocks(null)).toEqual([])
  })

  it('keeps the plan lock message from the comparison coach', () => {
    expect(LOCKED_MESSAGE).toContain('Plus and Pro')
  })
})

describe('useAskMatch (mocked IPC — never a real paid call)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('loads history for the analysis and does not ask on load', async () => {
    const api = mockApi()
    const c = useAskMatch(api, ctx())
    await c.refresh()
    expect(api.history).toHaveBeenCalledWith(42)
    expect(api.ask).not.toHaveBeenCalled()
    expect(c.loaded.value).toBe(true)
    expect(c.access.value).toBe('included')
    expect(c.canAsk.value).toBe(false) // empty question
  })

  it('sends one moment through workspace-coach:ask with the snapshot at ask time', async () => {
    let items: CoachHistory['items'] = []
    const api = mockApi(() => history({ items }))
    const position = { now: 754.6 }
    const c = useAskMatch(api, () => ({ analysisId: 42, position: position.now, round: 4 }))
    await c.refresh()
    c.question.value = '  Why did I lose round 5?  '
    api.ask.mockImplementation(async () => {
      items = [{ id: '11111111-1111-4111-8111-111111111111', status: 'complete', moments: [{ analysis_id: 42, position: 754.6, round: 4 }], question: 'Why did I lose round 5?', answer: 'A', created_at: '' }]
      return { ok: true as const, data: { ...items[0]!, status: 'queued' as const } }
    })
    await c.ask()
    expect(api.ask).toHaveBeenCalledTimes(1)
    expect(api.ask).toHaveBeenCalledWith(42, { id: '11111111-1111-4111-8111-111111111111', message: 'Why did I lose round 5?', moments: [{ analysis_id: 42, position: 754.6, round: 4 }] })
    expect(c.pending.value).toBeNull()
    expect(c.question.value).toBe('')
  })

  it('retries with the same id and moment (no double charge) after a failed send', async () => {
    const api = mockApi()
    const position = { now: 100 }
    const c = useAskMatch(api, () => ({ analysisId: 42, position: position.now, round: null }))
    await c.refresh()
    c.question.value = 'What went wrong?'
    api.ask.mockRejectedValueOnce(new Error('network'))
    await c.ask()
    expect(c.error.value).toMatch(/without charging twice/)
    position.now = 500
    await c.ask()
    expect(api.ask).toHaveBeenCalledTimes(2)
    expect(api.ask.mock.calls[1]).toEqual(api.ask.mock.calls[0])
    expect(c.buttonLabel.value).toBe('Retry this question')
  })

  it('never asks when the plan is locked or the allowance is gone', async () => {
    for (const h of [history({ locked: true }), history({ usage: usage({ analysis_remaining: 0 }) })]) {
      const api = mockApi(h)
      const c = useAskMatch(api, ctx())
      await c.refresh()
      c.question.value = 'Anything?'
      expect(c.canAsk.value).toBe(false)
      await c.ask()
      expect(api.ask).not.toHaveBeenCalled()
    }
  })

  it('allows a credit-backed question once included questions run out', async () => {
    const c = useAskMatch(mockApi(history({ usage: usage({ daily_remaining: 0, chat_credits: 3 }) })), ctx())
    await c.refresh()
    c.question.value = 'Q'
    expect(c.access.value).toBe('credit')
    expect(c.buttonLabel.value).toBe('Ask using 1 credit')
    expect(c.canAsk.value).toBe(true)
  })

  it('shows the API error message (plan limit / rate limit) as-is', async () => {
    const api = mockApi()
    api.ask.mockResolvedValueOnce({ ok: false as const, error: 'Ask AI coach is available on Plus and Pro.' } as never)
    const c = useAskMatch(api, ctx())
    await c.refresh()
    c.question.value = 'Q'
    await c.ask()
    expect(c.error.value).toBe('Ask AI coach is available on Plus and Pro.')
  })

  it('polls while an answer is being prepared, then stops', async () => {
    let status: 'running' | 'complete' = 'running'
    const api = mockApi(() => history({ items: [{ id: 'a', status, moments: [{ analysis_id: 42, position: 1, round: null }], question: 'Q', answer: status === 'complete' ? 'A' : null, created_at: '' }] }))
    const c = useAskMatch(api, ctx(), { pollMs: 3000 })
    await c.refresh()
    expect(c.working.value).toBe(true)
    status = 'complete'
    await vi.advanceTimersByTimeAsync(3000)
    expect(api.history).toHaveBeenCalledTimes(2)
    expect(c.working.value).toBe(false)
    await vi.advanceTimersByTimeAsync(9000)
    expect(api.history).toHaveBeenCalledTimes(2)
  })

  it('only opens Stripe checkout URLs for credit packs', async () => {
    const api = mockApi()
    const c = useAskMatch(api, ctx())
    await c.buyCredits('starter')
    expect(api.credits).toHaveBeenCalledWith('starter')
    expect(api.openUrl).toHaveBeenCalledWith('https://checkout.stripe.com/pay/abc')
    api.credits.mockResolvedValueOnce({ ok: true as const, data: { checkout_url: 'https://evil.example/pay' } })
    await c.buyCredits('value')
    expect(api.openUrl).toHaveBeenCalledTimes(1)
    expect(c.error.value).toMatch(/Could not open checkout/)
  })

  it('rejects malformed history and ignores replies after clear()', async () => {
    const api = mockApi()
    api.history.mockResolvedValueOnce({ ok: true as const, data: { nope: true } as never })
    const c = useAskMatch(api, ctx())
    await c.refresh()
    expect(c.error.value).toBe('The coach returned an unsupported conversation.')
    const slow = c.refresh()
    c.clear()
    await slow
    expect(c.history.value).toBeNull()
  })
})
