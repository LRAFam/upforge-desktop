import { describe, expect, it } from 'vitest'
import {
  crashSafeObsRecFormat,
  parseObsStudioVersion,
  supportsHybridMp4,
} from './obs-rec-format'

describe('parseObsStudioVersion', () => {
  it('parses semver strings', () => {
    expect(parseObsStudioVersion('30.2.3')).toEqual({ major: 30, minor: 2, patch: 3 })
    expect(parseObsStudioVersion('28.1')).toEqual({ major: 28, minor: 1, patch: 0 })
  })

  it('returns null for invalid input', () => {
    expect(parseObsStudioVersion(null)).toBeNull()
    expect(parseObsStudioVersion('')).toBeNull()
    expect(parseObsStudioVersion('obs-websocket-5')).toBeNull()
  })
})

describe('crashSafeObsRecFormat', () => {
  it('uses hybrid_mp4 on OBS 30.2+', () => {
    expect(supportsHybridMp4('30.2.0')).toBe(true)
    expect(supportsHybridMp4('31.0.0')).toBe(true)
    expect(crashSafeObsRecFormat('30.2.0')).toBe('hybrid_mp4')
  })

  it('uses mkv on older OBS', () => {
    expect(supportsHybridMp4('30.1.2')).toBe(false)
    expect(supportsHybridMp4('28.1.0')).toBe(false)
    expect(crashSafeObsRecFormat('30.1.2')).toBe('mkv')
    expect(crashSafeObsRecFormat(null)).toBe('mkv')
  })
})
