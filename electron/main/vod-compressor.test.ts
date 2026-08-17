import { describe, expect, it } from 'vitest'
import { parseFfmpegProgress } from './ffmpeg-progress'

describe('parseFfmpegProgress', () => {
  it('calculates progress from FFmpeg duration and latest timestamp', () => {
    const output = [
      'Duration: 00:20:00.00, start: 0.000000, bitrate: 4500 kb/s',
      'frame=100 fps=30 time=00:02:00.00 bitrate=2500kbits/s',
      'frame=200 fps=30 time=00:05:00.00 bitrate=2200kbits/s',
    ].join('\n')

    expect(parseFfmpegProgress(output)).toBe(25)
  })

  it('caps active FFmpeg progress below completion', () => {
    const output = 'Duration: 00:01:00.00\nframe=1 time=00:01:01.00'
    expect(parseFfmpegProgress(output)).toBe(99)
  })

  it('returns null until duration and timestamp are both available', () => {
    expect(parseFfmpegProgress('frame=1 time=00:00:10.00')).toBeNull()
    expect(parseFfmpegProgress('Duration: 00:01:00.00')).toBeNull()
  })
})
