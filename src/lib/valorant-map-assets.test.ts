import { describe, expect, it } from 'vitest'
import { getMapListViewImage } from './valorant'

describe('getMapListViewImage', () => {
  it('uses the compact list-view asset instead of the full splash', () => {
    const url = getMapListViewImage('Ascent')

    expect(url).toContain('/listviewicon.png')
    expect(url).not.toContain('/splash.png')
  })

  it('normalizes stored map aliases', () => {
    expect(getMapListViewImage('Duality')).toBe(getMapListViewImage('Bind'))
  })
})
