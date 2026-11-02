/**
 * "Ask about this match" on the v3 match page. Reuses the comparison workspace coach exactly:
 * IPC `workspace-coach:history|ask|credits` → API `/analyses/{id}/chat/workspace`, the same
 * per-match / daily allowance, Coach Credits and plan lock. Here the question carries ONE moment
 * (this match, the current video time and the selected round) instead of two.
 */
import { ref, computed, type Ref } from 'vue'
import { coachAccessState, coachQuestionPayload, validCoachHistory, type CoachHistory, type CoachMoment, type CoachQuestion, type CoachAnswer } from '../../../../lib/workspace-coach'
import type { NotebookResult } from '../../../../lib/review-notebook'

export interface AskMatchContext { analysisId: number | null; position: number; round: number | null }

export interface AskMatchApi {
  history: (id: number) => Promise<NotebookResult<CoachHistory>>
  ask: (id: number, body: CoachQuestion) => Promise<NotebookResult<CoachAnswer>>
  credits: (pack: string) => Promise<NotebookResult<{ checkout_url: string }>>
  openUrl: (url: string) => Promise<unknown> | void
  newId: () => string
}

export const CREDIT_PACKS = [{ id: 'starter', label: '50 credits' }, { id: 'value', label: '150 credits' }, { id: 'power', label: '500 credits' }] as const

/** A valid analysis id from the review timeline, or null (the tab is hidden without one). */
export function askAnalysisId(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

/** The single moment sent with the question. Round is the 0-based index the API filters round facts by. */
export function matchMoment(ctx: AskMatchContext): CoachMoment | null {
  if (!ctx.analysisId) return null
  const position = Number.isFinite(ctx.position) && ctx.position >= 0 ? Math.min(ctx.position, 86400) : 0
  const round = ctx.round !== null && Number.isInteger(ctx.round) && ctx.round >= 0 && ctx.round <= 99 ? ctx.round : null
  return { analysis_id: ctx.analysisId, position, round }
}

export function stamp(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}

export function momentLabel(moment: Pick<CoachMoment, 'position' | 'round'>): string {
  return moment.round === null ? stamp(moment.position) : `Round ${moment.round + 1} · ${stamp(moment.position)}`
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Allowance line. Same numbers as the comparison coach: min(per-match, daily) included + Coach Credits. */
export function usageLine(history: CoachHistory | null): string {
  if (!history || history.locked) return ''
  if (history.usage.unlimited) return 'Admin access'
  const remaining = Math.min(history.usage.analysis_remaining, history.usage.daily_remaining)
  return `${plural(remaining, 'included question', 'included questions')} left · ${plural(history.usage.chat_credits, 'Coach Credit', 'Coach Credits')}`
}

/** Message shown once the included questions are used up (copy shared with the comparison coach). */
export function exhaustedMessage(history: CoachHistory | null): string {
  const scope = history?.usage.analysis_remaining === 0 ? 'You have used the included questions for this match.' : 'You have used today’s included questions.'
  return `${scope} Add Coach Credits to ask more. Your draft stays here.`
}

export const LOCKED_MESSAGE = 'Ask AI coach is included with Plus and Pro. Your saved answers remain available below.'

export function askButtonLabel(state: { sending: boolean; working: boolean; pending: boolean; access: ReturnType<typeof coachAccessState> }): string {
  if (state.sending || state.working) return 'Coach is working…'
  if (state.pending) return 'Retry this question'
  if (state.access === 'exhausted') return 'No questions available'
  if (state.access === 'credit') return 'Ask using 1 credit'
  return 'Ask'
}

/** Reactive controller for the panel. Pure Vue reactivity so it is unit-testable without a DOM. */
export function useAskMatch(api: AskMatchApi, context: () => AskMatchContext, opts: { pollMs?: number } = {}) {
  const pollMs = opts.pollMs ?? 3000
  const question = ref('')
  const history: Ref<CoachHistory | null> = ref(null)
  const loaded = ref(false)
  const error = ref('')
  const sending = ref(false)
  const checkoutBusy = ref(false)
  const checkoutNotice = ref('')
  const pending: Ref<CoachQuestion | null> = ref(null)
  let generation = 0
  let loadedFor: number | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  const analysisId = computed(() => context().analysisId)
  const working = computed(() => !!history.value?.items.some(item => item.status === 'queued' || item.status === 'running'))
  const access = computed(() => coachAccessState(history.value))
  const canSubmit = computed(() => !!pending.value || access.value === 'included' || access.value === 'credit')
  const canAsk = computed(() => !sending.value && !working.value && canSubmit.value && (!!pending.value || !!question.value.trim()))
  const buttonLabel = computed(() => askButtonLabel({ sending: sending.value, working: working.value, pending: !!pending.value, access: access.value }))

  async function refresh() {
    clearTimeout(timer)
    const id = analysisId.value, current = generation
    if (!id) return
    if (loadedFor !== id) { loadedFor = id; history.value = null; loaded.value = false; pending.value = null }
    error.value = ''
    try {
      const result = await api.history(id)
      if (current !== generation) return
      if (!result.ok) { error.value = result.error; return }
      if (!validCoachHistory(result.data)) { error.value = 'The coach returned an unsupported conversation.'; return }
      history.value = result.data
      if (pending.value && result.data.items.some(item => item.id === pending.value!.id)) { pending.value = null; question.value = '' }
      if (working.value) timer = setTimeout(() => { void refresh() }, pollMs)
    } catch { if (current === generation) error.value = 'Coach unavailable. Reopen the updated app and try again.' }
    finally { if (current === generation) loaded.value = true }
  }

  async function ask() {
    const id = analysisId.value
    if (!id || !canAsk.value) return
    const current = generation
    if (!pending.value) {
      const moment = matchMoment(context())
      const message = question.value.trim()
      if (!moment || !message) return
      pending.value = { id: api.newId(), message, moments: [moment] }
    }
    sending.value = true; error.value = ''
    try {
      const result = await api.ask(id, coachQuestionPayload(pending.value))
      if (current !== generation) return
      if (!result.ok) { error.value = result.error; return }
      await refresh()
    } catch { if (current === generation) error.value = 'Request status unknown. Retry checks the same question without charging twice.' }
    finally { if (current === generation) sending.value = false }
  }

  async function buyCredits(pack: string) {
    if (checkoutBusy.value) return
    checkoutBusy.value = true
    const current = generation
    try {
      const result = await api.credits(pack)
      if (current !== generation) return
      if (!result.ok) { error.value = result.error; return }
      const url = new URL(result.data.checkout_url)
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Unsupported checkout')
      await api.openUrl(url.toString())
      if (current === generation) checkoutNotice.value = 'Complete checkout in your browser, then return here. Your credit balance refreshes when you return. Use Refresh if payment is still processing.'
    } catch { if (current === generation) error.value = 'Could not open checkout. Check your credit balance before retrying.' }
    finally { if (current === generation) checkoutBusy.value = false }
  }

  function editAsNew() { pending.value = null }

  /** Account changed / panel unmounted: drop everything and ignore in-flight replies. */
  function clear() {
    generation++; clearTimeout(timer); loadedFor = null
    history.value = null; loaded.value = false; pending.value = null; question.value = ''
    error.value = ''; sending.value = false; checkoutBusy.value = false; checkoutNotice.value = ''
  }

  return { question, history, loaded, error, sending, checkoutBusy, checkoutNotice, pending, analysisId, working, access, canAsk, buttonLabel, refresh, ask, buyCredits, editAsNew, clear }
}

export interface AnswerPart { text: string; bold: boolean }
export interface AnswerBlock { kind: 'heading' | 'item' | 'para'; parts: AnswerPart[] }

/** Splits `**bold**` runs. Text only — rendered with interpolation, never as HTML. */
export function answerParts(line: string): AnswerPart[] {
  return line.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(s => (/^\*\*[^*]+\*\*$/.test(s) ? { text: s.slice(2, -2), bold: true } : { text: s, bold: false }))
}

/** The AI answers in light markdown (headings, lists, bold, rules). Turn it into plain blocks. */
export function answerBlocks(answer: string | null): AnswerBlock[] {
  const blocks: AnswerBlock[] = []
  for (const raw of (answer ?? '').split('\n')) {
    const line = raw.trim()
    if (!line || /^(-{3,}|\*{3,}|_{3,})$/.test(line)) continue
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    const item = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line)
    if (heading) blocks.push({ kind: 'heading', parts: answerParts(heading[1]!.replace(/\*\*/g, '')) })
    else if (item) blocks.push({ kind: 'item', parts: answerParts(/^\d/.test(line) ? `${line.match(/^\d+/)![0]}. ${item[1]}` : item[1]!) })
    else blocks.push({ kind: 'para', parts: answerParts(line) })
  }
  return blocks
}
