import { describe, expect, it } from 'vitest'
import { demoDownloadProgressLabel } from '../../src/lib/demo-download-progress'

describe('demoDownloadProgressLabel', () => {
  it('labels Steam GC lookup', () => {
    expect(demoDownloadProgressLabel({
      phase: 'gc_lookup',
      bytesDone: 0,
      bytesTotal: null,
      pct: null,
    })).toBe('Contacting Steam…')
  })

  it('labels percent and size when total known', () => {
    const label = demoDownloadProgressLabel({
      phase: 'downloading',
      bytesDone: 18 * 1024 * 1024,
      bytesTotal: 43 * 1024 * 1024,
      pct: 42,
    })
    expect(label).toContain('42%')
    expect(label).toContain('18.0 MB')
    expect(label).toContain('43.0 MB')
  })

  it('labels bytes only when total unknown', () => {
    expect(demoDownloadProgressLabel({
      phase: 'downloading',
      bytesDone: 512 * 1024,
      bytesTotal: null,
      pct: null,
    }, 'deadlock')).toBe('Downloading replay… 512 KB')
  })

  it('uses demo wording for CS2', () => {
    expect(demoDownloadProgressLabel(null, 'cs2')).toBe('Downloading demo…')
  })
})
