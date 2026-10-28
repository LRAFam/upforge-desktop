import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { appendSupportActivity, readSupportActivity } from './support-activity-history'

const roots: string[] = []
function root() { const value = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-support-')); roots.push(value); return value }
afterEach(() => { roots.forEach((value) => fs.rmSync(value, { recursive: true, force: true })); roots.length = 0 })

it('reads earlier sessions from disk without mixing UpForge profiles', () => {
  const one = root(); const two = root()
  appendSupportActivity(one, { time: 10, message: 'League match saved', game: 'lol' })
  appendSupportActivity(two, { time: 20, message: 'Another user' })
  appendSupportActivity(one, { time: 30, message: 'App restarted' })
  expect(readSupportActivity(one).map((e) => e.message)).toEqual(['League match saved', 'App restarted'])
  expect(readSupportActivity(two).map((e) => e.message)).toEqual(['Another user'])
})

it('redacts credentials and bounds stored history', () => {
  const dir = root()
  appendSupportActivity(dir, { time: 1, message: 'token=private-secret user@example.com' })
  expect(fs.readFileSync(path.join(dir, 'support-activity.json'), 'utf8')).not.toMatch(/private-secret|user@example.com/)
  fs.writeFileSync(path.join(dir, 'support-activity.json'), JSON.stringify(Array.from({ length: 500 }, (_, time) => ({ time, message: 'entry' }))))
  appendSupportActivity(dir, { time: 999, message: 'latest' })
  expect(readSupportActivity(dir)).toHaveLength(500)
  expect(readSupportActivity(dir).at(-1)?.message).toBe('latest')
})

it('tolerates corrupt or unavailable history without breaking capture', () => {
  const dir = root()
  fs.writeFileSync(path.join(dir, 'support-activity.json'), 'partial write')
  expect(readSupportActivity(dir)).toEqual([])
  appendSupportActivity(dir, { time: 1, message: 'recovered' })
  expect(readSupportActivity(dir)).toHaveLength(1)
  const file = path.join(dir, 'not-a-directory'); fs.writeFileSync(file, '')
  expect(() => appendSupportActivity(file, { time: 1, message: 'capture continues' })).not.toThrow()
})
