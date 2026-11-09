import { describe, expect, it, vi } from 'vitest'
import { PollPauseController } from './poll-pause'

describe('PollPauseController', () => {
  it('runs polls normally when no match is active', () => {
    const c = new PollPauseController(() => false)
    const tick = vi.fn()
    c.guard('coach', tick)()
    expect(tick).toHaveBeenCalledTimes(1)
  })

  it('skips polls while a match / recording is active', () => {
    let active = true
    const c = new PollPauseController(() => active)
    const tick = vi.fn()
    const guarded = c.guard('coach', tick)
    guarded()
    guarded()
    expect(tick).not.toHaveBeenCalled()
    active = false
    guarded()
    expect(tick).toHaveBeenCalledTimes(1)
  })

  it('runs each skipped poll exactly once on resume', () => {
    let active = true
    const c = new PollPauseController(() => active)
    const a = vi.fn()
    const b = vi.fn()
    const ga = c.guard('a', a)
    const gb = c.guard('b', b)
    ga(); ga(); gb()
    active = false
    expect(c.resume()).toBe(2)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    expect(c.resume()).toBe(0)
    expect(a).toHaveBeenCalledTimes(1)
  })

  it('does not catch up while still paused (recording outlives the match)', () => {
    let active = true
    const c = new PollPauseController(() => active)
    const a = vi.fn()
    c.guard('a', a)()
    expect(c.resume()).toBe(0)
    expect(a).not.toHaveBeenCalled()
    active = false
    expect(c.resume()).toBe(1)
  })

  it('catchUp: false skips without queuing a resume run', () => {
    let active = true
    const c = new PollPauseController(() => active)
    const a = vi.fn()
    c.guard('a', a, { catchUp: false })()
    active = false
    expect(c.resume()).toBe(0)
    expect(a).not.toHaveBeenCalled()
  })

  it('configure swaps the predicate; a throwing predicate never blocks polls', () => {
    const c = new PollPauseController()
    const a = vi.fn()
    const g = c.guard('a', a)
    c.configure(() => true)
    g()
    expect(a).not.toHaveBeenCalled()
    c.configure(() => { throw new Error('boom') })
    g()
    expect(a).toHaveBeenCalledTimes(1)
  })

  it('a failing poll on resume does not stop the others', () => {
    let active = true
    const c = new PollPauseController(() => active)
    const b = vi.fn()
    c.guard('a', () => { throw new Error('x') })()
    c.guard('b', b)()
    active = false
    expect(c.resume()).toBe(2)
    expect(b).toHaveBeenCalledTimes(1)
  })
})

describe('inMatchPollGuard (renderer)', () => {
  it('skips while recording and never catches up', async () => {
    const { inMatchPollGuard, rendererPollPause, setRendererRecording } = await import('./in-match-poll-pause')
    const tick = vi.fn()
    const g = inMatchPollGuard('deadlock-stats', tick)
    setRendererRecording(true)
    g()
    expect(tick).not.toHaveBeenCalled()
    setRendererRecording(false)
    expect(rendererPollPause.resume()).toBe(0)
    g()
    expect(tick).toHaveBeenCalledTimes(1)
  })
})
