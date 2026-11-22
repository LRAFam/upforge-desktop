/**
 * crosshair.ts
 * Shared crosshair types, Valorant code parser, and canvas preview renderer.
 * Used by CrosshairSettingsPanel.vue and the settings persistence layer.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Sizes are screen pixels, as in Valorant (the trainer draws them 1:1 at every resolution).
 * Both offsets are measured from the centre. Version 2 is this meaning; older saves are moved to it by
 * migrateCrosshairSettings (outer offset was measured from the inner lines' end, the dot sized by a radius).
 */
export interface CrosshairSettings {
  version: number       // CROSSHAIR_SETTINGS_VERSION
  colorIndex: number    // 0=white 1=green 2=yellow 3=cyan 4=pink 5=red 6=custom (UpForge swatches, not Valorant's slots)
  customColor: string   // hex without '#', e.g. '00FF6B'
  dotShow: boolean
  dotSize: number       // width of the square dot, 1–6 px
  dotOpacity: number    // 0–1
  innerShow: boolean
  innerThickness: number // 0–10 px
  innerLength: number    // 0–20 px
  innerOffset: number    // 0–20 px from the centre
  innerOpacity: number   // 0–1
  outerShow: boolean
  outerThickness: number // 0–10 px
  outerLength: number    // 0–10 px
  outerOffset: number    // 0–40 px from the centre
  outerOpacity: number
  shadowShow: boolean    // the outline
  outlineThickness: number // 1–6 px on every side
  outlineOpacity: number   // 0–1
}

export const CROSSHAIR_SETTINGS_VERSION = 2

// ── Color palette (matches Godot CrosshairConfig.gd VALORANT_COLORS) ──────────

export const CROSSHAIR_PALETTE_HEX: string[] = [
  '#FFFFFF', // 0 white
  '#00FF6B', // 1 green  (Valorant default)
  '#FFD900', // 2 yellow
  '#00DEFF', // 3 cyan
  '#FF78DF', // 4 pink
  '#FF4555', // 5 red
]

export const CROSSHAIR_PALETTE_NAMES: string[] = [
  'White', 'Green', 'Yellow', 'Cyan', 'Pink', 'Red',
]

// ── Defaults (mirror DEFAULTS in settings-manager.ts) ─────────────────────────

export const DEFAULT_CROSSHAIR: CrosshairSettings = {
  version: CROSSHAIR_SETTINGS_VERSION,
  colorIndex: 1,
  customColor: '00FF6B',
  dotShow: true,
  dotSize: 2,
  dotOpacity: 1.0,
  innerShow: true,
  innerThickness: 2,
  innerLength: 10,
  innerOffset: 4,
  innerOpacity: 1.0,
  outerShow: false,
  outerThickness: 2,
  outerLength: 5,
  outerOffset: 24,
  outerOpacity: 1.0,
  shadowShow: true,
  outlineThickness: 1,
  outlineOpacity: 0.5,
}

/** Before version 2 (no `version`): the outer offset counted from the inner lines' end and the dot had a radius. */
const LEGACY = { innerOffset: 4, innerLength: 10 }

/**
 * Move a saved crosshair to version 2, keeping how it looked: the outer lines stay where they were drawn
 * (inner offset + inner length + outer offset from the centre) and the dot keeps its width (radius × 2).
 * Version 2 saves and non-objects are returned as they are. Wrong-typed values are left for the caller to drop.
 */
export function migrateCrosshairSettings(saved: unknown): unknown {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return saved
  const s = { ...(saved as Record<string, unknown>) }
  if (typeof s.version === 'number' && s.version >= CROSSHAIR_SETTINGS_VERSION) return s
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  if (typeof s.outerOffset === 'number' && Number.isFinite(s.outerOffset)) {
    s.outerOffset = n(s.innerOffset, LEGACY.innerOffset) + n(s.innerLength, LEGACY.innerLength) + s.outerOffset
  }
  if (typeof s.dotSize !== 'number' && typeof s.dotRadius === 'number' && Number.isFinite(s.dotRadius)) {
    s.dotSize = s.dotRadius * 2
  }
  delete s.dotRadius
  s.version = CROSSHAIR_SETTINGS_VERSION
  return s
}

// ── Valorant code parser ───────────────────────────────────────────────────────
//
// Riot does not publish the import-code format. This follows the community-read format that
// open-source crosshair renderers use: `0;<general>;P;<primary>;A;<ADS>;S;<sniper>`, as key;value
// pairs, with a single capital letter starting each profile. Only the primary profile (P) is read.
// Primary keys: c colour slot (0 white, 1 green, 2 yellow green, 3 green yellow, 4 yellow, 5 cyan,
// 6 pink, 7 red, 8 custom), u custom colour as RRGGBBAA, h outlines on, o outline opacity,
// d centre dot on, z dot width (px), a dot opacity, 0b / 1b inner / outer lines on, then
// 0t 0l 0o 0a / 1t 1l 1o 1a = thickness, length, offset, opacity, t outline thickness. A missing key is
// Valorant's default. Both offsets (0o, 1o) are measured from the centre, as UpForge's are.
// Not read: separate vertical lengths (0g/0v, 1g/1v), movement and firing error.

const VALORANT_DEFAULTS = {
  c: 0, h: 1, t: 1, o: 0.5, d: 0, z: 2, a: 1,
  '0b': 1, '0t': 2, '0l': 6, '0o': 3, '0a': 0.8,
  '1b': 1, '1t': 2, '1l': 2, '1o': 10, '1a': 0.35,
} as const
type ValorantKey = keyof typeof VALORANT_DEFAULTS

/** Valorant colour slot → UpForge swatch index, or (no matching swatch) that slot's colour as a custom hex. */
const VALORANT_SLOTS: ReadonlyArray<number | string> = [0, 1, '7FFF00', 'DFFF00', 2, 3, 4, 5]
const VALORANT_CUSTOM_SLOT = 8
const CUSTOM_COLOR_INDEX = 6
const INVALID_CODE = 'Invalid crosshair code — paste the full code from Valorant'

/**
 * Parse a Valorant crosshair import code (e.g. `0;P;c;5;h;0;0l;4;0o;2;0a;1;1b;0`) into CrosshairSettings.
 * Throws an error with a user-friendly message on invalid input.
 */
export function parseValorantCode(code: string): CrosshairSettings {
  const parts = code.trim().replace(/;+$/, '').split(';').map(p => p.trim())
  if (parts[0] !== '0') throw new Error(INVALID_CODE)

  // key → value for the primary profile only (the ADS / sniper profiles reuse the same keys).
  const primary: Record<string, string> = {}
  let profile = ''
  for (let i = 1; i < parts.length;) {
    if (/^[A-Z]$/.test(parts[i])) { profile = parts[i]; i += 1; continue }
    if (!parts[i] || i + 1 >= parts.length) throw new Error(INVALID_CODE)
    if (profile === 'P') primary[parts[i]] = parts[i + 1]
    i += 2
  }
  const num = (key: ValorantKey): number => {
    const v = parseFloat(primary[key] ?? '')
    return Number.isFinite(v) ? v : VALORANT_DEFAULTS[key]
  }
  const on = (key: ValorantKey) => num(key) !== 0

  const s: CrosshairSettings = { ...DEFAULT_CROSSHAIR }

  // Colour: u is kept as the custom colour (as in the game) but only used for the custom slot.
  const u = primary.u ?? ''
  const customHex = /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(u) ? u.slice(0, 6).toUpperCase() : null
  if (customHex) s.customColor = customHex
  const slot = Math.round(num('c'))
  if (slot === VALORANT_CUSTOM_SLOT) {
    s.colorIndex = CUSTOM_COLOR_INDEX
    s.customColor = customHex ?? 'FFFFFF'
  } else {
    const mapped = VALORANT_SLOTS[slot] ?? 0
    if (typeof mapped === 'number') {
      s.colorIndex = mapped
    } else {
      s.colorIndex = CUSTOM_COLOR_INDEX
      s.customColor = mapped
    }
  }

  // Outlines: a frame t px wide on every side of each line and the dot
  s.shadowShow = on('h') && num('o') > 0
  s.outlineThickness = clamp(num('t'), 1, 6)
  s.outlineOpacity = clamp(num('o'), 0, 1)

  // Centre dot: a square z px wide
  s.dotShow = on('d')
  s.dotSize = clamp(num('z'), 1, 6)
  s.dotOpacity = clamp(num('a'), 0, 1)

  // Inner and outer lines (a 0-thickness line is invisible in game); both offsets from the centre
  s.innerShow = on('0b') && num('0t') > 0
  s.innerThickness = clamp(num('0t'), 0, 10)
  s.innerLength = clamp(num('0l'), 0, 20)
  s.innerOffset = clamp(num('0o'), 0, 20)
  s.innerOpacity = clamp(num('0a'), 0, 1)

  s.outerShow = on('1b') && num('1t') > 0
  s.outerThickness = clamp(num('1t'), 0, 10)
  s.outerLength = clamp(num('1l'), 0, 10)
  s.outerOffset = clamp(num('1o'), 0, 40)
  s.outerOpacity = clamp(num('1a'), 0, 1)

  return s
}

// ── Geometry (the trainer's CrosshairConfig.rects(), number for number) ───────

export interface CrosshairRect { x: number; y: number; w: number; h: number; fill: string; opacity: number }

const OUTLINE_FILL = '#000000'
/** floor(v + 0.5), as the trainer snaps (Math.round differs from Godot's round at -0.5). */
const snap = (v: number) => Math.floor(v + 0.5)

/** Four arms around (0, 0): each starts `gap` px from the centre and runs `length` px outward, `thick` wide. */
function arms(gap: number, length: number, thick: number): Array<[number, number, number, number]> {
  const h = thick / 2
  return [
    [-h, -gap - length, thick, length], // up
    [-h, gap, thick, length],           // down
    [-gap - length, -h, length, thick], // left
    [gap, -h, length, thick],           // right
  ]
}

/**
 * The crosshair as filled rectangles in screen pixels around a centre at (0, 0), in drawing order: every outline
 * frame first (top, bottom, left, right of each part), then the outer lines, inner lines and the square dot.
 * Edges snap to whole pixels. This is what the trainer draws (upforge-trainer scripts/CrosshairConfig.gd), in
 * 2D and 3D drills, at every resolution.
 */
export function crosshairRects(s: CrosshairSettings): CrosshairRect[] {
  const color = resolveColor(s)
  const parts: Array<{ r: [number, number, number, number]; opacity: number }> = []
  if (s.outerShow && s.outerLength > 0 && s.outerThickness > 0) {
    for (const r of arms(s.outerOffset, s.outerLength, s.outerThickness)) parts.push({ r, opacity: s.outerOpacity })
  }
  if (s.innerShow && s.innerLength > 0 && s.innerThickness > 0) {
    for (const r of arms(s.innerOffset, s.innerLength, s.innerThickness)) parts.push({ r, opacity: s.innerOpacity })
  }
  if (s.dotShow && s.dotSize > 0) parts.push({ r: [-s.dotSize / 2, -s.dotSize / 2, s.dotSize, s.dotSize], opacity: s.dotOpacity })
  const snapped = parts.map(p => ({ x: snap(p.r[0]), y: snap(p.r[1]), w: snap(p.r[2]), h: snap(p.r[3]), opacity: p.opacity }))

  const out: CrosshairRect[] = []
  const t = snap(s.outlineThickness)
  if (s.shadowShow && t > 0 && s.outlineOpacity > 0) {
    const o = s.outlineOpacity
    for (const r of snapped) {
      out.push(
        { x: r.x - t, y: r.y - t, w: r.w + 2 * t, h: t, fill: OUTLINE_FILL, opacity: o },
        { x: r.x - t, y: r.y + r.h, w: r.w + 2 * t, h: t, fill: OUTLINE_FILL, opacity: o },
        { x: r.x - t, y: r.y, w: t, h: r.h, fill: OUTLINE_FILL, opacity: o },
        { x: r.x + r.w, y: r.y, w: t, h: r.h, fill: OUTLINE_FILL, opacity: o },
      )
    }
  }
  for (const r of snapped) out.push({ x: r.x, y: r.y, w: r.w, h: r.h, fill: color, opacity: r.opacity })
  return out
}

/** Half the size of the drawn crosshair in px, outline included. */
export function crosshairRectsExtent(s: CrosshairSettings): number {
  let e = 0
  for (const r of crosshairRects(s)) e = Math.max(e, -r.x, r.x + r.w, -r.y, r.y + r.h)
  return e
}

// ── Canvas preview renderer ────────────────────────────────────────────────────

/**
 * Render a crosshair preview onto a canvas element.
 * The crosshair is drawn centred; canvas background is left transparent.
 * Call this from a Vue watcher whenever the settings change.
 */
export function renderCrosshairPreview(
  canvas: HTMLCanvasElement,
  s: CrosshairSettings
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const cx = w / 2
  const cy = h / 2

  // Same rectangles as the trainer, magnified so the preview fills the canvas (whole screen px per trainer px).
  const scale = Math.max(1, Math.floor(Math.min(w, h) / 80))
  for (const r of crosshairRects(s)) {
    ctx.fillStyle = colorWithOpacity(r.fill, r.opacity)
    ctx.fillRect(Math.round(cx) + r.x * scale, Math.round(cy) + r.y * scale, r.w * scale, r.h * scale)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** Returns the CSS hex color for the current settings. */
export function resolveColor(s: CrosshairSettings): string {
  if (s.colorIndex === 6) return '#' + s.customColor.replace('#', '')
  return CROSSHAIR_PALETTE_HEX[s.colorIndex] ?? '#00FF6B'
}

function colorWithOpacity(hex: string, opacity: number): string {
  // Convert to rgba
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${opacity})`
}
