import { expect, it } from 'vitest'
import { reactive } from 'vue'
import { coachAccessState, coachQuestionPayload, validCoachHistory } from './workspace-coach'

it('sends cloneable IPC values and preserves the original retry identity and anchors', () => {
  const pending = reactive({ id: 'same-request', message: 'Compare these deaths', moments: [
    { analysis_id: 639, position: 73.1, round: 0 },
    { analysis_id: 639, position: 1362.3, round: 11 },
  ] })
  expect(() => structuredClone(pending)).toThrow()
  const payload = coachQuestionPayload(pending)
  expect(structuredClone(payload)).toEqual(payload)
  expect(coachQuestionPayload(pending)).toEqual(payload)
  pending.moments[0].position = 200
  expect(payload.moments[0].position).toBe(73.1)
})
it('accepts explicit missing round and rejects malformed usage or evidence', () => {
  const state = { locked: false, usage: { analysis_remaining: 2, daily_remaining: 5, chat_credits: 0, unlimited: false }, items: [{ id:'request', status:'complete', question:'Compare?', answer:'Saved answer', created_at:'now', moments:[{analysis_id:639,position:371.25,round:null}] }] }
  expect(validCoachHistory(state)).toBe(true)
  expect(validCoachHistory({ ...state, usage: {...state.usage,chat_credits:-1} })).toBe(false)
  expect(validCoachHistory({ ...state, items:[{...state.items[0],moments:[{analysis_id:639,position:NaN,round:0}]}] })).toBe(false)
})

it('distinguishes plan access, included questions and purchased credits', () => {
  const history = { locked: false, usage: { analysis_remaining: 2, daily_remaining: 5, chat_credits: 0, unlimited: false }, items: [] }
  expect(coachAccessState(null)).toBe('unavailable')
  expect(coachAccessState({ ...history, locked: true })).toBe('locked')
  expect(coachAccessState(history)).toBe('included')
  for (const cap of ['analysis_remaining', 'daily_remaining']) {
    const exhausted = { ...history, usage: { ...history.usage, [cap]: 0 } }
    expect(coachAccessState(exhausted)).toBe('exhausted')
    expect(coachAccessState({ ...exhausted, usage: { ...exhausted.usage, chat_credits: 1 } })).toBe('credit')
    expect(coachAccessState({ ...exhausted, usage: { ...exhausted.usage, unlimited: true } })).toBe('included')
  }
  expect(coachAccessState({ ...history, locked: true, usage: { ...history.usage, chat_credits: 10 } })).toBe('locked')
})
