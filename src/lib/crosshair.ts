/**
 * crosshair.ts
 * Shared crosshair types, Valorant code parser, and canvas preview renderer.
 * Used by CrosshairSettingsPanel.vue and the settings persistence layer.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CrosshairSettings {
  colorIndex: number    // 0=white 1=green 2=yellow 3=cyan 4=pink 5=red 6=custom
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

/**
 * Parse a Valorant crosshair import code into CrosshairSettings.
 * Format: "version;profile;key;val;key;val;..."
 * Throws an error with a user-friendly message on invalid input.
 */
export function parseValorantCode(code: string): CrosshairSettings {
  const parts = code.trim().split(';')
  if (parts.length < 4) {
    throw new Error('Invalid crosshair code — too short')
  }

  const kv: Record<string, string> = {}
  for (let i = 2; i + 1 < parts.length; i += 2) {
    kv[parts[i]] = parts[i + 1]
  }

  const s = { ...DEFAULT_CROSSHAIR }

  // Color
  if (kv['c'] !== undefined) {
    const idx = parseInt(kv['c'], 10)
    if (idx >= 0 && idx < CROSSHAIR_PALETTE_HEX.length) {
      s.colorIndex = idx
    } else {
      s.colorIndex = 6 // custom
    }
  }
  if (kv['u'] !== undefined && kv['u'].length === 6) {
    s.colorIndex = 6
    s.customColor = kv['u'].toUpperCase()
  }

  // Dot
  s.dotShow = (kv['h'] ?? '1') !== '0'
  if (kv['d'] !== undefined) s.dotOpacity = clamp(parseFloat(kv['d']), 0, 1)
  if (kv['z'] !== undefined) s.dotRadius  = clamp(parseFloat(kv['z']) * 1.5, 0.5, 6)

  // Inner lines
  s.innerShow = (kv['0s'] ?? '1') !== '0'
  if (kv['0t'] !== undefined) s.innerThickness = clamp(parseFloat(kv['0t']), 0.5, 8)
  if (kv['0l'] !== undefined) s.innerLength    = clamp(parseFloat(kv['0l']), 0, 30)
  if (kv['0o'] !== undefined) s.innerOffset    = clamp(parseFloat(kv['0o']), 0, 20)
  if (kv['0a'] !== undefined) s.innerOpacity   = clamp(parseFloat(kv['0a']), 0, 1)

  // Outer lines — only active when a length key is present and > 0
  const outerLen = kv['1l'] !== undefined ? parseFloat(kv['1l']) : 0
  s.outerShow = outerLen > 0 && (kv['1s'] ?? '1') !== '0'
  if (kv['1t'] !== undefined) s.outerThickness = clamp(parseFloat(kv['1t']), 0.5, 8)
  if (kv['1l'] !== undefined) s.outerLength    = clamp(parseFloat(kv['1l']), 0, 30)
  if (kv['1o'] !== undefined) s.outerOffset    = clamp(parseFloat(kv['1o']), 0, 20)
  if (kv['1a'] !== undefined) s.outerOpacity   = clamp(parseFloat(kv['1a']), 0, 1)

  return s
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
