import { describe, expect, it } from 'vitest'
import { deriveHardwareBucket } from './machine-profile'

describe('deriveHardwareBucket', () => {
  it('marks low when few cores or little RAM or software encoder', () => {
    expect(deriveHardwareBucket({ cpuCores: 4, ramGb: 16, encoder: 'h264_nvenc' })).toBe('low')
    expect(deriveHardwareBucket({ cpuCores: 8, ramGb: 8, encoder: 'h264_nvenc' })).toBe('low')
    expect(deriveHardwareBucket({ cpuCores: 8, ramGb: 16, encoder: 'libx264' })).toBe('low')
  })

  it('marks high when strong CPU/RAM + hardware encoder', () => {
    expect(deriveHardwareBucket({ cpuCores: 16, ramGb: 32, encoder: 'h264_nvenc' })).toBe('high')
  })

  it('marks mid otherwise', () => {
    expect(deriveHardwareBucket({ cpuCores: 8, ramGb: 16, encoder: 'h264_nvenc' })).toBe('mid')
  })
})
