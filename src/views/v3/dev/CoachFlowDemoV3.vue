<script setup lang="ts">
/**
 * Dev only: replay the after-match coach flow live on one of your real analysed matches.
 * Left: what the player sees, as it arrives (hero → what decided it → moments → round → numbers →
 * next game). Right: every step with its time and cost. "Use cached run" replays a saved run
 * with its original timings for $0.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import UfButton from '../../../components/v3/UfButton.vue'
import UfHeroBand from '../../../components/v3/UfHeroBand.vue'
import UfRoundsLine from '../../../components/v3/UfRoundsLine.vue'
import UfSkeleton from '../../../components/v3/UfSkeleton.vue'
import KeyMomentV3 from '../../../components/v3/coach-flow/KeyMomentV3.vue'
import NumbersV3 from '../../../components/v3/coach-flow/NumbersV3.vue'
import RoundReviewVisualV3 from '../../../components/v3/coach-flow/RoundReviewVisualV3.vue'
import RoundStripV3 from '../../../components/v3/coach-flow/RoundStripV3.vue'
import { momentSnapshot, numbersView, roundCells } from '../../../components/v3/coach-flow/coach-visuals'
import { formatMapLabel, getAgentImage, getMapImage } from '../../../lib/valorant'
import { applyFlowEvent, emptyFlow, noteLines, plainFailure, seconds, usd, type FlowEvent, type FlowState } from '../../../lib/coach-flow-demo'

type Match = { id: number; map: string | null; agent: string | null; created_at: string | null; rounds_won: number | null; rounds_lost: number | null; cached?: boolean }

const api = window.api?.coachFlowDemo
const matches = ref<Match[]>([])
const picked = ref<number | null>(null)
const useCache = ref(true)
const flow = ref<FlowState>(emptyFlow())
const running = ref(false)
const ran = ref(false)
const startedAt = ref<number | null>(null)
const tick = ref(0)
const info = ref<{ aiUrl: string; budgetUsd: number } | null>(null)
const error = ref<string | null>(null)
const replayedFromCache = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
let off: (() => void) | null = null
const clipUrls = new Map<string, string>()

const elapsed = computed(() => { void tick.value; return startedAt.value ? Date.now() - startedAt.value : 0 })
const notes = computed(() => noteLines(flow.value.notes))
const pickedMatch = computed(() => matches.value.find(m => m.id === picked.value) ?? null)
/** Cached only when this match has a saved run; otherwise it runs live (the checkbox can't be ticked). */
const cachedChosen = computed(() => useCache.value && !!pickedMatch.value?.cached)
const reviewing = computed(() => flow.value.steps.some(s => s.step === 'round-review' && s.state === 'running'))
const stepState = (step: string) => flow.value.steps.find(s => s.step === step)?.state ?? null
const problems = computed(() => flow.value.steps.filter(s => s.state === 'failed' || (s.state === 'skipped' && s.step !== 'match-end')).map(plainFailure))

const md = computed(() => flow.value.matchData)
const reviewedRounds = computed(() => [
  ...flow.value.moments.map(m => m.round_number),
  ...(flow.value.plan?.moments ?? []).map(m => m.round_number),
  ...(flow.value.roundReview ? [flow.value.roundReview.round_number] : flow.value.plan?.round ? [flow.value.plan.round.round_number] : []),
])
const cells = computed(() => roundCells(md.value, reviewedRounds.value))
const numbers = computed(() => numbersView(md.value))
const pendingMoments = computed(() => Math.max(0, (flow.value.plan?.moments.length ?? 0) - flow.value.moments.length))
const snapshotFor = (round: number, videoMs: number | undefined) => (typeof videoMs === 'number' ? momentSnapshot(md.value, round, videoMs) : null)

const resultWord = computed(() => (flow.value.summary?.won == null ? 'Match' : flow.value.summary.won ? 'Victory' : 'Defeat'))
const tone = computed<'win' | 'loss' | 'none'>(() => (flow.value.summary?.won == null ? 'none' : flow.value.summary.won ? 'win' : 'loss'))
const metaLine = computed(() => [flow.value.summary?.map ? formatMapLabel(flow.value.summary.map) : null, flow.value.summary?.agent, 'Competitive'].filter(Boolean).join(' · '))

function label(m: Match): string {
  const score = m.rounds_won != null && m.rounds_lost != null ? ` ${m.rounds_won}–${m.rounds_lost}` : ''
  const when = m.created_at ? new Date(m.created_at).toLocaleDateString() : ''
  return `${m.map ?? 'Unknown map'} · ${m.agent ?? 'Unknown agent'}${score} · ${when}${m.cached ? ' · cached' : ''}`
}

async function loadClip(key: string): Promise<string | null> {
  const have = clipUrls.get(key)
  if (have) return have
  const bytes = await api?.clip(key)
  if (!bytes) return null
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'video/mp4' }))
  clipUrls.set(key, url)
  return url
}

async function replay(): Promise<void> {
  if (!api || !picked.value) return
  flow.value = emptyFlow()
  for (const u of clipUrls.values()) URL.revokeObjectURL(u)
  clipUrls.clear()
  error.value = null
  running.value = true
  ran.value = true
  startedAt.value = Date.now()
  const cached = cachedChosen.value
  replayedFromCache.value = cached
  const r = await api.run(picked.value, { cached })
  if (!r.ok) {
    error.value = cached
      ? 'No saved run for this match yet. Untick “Use cached run” to run it live (about $0.11).'
      : r.error ?? 'Could not start'
    running.value = false
    ran.value = false
  }
}

async function reviewRound(): Promise<void> {
  running.value = true
  const r = await api?.reviewRound()
  if (r && !r.ok) error.value = r.error ?? 'Could not start the round review'
}

onMounted(async () => {
  if (!api) return
  info.value = await api.info()
  matches.value = await api.list()
  picked.value = matches.value.find(m => m.cached)?.id ?? matches.value[0]?.id ?? null
  off = api.onEvent((e: FlowEvent) => {
    flow.value = applyFlowEvent(flow.value, e)
    if (flow.value.idle) {
      running.value = false
      if (!replayedFromCache.value) void api.list().then((l) => { matches.value = l })
    }
  })
  timer = setInterval(() => { tick.value++ }, 200)
})
onBeforeUnmount(() => {
  off?.()
  if (timer) clearInterval(timer)
  for (const u of clipUrls.values()) URL.revokeObjectURL(u)
})
</script>

<template>
  <div class="cfd">
    <header class="cfd-head">
      <div class="cfd-title">
        <span class="uf-label">Coach flow · live replay</span>
        <h1 class="uf-d2" style="margin: 0">Replay a real match</h1>
        <p class="uf-t4">Demo: local AI, production data read-only{{ info ? ` · cap $${info.budgetUsd.toFixed(2)} per run` : '' }}</p>
      </div>
      <div v-if="api" class="cfd-pick">
        <select v-model.number="picked" class="cfd-select" :disabled="running" aria-label="Match to replay">
          <option v-for="m in matches" :key="m.id" :value="m.id">{{ label(m) }}</option>
        </select>
        <label class="cfd-cache uf-t4" :class="{ 'is-off': !pickedMatch?.cached }">
          <input :checked="cachedChosen" type="checkbox" :disabled="running || !pickedMatch?.cached" @change="useCache = ($event.target as HTMLInputElement).checked">
          {{ pickedMatch?.cached ? 'Use cached run ($0)' : 'No saved run yet · runs live (about $0.11)' }}
        </label>
        <UfButton :variant="ran ? 'secondary' : 'primary'" :disabled="!picked || running" @click="replay">{{ running ? 'Replaying…' : ran ? 'Replay again' : 'Replay this match' }}</UfButton>
      </div>
      <p v-else class="uf-t2">Only available in dev builds.</p>
    </header>
    <p v-if="error" class="uf-t3 cfd-err">{{ error }}</p>

    <div class="cfd-cols">
      <!-- What the player sees -->
      <section class="cfd-player" aria-label="What the player sees">
        <div v-if="problems.length" class="cfd-problems uf-reveal" role="alert">
          <span class="uf-label">Something didn’t work</span>
          <p v-for="(p, i) in problems" :key="i" class="uf-t3">{{ p }}</p>
        </div>
        <p v-if="!ran" class="uf-t2 cfd-hint">Pick a match and press Replay. The left side fills in exactly as it would after a real match; the right side shows when each part was ready.</p>

        <!-- Hero -->
        <UfHeroBand v-if="flow.summary" class="uf-reveal"
          :art="flow.summary.map ? getMapImage(flow.summary.map) || undefined : undefined"
          :agent="flow.summary.agent ? getAgentImage(flow.summary.agent) || undefined : undefined"
          :tone="tone" :result="resultWord" :meta="metaLine" :height="236">
          <span v-if="flow.summary.ally !== null" class="uf-d2 uf-num">{{ flow.summary.ally }}–{{ flow.summary.enemy }}</span>
          <template #stats>
            <div v-if="cells.length" class="cfd-hero-rounds">
              <UfRoundsLine :rounds="cells.map(c => ({ won: c.result === 'won', marked: c.marked }))" :height="22" />
            </div>
          </template>
        </UfHeroBand>
        <UfSkeleton v-else-if="running" :h="236" />

        <!-- What decided it -->
        <section v-if="flow.summary || running" class="cfd-sec">
          <span class="uf-label">What decided it</span>
          <template v-if="notes.headline">
            <p class="uf-t1 cfd-headline uf-reveal">{{ notes.headline }}</p>
            <div v-if="notes.lines.length" class="cfd-evidence uf-reveal">
              <p v-for="(l, i) in notes.lines.slice(0, 3)" :key="i" class="uf-t2">{{ l }}</p>
            </div>
          </template>
          <template v-else-if="stepState('report') !== 'failed'">
            <UfSkeleton :w="560" :h="28" />
            <UfSkeleton :lines="2" :w="480" />
          </template>
        </section>

        <!-- Key moments -->
        <section v-if="flow.moments.length || pendingMoments" class="cfd-sec">
          <div class="cfd-sec-head">
            <span class="uf-label">Moments the coach watched</span>
            <span class="uf-t4">{{ flow.moments.length }} of {{ flow.moments.length + pendingMoments }}</span>
          </div>
          <KeyMomentV3 v-for="m in flow.moments" :key="m.step" class="uf-reveal" :moment="m"
            :snapshot="snapshotFor(m.round_number, m.still?.videoMs ?? m.fixes?.[0]?.evidence_ms?.[0])"
            :load-clip="m.clipKey ? () => loadClip(m.clipKey as string) : null" />
          <div v-for="n in pendingMoments" :key="`p${n}`" class="cfd-moment-skel">
            <UfSkeleton :w="240" :h="14" />
            <div class="cfd-moment-skel-media"><div class="cfd-ratio"><UfSkeleton w="100%" h="100%" /></div><UfSkeleton :w="208" :h="208" /></div>
            <UfSkeleton :lines="2" w="70%" />
            <p class="uf-t4 uf-live">The coach is watching this moment…</p>
          </div>
        </section>

        <!-- Round review -->
        <section v-if="flow.roundOffer || flow.roundReview" class="cfd-sec">
          <span class="uf-label">Whole round</span>
          <div v-if="flow.roundOffer && !flow.roundReview" class="cfd-offer uf-reveal">
            <div>
              <p class="uf-t3" style="margin: 0">Round {{ flow.roundOffer.round_number }} is worth a full review</p>
              <p class="uf-t4" style="margin: 0">{{ flow.roundOffer.why }}</p>
            </div>
            <UfButton variant="primary" icon="play" :disabled="reviewing" @click="reviewRound">{{ reviewing ? 'Watching the round…' : `Review round ${flow.roundOffer.round_number}` }}</UfButton>
          </div>
          <div v-if="reviewing" class="cfd-round-skel">
            <UfSkeleton w="100%" :h="92" />
            <div class="cfd-moment-skel-media"><div class="cfd-ratio"><UfSkeleton w="100%" h="100%" /></div><UfSkeleton :w="232" :h="232" /></div>
            <p class="uf-t4 uf-live">The coach is watching round {{ flow.roundOffer?.round_number }}…</p>
          </div>
          <template v-if="flow.roundReview">
            <RoundReviewVisualV3 v-if="flow.roundReview.success" class="uf-reveal" :review="flow.roundReview" :match-data="md" :load-clip="loadClip" />
            <p v-else class="uf-t3">{{ flow.roundReview.error }}</p>
          </template>
        </section>

        <!-- Your numbers -->
        <section v-if="cells.length || numbers" class="cfd-sec uf-reveal">
          <span class="uf-label">Your match, round by round</span>
          <RoundStripV3 v-if="cells.length" :cells="cells" />
          <NumbersV3 v-if="numbers" :numbers="numbers" />
        </section>

        <!-- Next game -->
        <section v-if="notes.next" class="cfd-sec cfd-next uf-reveal">
          <span class="uf-label">Next game</span>
          <p class="uf-t3">{{ notes.next }}</p>
        </section>
      </section>

      <!-- Timeline -->
      <aside class="cfd-timeline" aria-label="Timeline">
        <div class="cfd-tl-head">
          <span class="uf-label">Since the match ended</span>
          <span class="uf-d3 uf-num">{{ seconds(running ? elapsed : flow.lastAt || elapsed) }}</span>
        </div>
        <p v-if="replayedFromCache" class="uf-t4">Cached run: original timings and costs, $0 now.</p>
        <ol class="cfd-steps">
          <li v-for="s in flow.steps" :key="s.step" class="cfd-step" :class="`is-${s.state}`">
            <span class="cfd-dot" aria-hidden="true" />
            <div class="cfd-step-text">
              <p class="uf-t4 cfd-step-label">{{ s.label }}</p>
              <p v-if="s.detail" class="uf-t4 cfd-step-detail">{{ s.detail }}</p>
            </div>
            <div class="cfd-step-num uf-num">
              <span class="uf-t4">{{ s.state === 'running' ? '…' : s.state === 'done' ? seconds(s.at + (s.took ?? 0)) : s.state }}</span>
              <span v-if="s.costUsd" class="uf-t4 cfd-cost">{{ usd(s.costUsd) }}</span>
            </div>
          </li>
        </ol>
        <div class="cfd-tl-foot">
          <span class="uf-t4">AI cost this run</span>
          <span class="uf-t3 uf-num">{{ usd(flow.costUsd) || '$0' }}</span>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.cfd { display: flex; flex-direction: column; gap: 20px; padding: 28px 32px 56px; min-height: 100%; }
.cfd-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; flex-wrap: wrap; border-bottom: 1px solid var(--uf-line); padding-bottom: 18px; }
.cfd-title { display: flex; flex-direction: column; gap: 6px; }
.cfd-title p { margin: 0; }
.cfd-pick { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
.cfd-select { background: var(--uf-raised); color: var(--uf-bone); border: 1px solid var(--uf-line-2); padding: 9px 10px; font: 500 15px var(--uf-body); max-width: 380px; }
.cfd-cache { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
.cfd-cache.is-off { opacity: 0.5; cursor: default; }
.cfd-err { color: var(--uf-loss); }
.cfd-cols { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 40px; align-items: start; }
.cfd-player { display: flex; flex-direction: column; gap: 28px; min-width: 0; }
.cfd-hint { margin: 0; max-width: 60ch; }
.cfd-problems { display: flex; flex-direction: column; gap: 6px; padding: 14px 0 14px 16px; border-left: 2px solid var(--uf-loss); }
.cfd-problems p { margin: 0; }
.cfd-hero-rounds { width: min(520px, 100%); }
.cfd-sec { display: flex; flex-direction: column; gap: 12px; }
.cfd-sec-head { display: flex; justify-content: space-between; align-items: baseline; }
.cfd-headline { margin: 0; max-width: 34ch; }
.cfd-evidence { display: flex; flex-direction: column; gap: 4px; max-width: 72ch; }
.cfd-evidence p { margin: 0; }
.cfd-moment-skel, .cfd-round-skel { display: flex; flex-direction: column; gap: 12px; padding: 20px 0; border-top: 1px solid var(--uf-line); }
.cfd-moment-skel-media { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; }
.cfd-ratio { aspect-ratio: 16 / 9; }
.cfd-offer { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 16px 0; border-top: 1px solid var(--uf-line); border-bottom: 1px solid var(--uf-line); }
.cfd-next p { margin: 0; max-width: 64ch; }
.cfd-timeline { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 10px; padding-left: 24px; border-left: 1px solid var(--uf-line); }
.cfd-tl-head, .cfd-tl-foot { display: flex; justify-content: space-between; align-items: baseline; }
.cfd-tl-head span:first-child { align-self: center; }
.cfd-tl-foot { border-top: 1px solid var(--uf-line); padding-top: 10px; }
.cfd-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.cfd-step { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 10px; padding: 6px 0; align-items: start; }
.cfd-step p { margin: 0; }
.cfd-step-label { color: var(--uf-bone); }
.cfd-step-detail { color: var(--uf-faint); }
.cfd-dot { width: 6px; height: 6px; margin-top: 7px; background: var(--uf-faint); }
.is-running .cfd-dot { background: var(--uf-gold); animation: uf-skel-pulse 1s ease-in-out infinite; }
.is-done .cfd-dot { background: var(--uf-win); }
.is-failed .cfd-dot { background: var(--uf-loss); }
.cfd-step-num { display: flex; flex-direction: column; align-items: flex-end; text-align: right; }
.cfd-cost { color: var(--uf-faint); }
.uf-num { font-variant-numeric: tabular-nums; }
@media (max-width: 1100px) { .cfd-cols { grid-template-columns: minmax(0, 1fr); } .cfd-timeline { position: static; border-left: 0; padding-left: 0; } }
</style>
