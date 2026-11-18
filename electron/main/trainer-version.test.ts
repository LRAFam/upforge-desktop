import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { TRAINER_VERSION } from './trainer-version'

const root = join(__dirname, '..', '..')

describe('trainer version pin', () => {
  it('is a plain x.y.z version', () => {
    expect(TRAINER_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
  it('is the only place the release workflow takes the trainer tag from', () => {
    const workflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8')
    const downloads = workflow.split('\n').filter((line) => line.includes('upforge-trainer') && line.includes('gh release download'))
    expect(downloads.length).toBeGreaterThanOrEqual(2)
    for (const line of downloads) expect(line).not.toMatch(/download\s+v\d/)
    expect(workflow.match(/trainer-version\.json/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})
