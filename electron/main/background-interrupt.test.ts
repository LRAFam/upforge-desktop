import { describe, expect, it } from 'vitest'
import { wasBackgroundWorkInterrupted } from './background-interrupt'

describe('wasBackgroundWorkInterrupted', () => {
  it('detects match-priority abort codes and cancelled upload copy', () => {
    expect(wasBackgroundWorkInterrupted(new Error('upload_aborted_by_user: Upload cancelled'))).toBe(true)
    expect(wasBackgroundWorkInterrupted(new Error('Upload was cancelled. Your recording is still on the dashboard'))).toBe(true)
    expect(wasBackgroundWorkInterrupted(new Error('Upload aborted'))).toBe(true)
    expect(wasBackgroundWorkInterrupted(new Error('compression cancelled — match capture'))).toBe(true)
  })

  it('ignores unrelated upload failures', () => {
    expect(wasBackgroundWorkInterrupted(new Error('S3 upload failed (HTTP 500)'))).toBe(false)
    expect(wasBackgroundWorkInterrupted(new Error('Network timeout'))).toBe(false)
  })
})
