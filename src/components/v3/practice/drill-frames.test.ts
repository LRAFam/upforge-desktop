import { describe, expect, it } from 'vitest'
import { CLIP_ASPECT, DEFAULT_CLIP, DEFAULT_CLIP_CAPTION, DRILL_CLIP, DRILL_FRAME_TARGET, FRAME_ASPECT, drillClip, drillFrame, drillPicture, frameLayout, ownClip } from './drill-frames'
import { TRAINER_SCENARIOS, TRAINER_SCENARIO_KEYS } from '../../../lib/trainer-scenarios'

describe('drill frames', () => {
  it('every drill with a marked target has a frame', () => {
    for (const key of Object.keys(DRILL_FRAME_TARGET)) {
      const frame = drillFrame(key)
      expect(frame, key).not.toBeNull()
      expect(frame!.url, key).toMatch(/\.webp/)
    }
  })

  it('gives the target for a drill that has one, and none where there is no single target', () => {
    expect(drillFrame('head_height')!.target).toEqual([0.4995, 0.4802])
    expect(drillFrame('jiggle_peek')!.target).toEqual([0.5039, 0.3969])
    expect(drillFrame('clear_site')!.target).toBeNull()
  })

  it('every drill in the catalogue has a real frame, the flat ones too', () => {
    for (const d of TRAINER_SCENARIOS) expect(drillFrame(d.key), d.key).not.toBeNull()
    expect(drillFrame('tracking')!.target).toEqual([0.5083, 0.343])
  })

  it('has no frame for unknown keys or no drill', () => {
    expect(drillFrame('not_a_drill')).toBeNull()
    expect(drillFrame(null)).toBeNull()
    expect(drillFrame('')).toBeNull()
  })

  it('matches whole file names only', () => {
    const urls = { '../frames/flick.webp': 'a', '../frames/microflick.webp': 'b' }
    expect(drillFrame('flick', urls)!.url).toBe('a')
    expect(drillFrame('microflick', urls)!.url).toBe('b')
    expect(drillFrame('lick', urls)).toBeNull()
  })
})

describe('placing a frame behind the hero copy', () => {
  const covers = (l: ReturnType<typeof frameLayout>, box: { width: number; height: number }) => {
    const imageHeight = (l.width / 100) * box.width / FRAME_ASPECT
    expect(l.left).toBeLessThanOrEqual(0.0001)
    expect(l.left + l.width).toBeGreaterThanOrEqual(99.9999)
    expect(l.top).toBeLessThanOrEqual(0.0001)
    expect((l.top / 100) * box.height + imageHeight).toBeGreaterThanOrEqual(box.height - 0.0001)
  }

  it('puts the target right of the copy and always covers the box', () => {
    const box = { width: 1232, height: 400 }
    const l = frameLayout([0.4995, 0.4802], box)
    covers(l, box)
    expect(l.target!.x).toBeCloseTo(0.62, 2)
    expect(l.target!.y).toBeCloseTo(0.46, 2)
  })

  it('when the edge of the frame stops it, the mark follows the picture', () => {
    const box = { width: 1232, height: 400 }
    const l = frameLayout([0.05, 0.5], box)      // a target near the left edge cannot be slid to 62%
    covers(l, box)
    expect(l.left).toBeCloseTo(0, 5)
    expect(l.target!.x).toBeCloseTo(0.05 * (l.width / 100), 5)
  })

  it('covers tall and narrow boxes too', () => {
    for (const box of [{ width: 700, height: 520 }, { width: 2000, height: 340 }, { width: 400, height: 400 }]) {
      for (const target of [[0.4995, 0.4802], [0.738, 0.5445], [0.4378, 0.4267], null] as const) {
        const l = frameLayout(target, box)
        covers(l, box)
        if (target) {
          expect(l.target!.x).toBeGreaterThanOrEqual(0)
          expect(l.target!.x).toBeLessThanOrEqual(1)
          expect(l.target!.y).toBeGreaterThanOrEqual(0)
          expect(l.target!.y).toBeLessThanOrEqual(1)
        } else {
          expect(l.target).toBeNull()
        }
      }
    }
  })
})

describe('run-through clips', () => {
  it('every clip named has its video and its still', () => {
    for (const key of Object.keys(DRILL_CLIP)) {
      const clip = drillClip(key)
      expect(clip, key).not.toBeNull()
      expect(clip!.video, key).toMatch(/\.mp4/)
      expect(clip!.still, key).toMatch(/\.webp/)
    }
    expect(DRILL_CLIP[DEFAULT_CLIP]).toBeDefined()
  })

  it('a clip only ever pictures its own drill, and only a drill this app can start', () => {
    for (const [key, entry] of Object.entries(DRILL_CLIP)) {
      expect(entry.clip, key).toBe(key)
      expect(entry.caption, key).toBeNull()
      expect(TRAINER_SCENARIO_KEYS, key).toContain(key)
    }
  })

  it('drills without a clip have none', () => {
    expect(drillClip('sixshot')).toBeNull()
    expect(drillClip('jiggle_peek')).toBeNull()
    expect(drillClip('angle_clearing')).toBeNull()
    expect(drillClip('clear_site')).toBeNull()
    expect(drillClip(null)).toBeNull()
    expect(drillClip('head_height', {}, {})).toBeNull()
  })

  it('a tile plays the drill\u2019s own clip', () => {
    for (const key of ['head_height', 'microflick', 'gridshot', 'strafe_track', 'flick']) expect(ownClip(key), key).not.toBeNull()
    expect(ownClip('angle_clearing')).toBeNull()
    expect(ownClip('sixshot')).toBeNull()
  })

  it('the hero always gets real footage: the clip, else the frame, else the default clip under its own name', () => {
    expect(drillPicture('head_height').clip!.caption).toBeNull()
    expect(drillPicture('angle_clearing')).toMatchObject({ clip: null })
    expect(drillPicture('angle_clearing').frame).not.toBeNull()
    expect(drillPicture('sixshot')).toMatchObject({ clip: null })
    expect(drillPicture('sixshot').frame).not.toBeNull()
    for (const nothing of [null, undefined, '', 'not_a_drill']) {
      const p = drillPicture(nothing)
      expect(p.frame).toBeNull()
      expect(p.clip!.video).toBe(drillClip(DEFAULT_CLIP)!.video)
      expect(p.clip!.caption).toBe(DEFAULT_CLIP_CAPTION)
    }
  })

  it('a clip is placed by its own shape and still covers the box', () => {
    const box = { width: 1512, height: 400 }
    const l = frameLayout([0.5, 0.5], box, { x: 0.64, y: 0.5 }, 1.3, CLIP_ASPECT)
    const imageHeight = (l.width / 100) * box.width / CLIP_ASPECT
    expect(l.left).toBeLessThanOrEqual(0.0001)
    expect(l.left + l.width).toBeGreaterThanOrEqual(99.9999)
    expect((l.top / 100) * box.height + imageHeight).toBeGreaterThanOrEqual(box.height - 0.0001)
    expect(l.target!.x).toBeCloseTo(0.64, 2)
  })
})
