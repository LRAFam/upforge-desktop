<script setup lang="ts">
/**
 * Match report (v3): the free, data-only coaching page for one match. No video, no credit.
 * Headline (result, score, what decided it) · facts · focus check · coach notes · next steps.
 * Valorant reads the stored report (match-report:get). League and Deadlock read facts the API
 * computes from cached match data (match-report:get-game); CS2 reads the recording's parsed demo.
 * Never generates an AI report.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UfHeroBand from '../../components/v3/UfHeroBand.vue'
import UfButton from '../../components/v3/UfButton.vue'
import { practiceRouteFromReport } from '../../components/v3/practice/practice-v3'
import { focusMetricScenario } from '../../components/v3/practice/focus-drills'
import UfSkeleton from '../../components/v3/UfSkeleton.vue'
import { formatMapLabel, getAgentImage, getMapImage } from '../../lib/valorant'
import { matchReportView, type MatchReportState } from '../../lib/match-report'
import {
  applyGameNotes, cs2NotesFacts, type GameNotesResult,
  cs2ReportView, deadlockReportView, lolReportView,
  type Cs2ReportTimeline, type DeadlockReportResponse, type LolReportResponse, type ReportGame,
} from '../../lib/match-report-games'
import { readCache, writeCache } from '../../lib/stale-cache'
import { createReportPoller, NOTES_PENDING, REPORT_RETRY } from '../../lib/report-poller'
import UfRoundsLine from '../../components/v3/UfRoundsLine.vue'
import ScoreWhyV3 from '../../components/v3/score/ScoreWhyV3.vue'
import { matchScore, scoreToneColor } from '../../lib/upforge-score'
import { PRIMARY_GAME_ARTWORK } from '../../lib/games'
import RoundStripV3 from '../../components/v3/coach-flow/RoundStripV3.vue'
import DeadlockItemBuildV3 from '../../components/v3/games/DeadlockItemBuildV3.vue'
import LolLoadoutStrip from '../../components/v3/games/LolLoadoutStrip.vue'
import NumbersV3 from '../../components/v3/coach-flow/NumbersV3.vue'
import { numbersView, roundCells } from '../../components/v3/coach-flow/coach-visuals'
import { momentsLine, notesLine, type CoachAllowances, type LiveMoment, type LiveUpdate } from '../../lib/coach-allowances'

const route = useRoute()
const router = useRouter()
const matchId = computed(() => String(route.params.matchId ?? ''))
const game = computed<ReportGame>(() => {
  const g = route.query.game
  return g === 'lol' || g === 'deadlock' || g === 'cs2' ? g : 'valorant'
})
const state = ref<MatchReportState | null>(null)
/** CS2 only: the recording exists but its demo isn't parsed yet. */
const needsDemo = ref(false)

type Loaded = { ok: true; state: MatchReportState } | { ok: false; error: string }

async function fetchReport(g: ReportGame, id: string): Promise<Loaded | null> {
  if (g === 'cs2') {
    const t = await window.api?.recordings?.getTimeline?.(id).catch(() => null) as Cs2ReportTimeline | null | undefined
    if (!t) return { ok: false, error: 'not_found' }
    const view = cs2ReportView({ ...t, id })
    if (view) void loadNotes('cs2', id, cs2NotesFacts({ ...t, id }))
    return view ? { ok: true, state: { kind: 'ready', view } } : { ok: false, error: 'needs_demo' }
  }
  if (g === 'lol' || g === 'deadlock') {
    const res = await window.api?.app?.getGameMatchReport?.(g, id).catch(() => null)
    if (!res) return null
    if (!res.ok) return res
    const report = res.report as (LolReportResponse | DeadlockReportResponse) & GameNotesResult
    const base = g === 'lol' ? lolReportView(report as LolReportResponse) : deadlockReportView(report as DeadlockReportResponse)
    // Stored notes come with the report; otherwise ask for them after the facts are on screen.
    const view = report.notes ? applyGameNotes(base, report) : base
    if (!report.notes) void loadNotes(g, id, undefined)
    return { ok: true, state: { kind: 'ready', view } }
  }
  const res = await window.api?.app?.getMatchReport?.(id).catch(() => null)
  if (!res) return null
  return res.ok ? { ok: true, state: { kind: 'ready', view: matchReportView(res.report) } } : res
}

/**
 * AI coach notes arrive after the facts (one call, stored by the API, shared daily cap). The API queues
 * them and answers notes_status "pending" at first, so the page asks again for ~2 minutes until they're in.
 */
const notesLoading = ref(false)
let notesAsk: (() => Promise<boolean>) | null = null
const notesPoller = createReportPoller(NOTES_PENDING, () => notesAsk?.() ?? Promise.resolve(true))
const notesWaiting = computed(() => notesLoading.value || notesPoller.active.value)
async function loadNotes(g: 'lol' | 'deadlock' | 'cs2', id: string, facts: unknown): Promise<void> {
  notesPoller.stop()
  if (g === 'cs2' && !facts) return
  /** Returns true when there's nothing left to wait for. */
  const ask = async (): Promise<boolean> => {
    const res = await window.api?.app?.getGameMatchNotes?.(g, id, facts).catch(() => null)
    if (!res?.ok || id !== matchId.value || g !== game.value || state.value?.kind !== 'ready') return true
    const pending = res.notes_status === 'pending' && !res.notes
    if (pending) return false
    const next = { kind: 'ready' as const, view: applyGameNotes(state.value.view, res as GameNotesResult) }
    state.value = next
    writeCache(`match-report:${g}:${id}`, next)
    return true
  }
  notesAsk = ask
  notesLoading.value = true
  const done = await ask()
  notesLoading.value = false
  if (!done && notesAsk === ask) notesPoller.start()
}

/**
 * `quiet` re-checks (the "no report yet" poll) keep the page as it is instead of flashing the skeleton.
 * Returns true when there is nothing left to wait for (report ready, or a state polling can't fix).
 */
async function load(quiet = false): Promise<boolean> {
  const id = matchId.value
  const g = game.value
  const key = `match-report:${g}:${id}`
  if (!quiet) {
    reportPoller.stop()
    notesPoller.stop()
    const cached = readCache<MatchReportState>(key)
    state.value = cached?.value ?? null
    needsDemo.value = false
  }
  const res = await fetchReport(g, id)
  if (id !== matchId.value || g !== game.value) return true
  if (!res) { if (!state.value) state.value = { kind: 'error' } }
  else if (res.ok) {
    state.value = res.state
    writeCache(key, res.state)
  } else if (!state.value || state.value.kind !== 'ready') {
    needsDemo.value = res.error === 'needs_demo'
    state.value = res.error === 'not_found' || res.error === 'needs_demo' ? { kind: 'not_found' } : { kind: 'error' }
  }
  const waiting = canWaitForReport()
  if (!quiet && waiting) reportPoller.start()
  return !waiting
}
/** "No report yet" can fix itself (the API builds it, the demo gets parsed); a missing CS2 recording can't. */
function canWaitForReport(): boolean {
  return state.value?.kind === 'not_found' && !(game.value === 'cs2' && !needsDemo.value)
}
const reportPoller = createReportPoller(REPORT_RETRY, () => load(true))
const reportChecking = reportPoller.active
function retry(): void { void load() }
onMounted(() => { void load() })
watch([matchId, game], () => { void load() })

/**
 * Valorant: when the match's recording is on this PC, its timeline (round summaries, every kill,
 * position snapshots) drives the visuals: rounds line, round strip and numbers. Otherwise the
 * report keeps its plain facts list.
 */
const localTimeline = ref<Record<string, unknown> | null>(null)
async function loadLocalTimeline(): Promise<void> {
  localTimeline.value = null
  if (game.value !== 'valorant' || !matchId.value) return
  const id = matchId.value
  const rows = await window.api?.recordings?.listAll?.().catch(() => []) ?? []
  const rec = rows.find(r => r.matchId === id)
  if (!rec) return
  const t = await window.api?.recordings?.getTimeline?.(rec.id).catch(() => null)
  if (id === matchId.value && t) localTimeline.value = t as unknown as Record<string, unknown>
}
onMounted(loadLocalTimeline)
watch([matchId, game], loadLocalTimeline)
const cells = computed(() => roundCells(localTimeline.value))
const numbers = computed(() => (cells.value.length ? numbersView(localTimeline.value) : null))

const notFoundText = computed(() => {
  if (needsDemo.value) return 'This report is built from the match demo. Attach or wait for the demo on the match page, then come back.'
  switch (game.value) {
    case 'lol': return 'Reports are made from your Riot match data for Ranked Solo/Duo, Flex and Normal Draft games on your linked League accounts.'
    case 'deadlock': return 'Reports are made from the match data Deadlock publishes a few minutes after the match. Link your Steam account in Settings if you haven’t.'
    case 'cs2': return 'This recording couldn’t be found on this PC.'
    default: return 'Reports are made from your Riot match a minute or two after it ends.'
  }
})

const view = computed(() => (state.value?.kind === 'ready' ? state.value.view : null))
/** Stats-based UpForge score only: this report has no coach rating to fall back to. */
const ufScore = computed(() => {
  const s = matchScore({ upforge_score: view.value?.upforgeScore })
  return s?.kind === 'stats' ? s : null
})
const resultWord = computed(() => (view.value?.result === 'win' ? 'Victory' : view.value?.result === 'loss' ? 'Defeat' : 'Match'))
const meta = computed(() => view.value?.metaLine
  ?? [view.value?.map ? formatMapLabel(view.value.map) : null, view.value?.agent].filter(Boolean).join(' · '))
const isValorant = computed(() => (view.value?.game ?? 'valorant') === 'valorant')
/** The band's one image: Valorant map; Deadlock hero art (API `hero_art`), else the game's key art. */
const bandArt = computed(() => {
  const v = view.value
  if (!v) return undefined
  if (isValorant.value) return v.map ? getMapImage(v.map) || undefined : undefined
  if (game.value === 'deadlock') return v.bandArt || PRIMARY_GAME_ARTWORK.deadlock
  return undefined
})

// After-match coach flow: key-moment reviews (video, within the allowance) + allowance lines.
const allowances = ref<CoachAllowances | null>(null)
const moments = ref<LiveMoment[]>([])
const flowState = ref<LiveUpdate['state'] | null>(null)
const shownMoments = computed(() => moments.value.filter(m => m.status === 'completed' && m.fixes.length > 0))
const pendingMoments = computed(() => moments.value.filter(m => m.status === 'queued' || m.status === 'processing').length
  || (flowState.value && ['planning', 'cutting', 'uploading', 'reviewing'].includes(flowState.value) ? 1 : 0))
const allowanceLines = computed(() => [notesLine(allowances.value?.notes), momentsLine(allowances.value?.key_moments)].filter((x): x is string => !!x))
function fixTitle(f: LiveMoment['fixes'][number]): string { return typeof f === 'string' ? f : (f.title ?? '') }
function fixDetail(f: LiveMoment['fixes'][number]): string { return typeof f === 'string' ? '' : (f.detail ?? '') }
function momentLabel(m: LiveMoment): string {
  const kind = m.kind === 'death' ? 'Your death' : m.kind === 'kill' ? 'Your kill' : 'Your decision'
  return `Round ${m.round_number} · ${kind}`
}
async function loadCoachFlow(): Promise<void> {
  const id = matchId.value
  allowances.value = await window.api?.coachFlow?.allowances?.().catch(() => null) ?? null
  if (game.value !== 'valorant') return
  const res = await window.api?.coachFlow?.moments?.(id).catch(() => null)
  if (res && id === matchId.value) moments.value = res.moments
}
let stopUpdates: (() => void) | null = null
onMounted(() => {
  void loadCoachFlow()
  stopUpdates = window.api?.coachFlow?.onUpdate?.((u) => {
    if (u.matchId !== matchId.value) return
    flowState.value = u.state
    if (u.moments.length) moments.value = u.moments
    if (u.state === 'done') void loadCoachFlow()
  }) ?? null
})
onBeforeUnmount(() => { stopUpdates?.(); reportPoller.stop(); notesPoller.stop() })
watch(matchId, () => { moments.value = []; flowState.value = null; void loadCoachFlow() })

// Practice opens on this report's drill ("Do this next"), not a generic page.
function practise(): void {
  const v = view.value
  const metric = v?.nextSteps.find(s => s.drillMetric)?.drillMetric ?? null
  router.push(practiceRouteFromReport(v?.drill ?? null, focusMetricScenario(metric))).catch(() => {})
}
function back(): void { if (window.history.length > 1) router.back(); else router.push('/dashboard').catch(() => {}) }
</script>

<template>
  <div class="mr3">
    <!-- First load: skeleton in the page's shape -->
    <template v-if="!state">
      <UfSkeleton :h="220" />
      <div class="mr3-body"><UfSkeleton :w="520" :h="28" /><UfSkeleton :lines="3" :w="420" /></div>
    </template>

    <div v-else-if="state.kind !== 'ready'" class="mr3-empty uf-rise">
      <span class="uf-label">Match report</span>
      <h1 class="uf-d3">{{ needsDemo ? 'This report needs the demo' : state.kind === 'not_found' ? 'No report for this match yet' : 'Couldn’t load this report' }}</h1>
      <p class="uf-t2">{{ state.kind === 'not_found' ? notFoundText : 'Check your connection and try again.' }}</p>
      <p v-if="reportChecking" class="uf-t4" aria-live="polite">Checking again every 30 seconds.</p>
      <div class="mr3-actions">
        <UfButton variant="primary" @click="retry">Try again</UfButton>
        <UfButton variant="secondary" @click="back">Back</UfButton>
      </div>
    </div>

    <template v-else-if="view">
      <UfHeroBand
        :art="bandArt"
        :art-position="game === 'deadlock' && view.bandArt ? 'center 22%' : undefined"
        :agent="isValorant && view.agent ? getAgentImage(view.agent) || undefined : undefined"
        :tone="view.result ?? 'none'"
        :result="resultWord"
        :meta="meta"
        :height="220"
      >
        <span v-if="view.score" class="uf-d2">{{ view.score }}</span>
        <template v-if="cells.length" #stats>
          <div class="mr3-hero-rounds"><UfRoundsLine :rounds="cells.map(c => ({ won: c.result === 'won', marked: c.marked }))" :height="22" /></div>
        </template>
        <template v-else-if="game === 'lol' && view.loadout" #stats>
          <LolLoadoutStrip :match="view.loadout" :size="28" />
        </template>
      </UfHeroBand>

      <div class="mr3-body uf-reveal">
        <button type="button" class="uf-link mr3-back" @click="back">← Back</button>

        <section class="mr3-coach">
          <span class="uf-label">{{ view.headlineLabel ?? 'What decided it' }}</span>
          <p v-if="view.headline" class="uf-t1">{{ view.headline }}</p>
          <p v-if="view.recurrence" class="uf-t4 mr3-recur" :class="`mr3-recur--${view.recurrence.tone}`">{{ view.recurrence.text }}</p>
          <p v-else-if="view.notesCapped" class="uf-t2">Today’s free coach notes are used. The facts below are still yours, and notes come back tomorrow.</p>
          <p v-else class="uf-t2">No coach note for this match. The facts below come straight from your match data.</p>
          <p v-if="view.subline" class="uf-t2">{{ view.subline }}</p>
          <ul v-if="view.evidence?.length" class="mr3-evidence">
            <li v-for="(line, i) in view.evidence" :key="i" class="uf-t3">{{ line }}</li>
          </ul>
          <p v-else-if="notesWaiting && !isValorant" class="uf-t4">Your coach is reading this match…</p>
          <p v-if="view.isAlt" class="uf-t4">Played on an alt account: coached, not counted for your focus.</p>
        </section>

        <section v-if="isValorant && (shownMoments.length || pendingMoments)" class="mr3-moments" aria-live="polite">
          <span class="uf-label">Key moments your coach watched</span>
          <article v-for="m in shownMoments" :key="m.id" class="mr3-moment uf-reveal">
            <p class="uf-t4">{{ momentLabel(m) }}</p>
            <p v-if="m.story" class="uf-t2">{{ m.story }}</p>
            <ol class="mr3-fixes">
              <li v-for="(f, i) in m.fixes" :key="i"><span class="uf-t3">{{ fixTitle(f) }}</span><span v-if="fixDetail(f)" class="uf-t4"> {{ fixDetail(f) }}</span></li>
            </ol>
          </article>
          <div v-if="pendingMoments" class="mr3-moment mr3-moment--pending">
            <UfSkeleton :lines="2" />
            <p class="uf-t4">Your coach is watching the key moments…</p>
          </div>
        </section>

        <DeadlockItemBuildV3 v-if="game === 'deadlock' && view.itemBuild !== undefined" :steps="view.itemBuild" />

        <section v-if="cells.length" class="mr3-visual">
          <span class="uf-label">Your match, round by round</span>
          <RoundStripV3 :cells="cells" />
          <NumbersV3 v-if="numbers" :numbers="numbers" />
        </section>

        <div class="mr3-cols">
          <section v-if="!cells.length" class="mr3-facts">
            <span class="uf-label">The match</span>
            <dl>
              <div v-for="row in view.facts" :key="row.label" class="mr3-row">
                <dt class="uf-t4">{{ row.label }}</dt><dd class="uf-t3 uf-num">{{ row.value }}</dd>
              </div>
            </dl>
            <p v-if="!view.facts.length" class="uf-t4">No match facts were recorded.</p>
          </section>

          <section class="mr3-side">
            <div v-if="ufScore" class="mr3-focus">
              <span class="uf-label">UpForge score</span>
              <p class="mr3-uf"><span class="uf-d3 uf-num" :style="{ color: scoreToneColor(ufScore.tone) }">{{ ufScore.text }}</span><span class="uf-t4">{{ ufScore.label }} · 500 is average for your rank</span></p>
              <ScoreWhyV3 v-if="view.upforgeScoreBreakdown" :score="ufScore.value" :breakdown="view.upforgeScoreBreakdown" />
            </div>
            <div v-if="view.focusCheck" class="mr3-focus">
              <span class="uf-label">Your focus</span>
              <p class="uf-t3">{{ view.focusCheck.label }}</p>
              <p class="uf-t4" :style="{ color: view.focusCheck.hit ? 'var(--uf-win)' : 'var(--uf-loss)' }">
                {{ view.focusCheck.hit ? 'On target this match' : 'Missed this match' }}
              </p>
            </div>
            <div v-if="view.positive" class="mr3-focus">
              <span class="uf-label">What went well</span>
              <p class="uf-t3">{{ view.positive }}</p>
            </div>
            <div v-if="view.nextSteps.length" class="mr3-next">
              <span class="uf-label">Next game</span>
              <ol>
                <li v-for="(step, i) in view.nextSteps" :key="i" class="uf-t3">{{ step.text }}</li>
              </ol>
              <p v-if="view.drill" class="uf-t3 mr3-drill">
                <span class="uf-t4">Drill</span> {{ view.drill.text }}<span v-if="view.drill.why" class="uf-t4"> · {{ view.drill.why }}</span>
              </p>
              <UfButton v-if="view.drill || view.nextSteps.some(s => s.drillMetric)" variant="secondary" icon="practice" @click="practise">Practise this</UfButton>
            </div>
            <div v-if="view.enemyRead" class="mr3-focus">
              <span class="uf-label">How they played</span>
              <p class="uf-t3">{{ view.enemyRead }}</p>
            </div>
            <div v-if="view.watchRounds?.length" class="mr3-next">
              <span class="uf-label">Rounds to rewatch</span>
              <ul class="mr3-watch">
                <li v-for="w in view.watchRounds" :key="w.round"><span class="uf-t3 uf-num">R{{ w.round }}</span><span class="uf-t4">{{ w.why }}</span></li>
              </ul>
            </div>
            <!-- Reserved: "Review a round" (paid, visual). Hidden until round-review pricing is decided. -->
          </section>
        </div>
        <p v-for="line in allowanceLines" :key="line" class="uf-t4 mr3-allowance">{{ line }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mr3 { display: flex; flex-direction: column; min-height: 100%; }
.mr3-body { display: flex; flex-direction: column; gap: 28px; padding: 24px 40px 48px; }
.mr3-back { align-self: flex-start; }
.mr3-coach { display: flex; flex-direction: column; gap: 10px; max-width: 760px; }
.mr3-evidence { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
.mr3-cols { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 48px; }
.mr3-visual { display: flex; flex-direction: column; gap: 16px; }
.mr3-hero-rounds { width: min(520px, 100%); }
.mr3-facts dl { margin: 12px 0 0; }
.mr3-row { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-top: 1px solid var(--uf-line); }
.mr3-row dd { margin: 0; }
.mr3-side { display: flex; flex-direction: column; gap: 24px; }
.mr3-uf { margin: 0; display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.mr3-moments { display: flex; flex-direction: column; gap: 14px; padding-top: 18px; border-top: 1px solid var(--uf-line); }
.mr3-moment { display: flex; flex-direction: column; gap: 6px; max-width: 72ch; }
.mr3-moment + .mr3-moment { padding-top: 14px; border-top: 1px solid var(--uf-line); }
.mr3-fixes { margin: 4px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
.mr3-allowance { margin: 0; }
.mr3-focus, .mr3-next { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; border-top: 1px solid var(--uf-line); }
.mr3-next ol { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
.mr3-drill { margin: 0; }
.mr3-watch { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.mr3-watch li { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 8px; align-items: baseline; }
.mr3-next :deep(button) { align-self: flex-start; margin-top: 6px; }
.mr3-empty { display: flex; flex-direction: column; gap: 12px; padding: 64px 40px; max-width: 640px; }
.mr3-actions { display: flex; gap: 12px; margin-top: 8px; }
@media (max-width: 900px) { .mr3-cols { grid-template-columns: minmax(0, 1fr); } .mr3-body { padding: 20px; } }
.mr3-recur { margin: 0; color: var(--uf-muted); }
.mr3-recur--habit { color: var(--uf-gold); }
.mr3-recur--new { color: var(--uf-bone); }
</style>
