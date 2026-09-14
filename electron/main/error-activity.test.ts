import { afterEach, expect, it } from 'vitest'
import { recordErrorActivity, recentErrorActivity, clearErrorActivity } from './error-activity'

afterEach(clearErrorActivity)

it('retains the latest 50 timestamped entries and snapshots them independently', () => {
  for (let i = 0; i < 60; i++) recordErrorActivity(`Activity ${i}`, i)
  const snapshot = recentErrorActivity()
  expect(snapshot).toHaveLength(50)
  expect(snapshot[0]).toEqual({ time: 10, message: 'Activity 10' })
  snapshot[0]!.message = 'changed'
  clearErrorActivity()
  expect(recentErrorActivity()).toEqual([])
  expect(snapshot).toHaveLength(50)
})

it('redacts credentials, emails and private paths before bounding messages', () => {
  recordErrorActivity('Bearer abc123 user@example.com token="secret value" /Users/Adam Doe/Videos/game.mp4', 1)
  const message = recentErrorActivity()[0]!.message
  for (const secret of ['abc123', 'user@example.com', 'secret value', 'Adam Doe']) expect(message).not.toContain(secret)
  recordErrorActivity('x'.repeat(10000))
  expect(recentErrorActivity()[1]!.message).toHaveLength(500)
})
