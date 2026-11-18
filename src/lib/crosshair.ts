/**
 * crosshair.ts
 * Shared crosshair types, Valorant code parser, and canvas preview renderer.
 * Used by CrosshairSettingsPanel.vue and the settings persistence layer.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CrosshairSettings {
  colorIndex: number    // 0=white 1=green 2=yellow 3=cyan 4=pink 5=red 6=custom (UpForge swatches, not Valorant's slots)
  customColor: string   // hex without '#', e.g. '00FF6B'
  dotShow: boolean
  dotRadius: number     // 0.5–6
  dotOpacity: number    // 0–1
  innerShow: boolean
  innerThickness: number // 0.5–8
  innerLength: number    // 0–30
  innerOffset: number    // 0–20
  innerOpacity: number   // 0–1
  outerShow: boolean
  outerThickness: number
  outerLength: number
  outerOffset: number
  outerOpacity: number
  shadowShow: boolean
}

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
  colorIndex: 1,
  customColor: '00FF6B',
  dotShow: true,
  dotRadius: 1.5,
  dotOpacity: 1.0,
  innerShow: true,
  innerThickness: 2,
  innerLength: 10,
  innerOffset: 4,
  innerOpacity: 1.0,
  outerShow: false,
  outerThickness: 2,
  outerLength: 5,
  outerOffset: 10,
  outerOpacity: 1.0,
  shadowShow: true,
}

// ── Valorant code parser ───────────────────────────────────────────────────────
//
// Riot does not publish the import-code format. This follows the community-read format that
// open-source crosshair renderers use: `0;<general>;P;<primary>;A;<ADS>;S;<sniper>`, as key;value
// pairs, with a single capital letter starting each profile. Only the primary profile (P) is read.
// Primary keys: c colour slot (0 white, 1 green, 2 yellow green, 3 green yellow, 4 yellow, 5 cyan,
// 6 pink, 7 red, 8 custom), u custom colour as RRGGBBAA, h outlines on, o outline opacity,
// d centre dot on, z dot width (px), a dot opacity, 0b / 1b inner / outer lines on, then
// 0t 0l 0o 0a / 1t 1l 1o 1a = thickness, length, offset, opacity. A missing key is Valorant's default.
// Both offsets (0o, 1o) are measured from the centre; UpForge measures the outer one from the inner lines' end
// (see placeOuterLines).

const VALORANT_DEFAULTS = {
  c: 0, h: 1, o: 0.5, d: 0, z: 2, a: 1,
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

  // Outlines (drawn as the trainer's shadow)
  s.shadowShow = on('h') && num('o') > 0

  // Centre dot: z is its width in px, the same unit as line thickness
  s.dotShow = on('d')
  s.dotRadius = clamp(num('z') / 2, 0.5, 6)
  s.dotOpacity = clamp(num('a'), 0, 1)

  // Inner and outer lines (a 0-thickness line is invisible in game)
  s.innerShow = on('0b') && num('0t') > 0
  s.innerThickness = clamp(num('0t'), 0.5, 8)
  s.innerLength = clamp(num('0l'), 0, 30)
  s.innerOffset = clamp(num('0o'), 0, 20)
  s.innerOpacity = clamp(num('0a'), 0, 1)

  s.outerShow = on('1b') && num('1t') > 0
  s.outerThickness = clamp(num('1t'), 0.5, 8)
  s.outerOpacity = clamp(num('1a'), 0, 1)
  placeOuterLines(s, Math.max(0, num('1o')), Math.max(0, num('1l')))

  return s
}

/**
 * Valorant draws outer lines from `start` to `start + length` px from the centre. UpForge's previews and the
 * trainer draw them from innerOffset + innerLength + outerOffset, even when the inner lines are hidden, so the
 * offset is converted here (saved settings keep UpForge's meaning).
 */
function placeOuterLines(s: CrosshairSettings, start: number, length: number): void {
  // Hidden inner lines only push the outer lines out: shrink them to end where the outer lines start.
  if (s.outerShow && (!s.innerShow || s.innerLength <= 0)) {
    s.innerOffset = Math.min(s.innerOffset, start)
    s.innerLength = Math.min(s.innerLength, start - s.innerOffset)
  }
  const innerEnd = s.innerOffset + s.innerLength
  if (start >= innerEnd) {
    s.outerOffset = clamp(start - innerEnd, 0, 20)
    s.outerLength = clamp(length, 0, 30)
    return
  }
  // Outer lines that start under the inner lines can only start where those end. They keep their outer end, so the
  // crosshair reaches as far as in Valorant (length 0 when they lie wholly under the inner lines).
  s.outerOffset = 0
  s.outerLength = clamp(start + length - innerEnd, 0, 30)
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

  const color = resolveColor(s)
  const shadowColor = 'rgba(0,0,0,0.55)'

  // Scale factor: preview canvas is small so scale crosshair to fit nicely
  const scale = Math.min(w, h) / 80

  const innerGap   = s.innerOffset  * scale
  const innerLen   = s.innerLength  * scale
  const innerThick = s.innerThickness * scale
  const outerGap   = innerGap + innerLen + s.outerOffset * scale
  const outerLen   = s.outerLength  * scale
  const outerThick = s.outerThickness * scale
  const dotR       = s.dotRadius    * scale

  function drawArms(gap: number, len: number, thick: number, col: string) {
    ctx!.strokeStyle = col
    ctx!.lineWidth = thick
    ctx!.lineCap = 'square'
    ctx!.beginPath()
    ctx!.moveTo(cx,        cy - gap)
    ctx!.lineTo(cx,        cy - gap - len)
    ctx!.moveTo(cx,        cy + gap)
    ctx!.lineTo(cx,        cy + gap + len)
    ctx!.moveTo(cx - gap,  cy)
    ctx!.lineTo(cx - gap - len, cy)
    ctx!.moveTo(cx + gap,  cy)
    ctx!.lineTo(cx + gap + len, cy)
    ctx!.stroke()
  }

  // Outer lines
  if (s.outerShow && outerLen > 0) {
    const outerCol = colorWithOpacity(color, s.outerOpacity)
    if (s.shadowShow) drawArms(outerGap, outerLen, outerThick + 2 * scale, shadowColor)
    drawArms(outerGap, outerLen, outerThick, outerCol)
  }

  // Inner lines
  if (s.innerShow && innerLen > 0) {
    const innerCol = colorWithOpacity(color, s.innerOpacity)
    if (s.shadowShow) drawArms(innerGap, innerLen, innerThick + 2 * scale, shadowColor)
    drawArms(innerGap, innerLen, innerThick, innerCol)
  }

  // Center dot
  if (s.dotShow && dotR > 0) {
    const dotCol = colorWithOpacity(color, s.dotOpacity)
    if (s.shadowShow) {
      ctx.beginPath()
      ctx.arc(cx, cy, dotR + scale, 0, Math.PI * 2)
      ctx.fillStyle = shadowColor
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2)
    ctx.fillStyle = dotCol
    ctx.fill()
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
