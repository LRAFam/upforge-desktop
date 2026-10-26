import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { addExcludedObsRecordingPath } from './obs-recording-exclusions'

describe('addExcludedObsRecordingPath', () => {
  it('persists a non-gameplay OBS recording without duplicates', () => {
    const file = join('/recordings', 'marketing.mp4')
    const first = addExcludedObsRecordingPath(undefined, file)
    const second = addExcludedObsRecordingPath(first, file)

    expect(second).toEqual([file])
  })

  it('keeps the exclusion list bounded', () => {
    let paths: string[] = []
    for (let i = 0; i < 300; i++) {
      paths = addExcludedObsRecordingPath(paths, join('/recordings', `marketing-${i}.mp4`))
    }

    expect(paths).toHaveLength(250)
    expect(paths[0]).toBe(join('/recordings', 'marketing-299.mp4'))
    expect(paths).not.toContain(join('/recordings', 'marketing-0.mp4'))
  })

  it('ignores an unavailable recording path', () => {
    expect(addExcludedObsRecordingPath(['/recordings/known.mp4'], '  ')).toEqual([
      '/recordings/known.mp4',
    ])
  })
})
