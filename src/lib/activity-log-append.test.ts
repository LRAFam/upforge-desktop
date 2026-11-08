import { describe, expect, it } from 'vitest'
import { appendActivityEntry } from './activity-log-append'

describe('appendActivityEntry', () => {
  it('appends and keeps the newest entries within the cap', () => {
    let list = appendActivityEntry([], { time: 1, message: 'a' }, 2)
    list = appendActivityEntry(list, { time: 2, message: 'b' }, 2)
    list = appendActivityEntry(list, { time: 3, message: 'c' }, 2)
    expect(list.map((e) => e.message)).toEqual(['b', 'c'])
  })
})
