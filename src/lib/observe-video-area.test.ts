import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeVideoArea } from './observe-video-area'

afterEach(() => vi.unstubAllGlobals())

function setup() {
  let notify!: () => void
  const frames = new Map<number, FrameRequestCallback>()
  let nextId = 0
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { notify = callback }
    observe() {}
    disconnect = disconnect
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextId, callback)
    return nextId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  const update = vi.fn()
  const stop = observeVideoArea({} as HTMLElement, update)
  const flush = () => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach(callback => callback(0))
  }
  return { notify: () => notify(), update, stop, flush, frames, disconnect }
}

describe('VOD review resizing', () => {
  it('never changes layout during resize notification delivery and coalesces a burst', () => {
    const state = setup()
    state.notify()
    state.notify()
    expect(state.update).not.toHaveBeenCalled()
    expect(state.frames.size).toBe(1)
    state.flush()
    expect(state.update).toHaveBeenCalledTimes(1)
    state.notify()
    state.flush()
    expect(state.update).toHaveBeenCalledTimes(2)
  })

  it('cancels pending layout changes when leaving the review', () => {
    const state = setup()
    state.notify()
    state.stop()
    state.notify()
    state.flush()
    expect(state.update).not.toHaveBeenCalled()
    expect(state.disconnect).toHaveBeenCalledOnce()
  })
})
