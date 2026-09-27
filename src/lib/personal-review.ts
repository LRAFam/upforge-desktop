export interface PersonalReviewSource { kind: 'analysis' | 'recording'; id: string; game: string }
export interface PersonalNote { id: string; text: string; position: number; round: number | null; createdAt: string }
export interface PersonalFocusCheckIn { sourceKey: string; focus: string; outcome: 'improved' | 'practising' | 'not_tried'; reflection: string | null }
export interface PreviousFocus { sourceKey: string; focus: string; source: PersonalReviewSource }
export interface PersonalReview { previousFocus?: PreviousFocus | null; focusCheckIn?: PersonalFocusCheckIn | null; source: PersonalReviewSource; revision: number; focus: string; notes: PersonalNote[] }
export function validPersonalReview(value: unknown): value is PersonalReview {
  if (!value || typeof value !== 'object') return false
  const v = value as PersonalReview
  const validFocus = (f: { sourceKey: string; focus: string }) => !!f && /^[0-9a-f]{64}$/.test(f.sourceKey) && typeof f.focus === 'string' && f.focus.length > 0 && f.focus.length <= 200
  if (v.previousFocus != null && (!validFocus(v.previousFocus) || !v.previousFocus.source || !['analysis', 'recording'].includes(v.previousFocus.source.kind) || typeof v.previousFocus.source.id !== 'string' || v.previousFocus.source.game !== v.source?.game)) return false
  if (v.focusCheckIn != null && (!validFocus(v.focusCheckIn) || !['improved', 'practising', 'not_tried'].includes(v.focusCheckIn.outcome) || (v.focusCheckIn.reflection !== null && (typeof v.focusCheckIn.reflection !== 'string' || v.focusCheckIn.reflection.length > 1000)))) return false
  return !!v.source && ['analysis', 'recording'].includes(v.source.kind)
    && typeof v.source.id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v.source.id)
    && (v.source.kind !== 'analysis' || /^[1-9][0-9]*$/.test(v.source.id))
    && typeof v.source.game === 'string' && v.source.game.length > 0 && v.source.game.length <= 32
    && Number.isInteger(v.revision) && v.revision >= 0 && typeof v.focus === 'string' && v.focus.length <= 200
    && Array.isArray(v.notes) && v.notes.length <= 200 && v.notes.every(n => n && typeof n.id === 'string' && /^[0-9a-f-]{36}$/i.test(n.id)
      && typeof n.text === 'string' && n.text.length > 0 && n.text.length <= 2000 && Number.isFinite(n.position) && n.position >= 0 && n.position <= 86400
      && (n.round === null || (Number.isInteger(n.round) && n.round >= 0 && n.round <= 999)) && typeof n.createdAt === 'string' && Number.isFinite(Date.parse(n.createdAt)))
}
