/**
 * P0 · Shareable proof, first slice: a rank card drawn locally from the player's real rank.
 * No server call, no paid feature. Exported as PNG through the existing screenshots:save path.
 */
export interface RankCardData {
  rankName: string
  rr: number | null
  change: number | null
  playerName: string | null
  dateLabel: string
}

export const CARD_W = 1200
export const CARD_H = 630

export function rankCardLines(d: RankCardData): { eyebrow: string; title: string; sub: string } {
  const change = d.change != null && d.change !== 0 ? ` · ${d.change > 0 ? '+' : '−'}${Math.abs(d.change)} RR last match` : ''
  return {
    eyebrow: d.change != null && d.change > 0 ? 'Climbing with UpForge' : 'Current rank',
    title: d.rankName,
    sub: `${d.rr != null ? `${d.rr} RR` : 'Ranked'}${change}`,
  }
}

/** Draw the card. Colours mirror the v3 tokens; fonts fall back to system fonts if not loaded. */
export function drawRankCard(ctx: CanvasRenderingContext2D, d: RankCardData, icon: CanvasImageSource | null): void {
  const { eyebrow, title, sub } = rankCardLines(d)
  ctx.fillStyle = '#0e1116'
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  // One red hairline as the brand mark; no gradients.
  ctx.fillStyle = '#ff4655'
  ctx.fillRect(80, 96, 64, 4)
  ctx.fillStyle = '#9aa2ad'
  ctx.font = '600 26px "IBM Plex Sans", system-ui, sans-serif'
  ctx.fillText(eyebrow.toUpperCase(), 80, 150)
  ctx.fillStyle = '#ece8e1'
  ctx.font = '800 136px "Big Shoulders Display", Impact, sans-serif'
  ctx.fillText(title.toUpperCase(), 80, 300, icon ? 760 : 1040)
  ctx.font = '600 40px "IBM Plex Sans", system-ui, sans-serif'
  ctx.fillText(sub, 80, 372)
  if (d.rr != null) {
    ctx.fillStyle = '#232a33'
    ctx.fillRect(80, 410, 520, 8)
    ctx.fillStyle = '#22a99b'
    ctx.fillRect(80, 410, Math.round(520 * Math.max(0, Math.min(100, d.rr)) / 100), 8)
  }
  if (icon) ctx.drawImage(icon, 880, 120, 240, 240)
  ctx.fillStyle = '#646c77'
  ctx.font = '400 26px "IBM Plex Sans", system-ui, sans-serif'
  ctx.fillText([d.playerName, d.dateLabel].filter(Boolean).join(' · '), 80, 550)
  ctx.fillStyle = '#ece8e1'
  ctx.font = '800 34px "Big Shoulders Display", Impact, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('UPFORGE', 1120, 550)
  ctx.textAlign = 'left'
}
