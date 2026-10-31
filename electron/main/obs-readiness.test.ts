import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitForObsReady } from './obs-readiness'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
const notReady = new Error('OBS is not ready to perform the request.')

describe('OBS startup readiness', () => {
  it('waits through startup before allowing setup', async () => {
    const probe = vi.fn().mockRejectedValueOnce(notReady).mockRejectedValueOnce(notReady).mockResolvedValue({ obsVersion: '32.0.1' })
    const setup = vi.fn()
    const ready = waitForObsReady(probe).then(setup)
    await vi.advanceTimersByTimeAsync(500)
    expect(setup).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    await ready
    expect(setup).toHaveBeenCalledWith({ obsVersion: '32.0.1' })
  })
  it('stops retrying when OBS stays unready', async () => {
    const result = expect(waitForObsReady(vi.fn().mockRejectedValue(notReady))).rejects.toThrow('within 15 seconds')
    await vi.advanceTimersByTimeAsync(15_000)
    await result
  })
  it('does not retry authentication or disconnected errors', async () => {
    const probe = vi.fn().mockRejectedValue(new Error('Not connected'))
    await expect(waitForObsReady(probe)).rejects.toThrow('Not connected')
    expect(probe).toHaveBeenCalledTimes(1)
  })
  it('bounds a request that never returns', async () => {
    const result = expect(waitForObsReady(() => new Promise(() => {}))).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(5000)
    await result
  })
})
