import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { clutchClipWindow, clipTimingAfterTrim, replaceClipFileKeepingOriginal } from './clip-timing'

describe('clutchClipWindow', () => {
  it('includes the final kill when the clutch spans more than 105 seconds', () => {
    const window = clutchClipWindow(60_000, 190_000)
    expect(window.startMs).toBe(45_000)
    expect(window.startMs + window.durationMs).toBeGreaterThanOrEqual(193_000)
  })

  it('keeps the lead-in and follow-through for a short clutch', () => {
    expect(clutchClipWindow(60_000, 80_000)).toEqual({ startMs: 45_000, durationMs: 55_000 })
  })

  it('does not seek before the recording starts', () => {
    expect(clutchClipWindow(5_000, 20_000)).toEqual({ startMs: 0, durationMs: 40_000 })
  })
})

describe('clipTimingAfterTrim', () => {
  const kill = (clipMs: number, vodMs: number) => ({ event_type: 'kill' as const, clip_offset_ms: clipMs, vod_offset_ms: vodMs })

  it('keeps nulls', () => {
    expect(clipTimingAfterTrim({ momentOffsetMs: null, clipStartMs: null, clipEvents: null }, 2, 10))
      .toEqual({ momentOffsetMs: null, clipStartMs: null, clipEvents: null })
  })

  it('keeps the absolute moment offset, moves the clip start later and shifts events back', () => {
    const before = { momentOffsetMs: 120_000, clipStartMs: 100_000, clipEvents: [kill(3_000, 103_000), kill(20_000, 120_000), kill(29_000, 129_000)] }
    const after = clipTimingAfterTrim(before, 8, 26)
    expect(after.momentOffsetMs).toBe(120_000)
    expect(after.clipStartMs).toBe(108_000)
    // 3 s kill trimmed away; 29 s kill is past the new 18 s end.
    expect(after.clipEvents).toEqual([kill(12_000, 120_000)])
    // Invariant: clip start + clip offset is still the VOD offset.
    expect(after.clipStartMs! + after.clipEvents![0].clip_offset_ms).toBe(after.clipEvents![0].vod_offset_ms)
  })
})

describe('replaceClipFileKeepingOriginal', () => {
  let dir = ''
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-trim-')) })
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }) })

  it('swaps in the trimmed file and removes the backup', () => {
    const clip = path.join(dir, 'clip.mp4'); const trimmed = path.join(dir, 'clip_trimmed.mp4')
    fs.writeFileSync(clip, 'original'); fs.writeFileSync(trimmed, 'trimmed')
    replaceClipFileKeepingOriginal(clip, trimmed)
    expect(fs.readFileSync(clip, 'utf8')).toBe('trimmed')
    expect(fs.existsSync(clip + '.bak')).toBe(false)
  })

  it('a failed swap keeps the original clip in place', () => {
    const clip = path.join(dir, 'clip.mp4')
    fs.writeFileSync(clip, 'original')
    // Trimmed output missing → second rename fails.
    expect(() => replaceClipFileKeepingOriginal(clip, path.join(dir, 'missing.mp4'))).toThrow()
    expect(fs.readFileSync(clip, 'utf8')).toBe('original')
  })

  it('if the original cannot even be moved aside, nothing is touched', () => {
    const clip = path.join(dir, 'clip.mp4'); const trimmed = path.join(dir, 'clip_trimmed.mp4')
    fs.writeFileSync(clip, 'original'); fs.writeFileSync(trimmed, 'trimmed')
    const real = fs.renameSync
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw Object.assign(new Error('EXDEV'), { code: 'EXDEV' }) })
    expect(() => replaceClipFileKeepingOriginal(clip, trimmed)).toThrow('EXDEV')
    expect(real).toBeTypeOf('function')
    expect(fs.readFileSync(clip, 'utf8')).toBe('original')
  })
})
