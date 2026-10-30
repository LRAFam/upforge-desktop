/** Pure view helpers for the UI v3 post-game pop-up (no fake data: everything is derived from real inputs). */

export type PostGameTone = 'active' | 'paused' | 'success' | 'error' | 'neutral'

export interface PostGameSummary {
  result: 'win' | 'loss' | null
  ally: number | null
  enemy: number | null
  kills: number | null
  deaths: number | null
  assists: number | null
}

/** Result word shown in the hero, or null when the result is unknown. */
export function resultWord(s: PostGameSummary | null): string | null {
  if (!s) return null
  if (s.result === 'win') return 'VICTORY'
  if (s.result === 'loss') return 'DEFEAT'
  if (s.ally != null && s.enemy != null && s.ally === s.enemy) return 'DRAW'
  return null
}

/** Win/loss wash for the hero. Only data decides the colour. */
export function resultTone(s: PostGameSummary | null): 'win' | 'loss' | 'none' {
  if (s?.result === 'win') return 'win'
  if (s?.result === 'loss') return 'loss'
  return 'none'
}

/** "13–11" when both scores are known. */
export function scoreText(s: PostGameSummary | null): string | null {
  if (!s || s.ally == null || s.enemy == null) return null
  return `${s.ally}–${s.enemy}`
}

/** "18/14/6 K/D/A" when all three are known. */
export function kdaText(s: PostGameSummary | null): string | null {
  if (!s || s.kills == null || s.deaths == null || s.assists == null) return null
  return `${s.kills}/${s.deaths}/${s.assists} K/D/A`
}

/** Progress clamped to 0–100 (a sliver stays visible once work has started). */
export function progressWidth(progress: number | null): number | null {
  if (progress == null || !Number.isFinite(progress)) return null
  return Math.max(3, Math.min(100, Math.round(progress)))
}

/** Status colour by meaning: work in progress is neutral bone, paused gold, done teal, error loss. */
export function toneColor(tone: PostGameTone): string {
  switch (tone) {
    case 'success': return 'var(--uf-win)'
    case 'error': return 'var(--uf-loss)'
    case 'paused': return 'var(--uf-gold)'
    case 'neutral': return 'var(--uf-faint)'
    default: return 'var(--uf-bone)'
  }
}

/** One meta line: "Jett · Bind · 18/14/6 K/D/A" — only the parts we actually know. */
export function metaLine(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '').join(' · ')
}

/** Full-body agent art for the hero cut-out, from the same valorant-api source as the display icon. */
export function agentPortraitUrl(displayIconUrl: string | null | undefined): string | null {
  if (!displayIconUrl) return null
  return /\/agents\/[0-9a-f-]+\/displayicon\.png$/i.test(displayIconUrl)
    ? displayIconUrl.replace(/displayicon\.png$/i, 'fullportrait.png')
    : displayIconUrl
}

/** Post-game focus strip: one pip per recent focus game (hit / miss), plus a whole-number sentence. */
export interface PostGameFocusStrip {
  label: string
  pips: Array<'hit' | 'miss' | 'open'>
  line: string
}

interface FocusLike {
  label: string
  checks: Array<{ hit: boolean }>
  progress: { games_played: number; hits: number; games_required: number; hits_required: number; status: string }
}

export function postGameFocusStrip(focus: FocusLike | null | undefined): PostGameFocusStrip | null {
  if (!focus?.label) return null
  const required = Math.max(1, Math.min(focus.progress?.games_required ?? 0, 10))
  const recent = (focus.checks ?? []).slice(-required)
  const pips: PostGameFocusStrip['pips'] = recent.map(c => (c.hit ? 'hit' : 'miss'))
  while (pips.length < required) pips.push('open')
  const hits = recent.filter(c => c.hit).length
  const needed = focus.progress?.hits_required ?? 0
  const line = recent.length === 0
    ? `Your next ${required} ${required === 1 ? 'game checks' : 'games check'} this focus.`
    : `On target in ${hits} of your last ${recent.length} ${recent.length === 1 ? 'game' : 'games'}${needed ? `, ${needed} needed` : ''}.`
  return { label: focus.label, pips, line }
}
