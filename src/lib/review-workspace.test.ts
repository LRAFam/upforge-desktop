import { describe, expect, it } from 'vitest'
import { boundedPanelWidth, draggedPanelWidth } from './review-workspace'

describe('workspace panel sizing', () => {
  it('keeps both panels bounded so the video retains space', () => {
    expect(boundedPanelWidth(90, 16, 28)).toBe(28)
    expect(boundedPanelWidth(-10, 24, 40)).toBe(24)
    expect(boundedPanelWidth(NaN, 16, 28)).toBe(16)
  })
  it('uses the panel container and reverses the right edge direction', () => {
    expect(draggedPanelWidth(20, 100, 1000)).toBe(30)
    expect(draggedPanelWidth(32, 100, 800, true)).toBe(19.5)
    expect(draggedPanelWidth(20, 100, 0)).toBe(20)
  })
})

import { comparisonPanelWidths, nearbyReviewEvent } from './review-workspace'
it('bounds comparison widths and rejects invalid persisted settings', () => {
  expect(comparisonPanelWidths({ version: 1, videos: 95, notebook: -1 })).toEqual({ videos: 65, notebook: 20 })
  expect(comparisonPanelWidths({ version: 1, videos: NaN, notebook: Infinity })).toEqual({ videos: 50, notebook: 24 })
  expect(comparisonPanelWidths({ version: 2, videos: 40, notebook: 30 })).toEqual({ videos: 50, notebook: 24 })
})
it('only identifies unambiguous nearby events, without assigning a round across gaps', () => {
  const events = [{ seconds: 371, label: 'R4 kill' }, { seconds: 390, label: 'R5 plant' }]
  expect(nearbyReviewEvent(events, 369)?.label).toBe('R4 kill')
  expect(nearbyReviewEvent(events, 380)).toBeNull()
  expect(nearbyReviewEvent([{ seconds: 369 }, { seconds: 373 }], 371)).toBeNull()
  expect(nearbyReviewEvent(events, NaN)).toBeNull()
})
