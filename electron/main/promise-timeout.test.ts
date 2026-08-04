import { describe, expect, it } from 'vitest'
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

  it('rejects with the underlying error when it fails first', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('boom')), 200, 'timed out'),
    ).rejects.toThrow('boom')
  })
})
