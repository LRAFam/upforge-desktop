import { expect, it } from 'vitest'
import { parseReviewTime } from './review-media'
it('parses explicit media coordinates without rounding milliseconds', () => {
  expect(parseReviewTime('6:11.250')).toBe(371.25)
  expect(parseReviewTime('1:02:03.125')).toBe(3723.125)
  expect(parseReviewTime(' 0:00 ')).toBe(0)
  expect(parseReviewTime('371.25')).toBe(371.25)
})
it('rejects malformed or ambiguous timestamps', () => {
  for (const input of ['', '-1', '1:60', '1:99:01', '2e3', 'NaN', '1.5:20', '1:2:3:4', '1:20.1234']) expect(parseReviewTime(input)).toBeNull()
})
