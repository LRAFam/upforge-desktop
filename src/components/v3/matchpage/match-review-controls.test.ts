import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8')
const header = read('./MatchPageHeaderV3.vue')
const body = read('../../vod-review/VodReviewBody.vue')

describe('match review controls have one main entry point each', () => {
  it('groups header tools into labelled View and Analysis toolbars with visible text', () => {
    expect(header).toMatch(/role="toolbar" aria-label="View"/)
    expect(header).toMatch(/role="toolbar" aria-label="Analysis"/)
    for (const label of ['Layout', 'Shortcuts', 'Trim file']) expect(header).toContain(`<span>${label}</span>`)
    expect(header).toContain("<span>{{ isRoundBased ? 'Round log' : 'Timeline' }}</span>")
    expect(header).toContain("'Focus video'")
  })
  it('keeps Focus video in the header only; the video keeps just Full screen', () => {
    expect(body).not.toMatch(/Theater mode — maximize video/)
    expect(body).toMatch(/Full screen \(F\)/)
  })
  it('has no second Shortcuts button under the video', () => {
    const v3Transport = body.slice(body.indexOf('<div class="vb3-transport">'), body.indexOf('<VodEventTimingControl v-if="recordingId && timeline && !theaterMode" />'))
    expect(v3Transport).not.toMatch(/>Shortcuts</)
  })
  it('names the map panel the same everywhere and calls the video overlay the minimap', () => {
    expect(header).toMatch(/label: MAP_TAB_LABEL/)
    expect(body).not.toMatch(/>Match Intel</)
    expect(body).toMatch(/>Show minimap</)
  })
  it('does not repeat the header section tabs inside the side panel', () => {
    expect(body).not.toMatch(/role="tablist" aria-label="Review panel"/)
  })
  it('shows the docked Map intel band only on narrow windows', () => {
    expect(body).toMatch(/px-3 py-2 md:hidden"/)
  })
})
