import type { ClipRecord } from '../env.d.ts'
export interface CloudClipReview { clip: ClipRecord; quota: { limit: number | null; used: number; remaining: number | null } }
export function cloudClipReview(value: unknown): CloudClipReview {
  const data = value as { clip?: Record<string, any>; quota?: CloudClipReview['quota'] }
  const c = data?.clip, q = data?.quota
  if (!c || !Number.isSafeInteger(c.id) || c.id < 1 || typeof c.video_url !== 'string' || !q || !Number.isSafeInteger(q.used) || q.used < 0 || !((q.limit === null && q.remaining === null) || (Number.isSafeInteger(q.limit) && Number(q.limit) >= 0 && Number.isSafeInteger(q.remaining) && Number(q.remaining) >= 0))) throw new Error('Clip details could not be verified.')
  const url = new URL(c.video_url)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid clip playback address.')
  if (!['manual','kill','ace','multikill','clutch','hotkey'].includes(c.trigger) || !Number.isFinite(Number(c.duration_seconds)) || c.duration_seconds == null || !Number.isFinite(Date.parse(c.created_at))) throw new Error('Clip metadata is incomplete.')
  const a = c.clip_analysis
  if (a && !['queued','processing','completed','failed'].includes(a.status)) throw new Error('Clip coaching status is invalid.')
  const text = (v: unknown) => typeof v === 'string' ? v : null
  return { quota: q, clip: {
    id: `cloud:${c.id}`, apiClipId: c.id, path: url.href, thumbPath: null,
    trigger: c.trigger, map: text(c.map), agent: text(c.agent), title: text(c.title),
    durationSeconds: Number(c.duration_seconds), round: Number.isInteger(c.round) ? c.round : null,
    savedAt: Date.parse(c.created_at), momentOffsetMs: null, killCount: null, analysisJobId: null,
    matchId: text(c.match_id), game: ['valorant','cs2','deadlock'].includes(c.game) ? c.game : null,
    gameMode: text(c.game_mode), weapon: null, abilitySlot: null, uploadStatus: 'uploaded',
    shareToken: text(c.share_token), analysisStatus: a ? a.status : 'none',
    verdict: text(a?.verdict), suggestion: text(a?.suggestion), coachingTags: Array.isArray(a?.coaching_tags) ? a.coaching_tags.filter((x: unknown) => typeof x === 'string') : [],
    overallScore: typeof a?.overall_score === 'number' ? a.overall_score : null,
    published: c.published === true, favorited: false,
  } }
}
