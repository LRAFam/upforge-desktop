import type { NormPoint } from './spatial-types'
import type { ZoneCallout } from './spatial-zones'

export interface ZoneDrawStyle {
  dotRadius: number
  labelFont: string
  showLabels: boolean
}

export function zoneDrawStyle(canvasSize: number, opts?: { compact?: boolean; forceLabels?: boolean }): ZoneDrawStyle {
  const compact = opts?.compact ?? canvasSize < 200
  const showLabels = opts?.forceLabels ?? canvasSize >= 240
  return {
    dotRadius: compact ? 1.5 : 2.5,
    labelFont: compact ? '8px system-ui, sans-serif' : '9px system-ui, sans-serif',
    showLabels,
  }
}

export function drawZoneAnchorDot(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  radius = 2.5,
) {
  ctx.beginPath()
  ctx.arc(px, py, radius, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(148, 163, 184, 0.5)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.28)'
  ctx.lineWidth = 1
  ctx.stroke()
}

export function drawZoneAnchorLabel(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  text: string,
  canvasSize: number,
  font = '9px system-ui, sans-serif',
) {
  ctx.font = font
  const tw = ctx.measureText(text).width
  const padX = 4
  const boxW = tw + padX * 2
  const boxH = 12
  let bx = px + 5
  let by = py - boxH - 4
  if (bx + boxW > canvasSize - 2) bx = px - boxW - 5
  if (by < 2) by = py + 6
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)'
  ctx.beginPath()
  ctx.roundRect(bx, by, boxW, boxH, 3)
  ctx.fill()
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText(text, bx + padX, by + 9)
}

export function drawZoneAnchors(
  ctx: CanvasRenderingContext2D,
  callouts: ZoneCallout[],
  canvasSize: number,
  toDisplay: (norm: NormPoint) => NormPoint,
  style: ZoneDrawStyle,
  labelFilter?: Set<string>,
) {
  ctx.save()
  for (const z of callouts) {
    const d = toDisplay({ x: z.x, y: z.y })
    const px = d.x * canvasSize
    const py = d.y * canvasSize
    drawZoneAnchorDot(ctx, px, py, style.dotRadius)
    const showLabel = style.showLabels && (!labelFilter || labelFilter.has(z.name))
    if (showLabel) drawZoneAnchorLabel(ctx, px, py, z.name, canvasSize, style.labelFont)
  }
  ctx.restore()
}

export function drawCalloutCountLabel(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  callout: string,
  count: number,
  fontSize: number,
) {
  const text = count > 1 ? `${callout} (${count})` : callout
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)'
  ctx.lineWidth = 3
  ctx.strokeText(text, px + 6, py - 6)
  ctx.fillText(text, px + 6, py - 6)
}
