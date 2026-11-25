import { describe, expect, it } from 'vitest'
import { publishError } from './clip-publish-error'

describe('publishError', () => {
  it('shows the API message for a refused publish, keeping the code', () => {
    const err = Object.assign(new Error('unverified_clip'), {
      status: 403, code: 'unverified_clip', data: { message: 'On the free plan you can publish clips the UpForge desktop app recorded.' },
    })
    expect(publishError(err)).toEqual({ ok: false, error: 'On the free plan you can publish clips the UpForge desktop app recorded.', code: 'unverified_clip' })
  })

  it('falls back to the error message when there is no API body', () => {
    expect(publishError(new Error('Request failed (500)'))).toEqual({ ok: false, error: 'Request failed (500)' })
    expect(publishError('offline')).toEqual({ ok: false, error: 'offline' })
  })
})
