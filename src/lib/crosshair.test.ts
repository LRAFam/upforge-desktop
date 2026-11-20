import { describe, expect, it } from 'vitest'
import { crosshairSettingsToGodot } from '../../electron/main/trainer-settings'
import { crosshairShapes } from '../components/v3/practice/crosshair-preview'
import { CROSSHAIR_PALETTE_NAMES, CROSSHAIR_SETTINGS_VERSION, DEFAULT_CROSSHAIR, crosshairRects, migrateCrosshairSettings, parseValorantCode, resolveColor, type CrosshairSettings } from './crosshair'
import { normalizeCrosshairSettings } from '../../electron/main/trainer-settings'

/**
 * Public pro codes (as listed on prosettings.net, Nov 2026). Riot does not publish the code format;
 * the expected results follow the community-read format used by open-source crosshair renderers,
 * and the colour / shape each listing describes.
 */
const PRO = {
  tenz: '0;P;c;5;h;0;0l;4;0o;2;0a;1;1b;0',
  demon1: '0;s;1;P;o;1;d;1;m;1;0b;0;1b;0',
  zmjjkk: '0;s;1;P;c;7;u;000000FF;h;0;0l;3;0v;3;0g;1;0o;2;0a;1;0f;0;1b;0;S;c;0;s;1.2;o;1',
  forsaken: '0;s;1;P;c;8;u;000000FF;o;1;b;1;0t;3;0l;1;0v;0;0g;1;0o;0;0a;1;0f;0;1t;1;1l;4;1g;1;1o;0;1a;1;1m;0;1f;0;S;s;0.664;o;1',
  crazyface: '0;p;0;s;1;P;c;5;h;0;d;1;z;1;f;0;m;1;0t;1;0l;2;0o;1;0a;1;0e;0.847;1b;0;A;o;1;d;1;z;3;f;0;s;0;0b;0;1b;0;S;c;0;s;0.7;o;0.7',
  nats: '0;P;c;1;o;1.000;0a;1.000;0l;2;0t;1;0o;2;0f;0;1b;0',
  kyedae: '0;s;1;P;c;8;u;FFFFCCFF;h;0;b;1;f;0;0l;4;0o;0;0a;1;0f;0;1b;0',
  shanks: '0;p;0;c;1;s;1;P;c;5;u;00DD00FF;h;0;f;0;m;1;0l;4;0v;3;0o;1;0a;0.317;0f;0;1l;3;1o;1;1a;0.616;1m;0;1f;0;A;c;4;o;0.515;m;1;0t;1;0l;3;0v;3;0o;1;0a;1;0f;0;1b;0;S;c;1;o;1',
}
const colourName = (code: string) => {
  const s = parseValorantCode(code)
  return s.colorIndex === 6 ? `custom ${s.customColor}` : CROSSHAIR_PALETTE_NAMES[s.colorIndex]
}

describe('parseValorantCode: colours', () => {
  it('reads Valorant’s colour slots (cyan was read as red, yellow as pink, red and custom as green)', () => {
    expect(colourName(PRO.tenz)).toBe('Cyan')
    expect(colourName(PRO.zmjjkk)).toBe('Red')
    expect(colourName(PRO.nats)).toBe('Green')
    expect(colourName(PRO.demon1)).toBe('White') // no c = Valorant's default
    expect(colourName('0;P;c;4')).toBe('Yellow')
    expect(colourName('0;P;c;6')).toBe('Pink')
    // Slots UpForge has no swatch for keep their colour as a custom one.
    expect(colourName('0;P;c;2')).toBe('custom 7FFF00')
    expect(colourName('0;P;c;3')).toBe('custom DFFF00')
  })

  it('takes a custom colour from the 8-digit u (RRGGBBAA) only when slot 8 is picked', () => {
    expect(colourName(PRO.forsaken)).toBe('custom 000000')
    expect(colourName(PRO.kyedae)).toBe('custom FFFFCC')
    expect(colourName('0;P;c;8;u;FF8800')).toBe('custom FF8800')
    expect(resolveColor(parseValorantCode(PRO.kyedae))).toBe('#FFFFCC')
  })
})

describe('parseValorantCode: shape', () => {
  it('a dot-only code is a dot, not a cross', () => {
    const s = parseValorantCode(PRO.demon1)
    expect(s).toMatchObject({ dotShow: true, dotOpacity: 1, innerShow: false, outerShow: false, shadowShow: true })
    expect(s.dotSize).toBe(2) // z defaults to a 2 px square
  })

  it('lines, gap, opacity and outlines come from their own keys', () => {
    expect(parseValorantCode(PRO.tenz)).toMatchObject({
      shadowShow: false, dotShow: false,
      innerShow: true, innerThickness: 2, innerLength: 4, innerOffset: 2, innerOpacity: 1,
      outerShow: false,
    })
    // "Small, green, with outlines": no dot (h is the outline switch, not the dot).
    expect(parseValorantCode(PRO.nats)).toMatchObject({
      shadowShow: true, dotShow: false, innerShow: true, innerThickness: 1, innerLength: 2, innerOffset: 2, innerOpacity: 1, outerShow: false,
    })
    // Outer lines are on unless 1b;0; their offset is from the centre, as in Valorant.
    expect(parseValorantCode(PRO.forsaken)).toMatchObject({
      innerShow: true, innerThickness: 3, innerLength: 1, innerOffset: 0, innerOpacity: 1,
      outerShow: true, outerThickness: 1, outerLength: 4, outerOffset: 0, outerOpacity: 1,
      shadowShow: true, outlineOpacity: 1, outlineThickness: 1,
    })
  })

  it('reads only the primary profile: the ADS and sniper sections never leak in', () => {
    // "Small, thin, cyan, with a dot in the centre". Its ADS profile turns the inner lines off and uses z;3.
    expect(parseValorantCode(PRO.crazyface)).toMatchObject({
      colorIndex: 3, dotShow: true, dotSize: 1, shadowShow: false,
      innerShow: true, innerThickness: 1, innerLength: 2, innerOffset: 1, innerOpacity: 1, outerShow: false,
    })
    // The sniper section's c;0 must not turn ZmjjKK's red into white.
    expect(parseValorantCode(PRO.zmjjkk).colorIndex).toBe(5)
  })

  it('missing keys use Valorant’s defaults (the default code is "0")', () => {
    expect(parseValorantCode('0')).toMatchObject({
      colorIndex: 0, shadowShow: true, outlineThickness: 1, outlineOpacity: 0.5, dotShow: false, dotSize: 2, dotOpacity: 1,
      innerShow: true, innerThickness: 2, innerLength: 6, innerOffset: 3, innerOpacity: 0.8,
      outerShow: true, outerThickness: 2, outerLength: 2, outerOffset: 10, outerOpacity: 0.35,
    })
  })

  it('rejects text that is not a crosshair code', () => {
    for (const bad of ['', 'hello', '1;P;c;5', '0;P;c', 'P;c;5']) {
      expect(() => parseValorantCode(bad), bad).toThrow(/paste the full code/)
    }
    expect(parseValorantCode(`  ${PRO.tenz};  `).colorIndex).toBe(3)
  })
})

/** Where a line set's right arm is drawn, in px from the centre. */
function arm(s: CrosshairSettings, set: 'inner' | 'outer'): [number, number] | null {
  const only = { ...s, innerShow: set === 'inner' && s.innerShow, outerShow: set === 'outer' && s.outerShow, dotShow: false, shadowShow: false }
  const right = crosshairShapes(only, 1).rects[3]
  return right ? [right.x, right.x + right.w] : null
}

/**
 * In Valorant both offsets are measured from the centre: a line set runs from `offset` to `offset + length`
 * (open-source renderers: Crosshair CrosshairUtil.ts, crosshair-codes CrosshairDisplay.tsx, xhair utils.js).
 * Those renderers add the same firing-error gap to both sets when firing error is on; UpForge does not model it.
 */
describe('parseValorantCode: outer lines sit where Valorant draws them', () => {
  it('default code: outer lines 10–12 px out, 1 px past the inner lines (3–9 px), not 19–21 px', () => {
    const s = parseValorantCode('0')
    expect(arm(s, 'inner')).toEqual([3, 9])
    expect(arm(s, 'outer')).toEqual([10, 12])
  })

  it('f0rsakeN: outer lines that start under the inner lines run 0–4 px, under and past them', () => {
    const s = parseValorantCode(PRO.forsaken)
    expect(arm(s, 'inner')).toEqual([0, 1])
    expect(arm(s, 'outer')).toEqual([0, 4])
  })

  it('Shanks: outer lines lie on top of the inner lines (1–4 px over 1–5 px)', () => {
    const s = parseValorantCode(PRO.shanks)
    expect(arm(s, 'inner')).toEqual([1, 5])
    expect(arm(s, 'outer')).toEqual([1, 4])
  })

  it('inner lines off do not move the outer lines', () => {
    expect(arm(parseValorantCode('0;P;0b;0'), 'outer')).toEqual([10, 12])
    expect(arm(parseValorantCode('0;P;0b;0;1o;2'), 'outer')).toEqual([2, 4])
    expect(parseValorantCode('0;P;0b;0;1o;2').innerShow).toBe(false)
  })

  it('the trainer gets the outer offset from the centre (payload version 2)', () => {
    for (const [code, start] of [['0', 10], ['0;P;0b;0;1o;2', 2], ['0;P;1o;35', 35]] as const) {
      const g = crosshairSettingsToGodot(parseValorantCode(code))
      expect(g.version, code).toBe(2)
      expect(g.outer_offset, code).toBe(start)
    }
  })
})

describe('crosshairRects: drawn the way Valorant draws it', () => {
  /** Valorant's own default crosshair (code `0`) with the dot on, as "x,y,w,h@opacity". */
  const golden = (s: CrosshairSettings) => crosshairRects(s).map(r => `${r.x},${r.y},${r.w},${r.h}@${Math.round(r.opacity * 100) / 100}`)

  it('matches the trainer\'s golden rectangles (upforge-trainer tests/crosshair_test.gd test_golden)', () => {
    expect(golden(parseValorantCode('0;P;d;1'))).toEqual([
      // outline frames (top, bottom, left, right) of: 4 outer arms, 4 inner arms, the dot
      '-2,-13,4,1@0.5', '-2,-10,4,1@0.5', '-2,-12,1,2@0.5', '1,-12,1,2@0.5',
      '-2,9,4,1@0.5', '-2,12,4,1@0.5', '-2,10,1,2@0.5', '1,10,1,2@0.5',
      '-13,-2,4,1@0.5', '-13,1,4,1@0.5', '-13,-1,1,2@0.5', '-10,-1,1,2@0.5',
      '9,-2,4,1@0.5', '9,1,4,1@0.5', '9,-1,1,2@0.5', '12,-1,1,2@0.5',
      '-2,-10,4,1@0.5', '-2,-3,4,1@0.5', '-2,-9,1,6@0.5', '1,-9,1,6@0.5',
      '-2,2,4,1@0.5', '-2,9,4,1@0.5', '-2,3,1,6@0.5', '1,3,1,6@0.5',
      '-10,-2,8,1@0.5', '-10,1,8,1@0.5', '-10,-1,1,2@0.5', '-3,-1,1,2@0.5',
      '2,-2,8,1@0.5', '2,1,8,1@0.5', '2,-1,1,2@0.5', '9,-1,1,2@0.5',
      '-2,-2,4,1@0.5', '-2,1,4,1@0.5', '-2,-1,1,2@0.5', '1,-1,1,2@0.5',
      // fills: outer arms, inner arms, dot
      '-1,-12,2,2@0.35', '-1,10,2,2@0.35', '-12,-1,2,2@0.35', '10,-1,2,2@0.35',
      '-1,-9,2,6@0.8', '-1,3,2,6@0.8', '-9,-1,6,2@0.8', '3,-1,6,2@0.8',
      '-1,-1,2,2@1',
    ])
  })

  it('the dot is a square z px wide', () => {
    for (const z of [1, 2, 3, 6]) {
      const dot = crosshairRects(parseValorantCode(`0;P;h;0;d;1;z;${z};0b;0;1b;0`))
      expect(dot, `z ${z}`).toHaveLength(1)
      expect([dot[0].w, dot[0].h]).toEqual([z, z])
    }
  })

  it('the outline frames every part on all four sides at its own thickness and opacity', () => {
    const rects = crosshairRects(parseValorantCode('0;P;t;3;o;0.7;0l;6;0o;3;1b;0'))
    const frames = rects.filter(r => r.fill === '#000000')
    expect(frames).toHaveLength(16)
    expect(new Set(frames.map(r => r.opacity))).toEqual(new Set([0.7]))
    // right arm 3–9 px, 2 px thick: its frame reaches 3 px past both ends and both sides
    const right = frames.slice(12)
    expect(right[0]).toEqual(expect.objectContaining({ x: 0, y: -4, w: 12, h: 3 }))
    expect(right[2]).toEqual(expect.objectContaining({ x: 0, y: -1, w: 3, h: 2 }))
    expect(right[3]).toEqual(expect.objectContaining({ x: 9, y: -1, w: 3, h: 2 }))
    expect(crosshairRects(parseValorantCode('0;P;h;0;1b;0')).some(r => r.fill === '#000000')).toBe(false)
  })
})

describe('saved crosshairs from before version 2 keep their look', () => {
  const old = {
    colorIndex: 1, customColor: '00FF6B', dotShow: true, dotRadius: 1.5, dotOpacity: 1,
    innerShow: true, innerThickness: 2, innerLength: 8, innerOffset: 3, innerOpacity: 1,
    outerShow: true, outerThickness: 2, outerLength: 4, outerOffset: 5, outerOpacity: 1, shadowShow: true,
  }

  it('outer lines stay at inner offset + inner length + outer offset; the dot keeps its width', () => {
    const s = normalizeCrosshairSettings(old)
    expect(s).toMatchObject({ version: CROSSHAIR_SETTINGS_VERSION, outerOffset: 16, dotSize: 3, outlineThickness: 1, outlineOpacity: 0.5 })
    expect('dotRadius' in s).toBe(false)
    expect(arm(s, 'outer')).toEqual([16, 20])
  })

  it('a version 2 save, and saving it again, are left as they are', () => {
    const once = normalizeCrosshairSettings(old)
    expect(normalizeCrosshairSettings(once)).toEqual(once)
    expect(normalizeCrosshairSettings({ ...once, outerOffset: 7 }).outerOffset).toBe(7)
  })

  it('old saves without some fields use the old defaults for the move', () => {
    expect(migrateCrosshairSettings({ outerOffset: 10 })).toMatchObject({ outerOffset: 24, version: 2 })
    expect(normalizeCrosshairSettings({ colorIndex: 2 })).toMatchObject({ ...DEFAULT_CROSSHAIR, colorIndex: 2 })
    expect(migrateCrosshairSettings(null)).toBeNull()
  })
})
