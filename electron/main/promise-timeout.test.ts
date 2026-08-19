import { describe, expect, it, vi } from 'vitest'
import { withTimeout } from './promise-timeout'

describe('withTimeout', () => {
  it('resolves when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 200, 'timed out')).resolves.toBe(42)
  })

  it('rejects when the promise never settles', async () => {
    await expect(
      withTimeout(new Promise<number>(() => { /* hang */ }), 40, 'OBS start timed out'),
    ).rejects.toThrow('OBS start timed out')
  })

  it('runs timeout recovery so callers can abandon a stuck operation', async () => {
    const onTimeout = vi.fn()

    await expect(
      withTimeout(new Promise<number>(() => { /* hang */ }), 20, 'preview timed out', onTimeout),
    ).rejects.toThrow('preview timed out')

    expect(onTimeout).toHaveBeenCalledOnce()
  })

  it('does not run timeout recovery when the operation succeeds', async () => {
    const onTimeout = vi.fn()

    await expect(withTimeout(Promise.resolve(42), 20, 'timed out', onTimeout)).resolves.toBe(42)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('rejects with the underlying error when it fails first', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('boom')), 200, 'timed out'),
    ).rejects.toThrow('boom')
  })
})
