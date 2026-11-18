import { describe, expect, it } from 'vitest'
import { CROSSHAIR_PALETTE_NAMES, parseValorantCode, resolveColor } from './crosshair'

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
    expect(s.dotRadius).toBe(1) // z defaults to 2 px wide → radius 1
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
    // Outer lines are on unless 1b;0.
    expect(parseValorantCode(PRO.forsaken)).toMatchObject({
      innerShow: true, innerThickness: 3, innerLength: 1, innerOffset: 0, innerOpacity: 1,
      outerShow: true, outerThickness: 1, outerLength: 4, outerOffset: 0, outerOpacity: 1,
    })
  })

  it('reads only the primary profile: the ADS and sniper sections never leak in', () => {
    // "Small, thin, cyan, with a dot in the centre". Its ADS profile turns the inner lines off and uses z;3.
    expect(parseValorantCode(PRO.crazyface)).toMatchObject({
      colorIndex: 3, dotShow: true, dotRadius: 0.5, shadowShow: false,
      innerShow: true, innerThickness: 1, innerLength: 2, innerOffset: 1, innerOpacity: 1, outerShow: false,
    })
    // The sniper section's c;0 must not turn ZmjjKK's red into white.
    expect(parseValorantCode(PRO.zmjjkk).colorIndex).toBe(5)
  })

  it('missing keys use Valorant’s defaults (the default code is "0")', () => {
    expect(parseValorantCode('0')).toMatchObject({
      colorIndex: 0, shadowShow: true, dotShow: false, dotRadius: 1, dotOpacity: 1,
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
