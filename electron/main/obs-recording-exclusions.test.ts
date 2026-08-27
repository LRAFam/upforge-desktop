import { describe, expect, it } from 'vitest'
import { addExcludedObsRecordingPath } from './obs-recording-exclusions'

describe('addExcludedObsRecordingPath', () => {
  it('persists a non-gameplay OBS recording without duplicates', () => {
    const first = addExcludedObsRecordingPath(undefined, '/recordings/marketing.mp4')
    const second = addExcludedObsRecordingPath(first, '/recordings/marketing.mp4')

    expect(second).toEqual(['/recordings/marketing.mp4'])
  })

  it('keeps the exclusion list bounded', () => {
    let paths: string[] = []
    for (let i = 0; i < 300; i++) {
      paths = addExcludedObsRecordingPath(paths, `/recordings/marketing-${i}.mp4`)
    }

    expect(paths).toHaveLength(250)
    expect(paths[0]).toBe('/recordings/marketing-299.mp4')
    expect(paths).not.toContain('/recordings/marketing-0.mp4')
  })

  it('ignores an unavailable recording path', () => {
    expect(addExcludedObsRecordingPath(['/recordings/known.mp4'], '  ')).toEqual([
      '/recordings/known.mp4',
    ])
  })
})
