import { describe, expect, it } from 'vitest'
import { settingsStatusLine } from './settings-v3-status'

describe('settingsStatusLine', () => {
  it('says the recorder is ready only when the capture backend is connected', () => {
    expect(settingsStatusLine({ recordingReady: true, planLabel: 'Plus' })[0]).toEqual({ label: 'Recorder', value: 'Ready', tone: 'ok' })
    expect(settingsStatusLine({ recordingReady: false, planLabel: 'Plus' })[0]).toEqual({ label: 'Recorder', value: 'Not connected', tone: 'warn' })
  })
  it('falls back to Free when no plan label is known', () => {
    expect(settingsStatusLine({ recordingReady: true, planLabel: '' })[1].value).toBe('Free')
  })
})
