<script setup lang="ts">
/**
 * Dev only: replay the after-match coach flow live on one of your real analysed matches.
 * Left: what the player sees, as it arrives. Right: every step with its time and cost.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import UfButton from '../../../components/v3/UfButton.vue'
import { applyFlowEvent, clock, emptyFlow, noteLines, seconds, usd, type FlowEvent, type FlowState } from '../../../lib/coach-flow-demo'

type Match = { id: number; map: string | null; agent: string | null; created_at: string | null; rounds_won: number | null; rounds_lost: number | null }

const api = window.api?.coachFlowDemo
const matches = ref<Match[]>([])
const picked = ref<number | null>(null)
const flow = ref<FlowState>(emptyFlow())
const running = ref(false)
const startedAt = ref<number | null>(null)
const tick = ref(0)
const info = ref<{ aiUrl: string; budgetUsd: number } | null>(null)
const error = ref<string | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
let off: (() => void) | null = null

const elapsed = computed(() => {
  void tick.value
  return startedAt.value ? Date.now() - startedAt.value : 0
})
const notes = computed(() => noteLines(flow.value.notes))
const reviewing = computed(() => flow.value.steps.some(s => s.step === 'round-review' && s.state === 'running'))

function label(m: Match): string {
  const score = m.rounds_won != null && m.rounds_lost != null ? ` ${m.rounds_won}–${m.rounds_lost}` : ''
  const when = m.created_at ? new Date(m.created_at).toLocaleDateString() : ''
  return `${m.map ?? 'Unknown map'} · ${m.agent ?? 'Unknown agent'}${score} · ${when}`
}

async function replay(): Promise<void> {
  if (!api || !picked.value) return
  flow.value = emptyFlow()
  error.value = null
  running.value = true
  startedAt.value = Date.now()
  const r = await api.run(picked.value)
  if (!r.ok) { error.value = r.error ?? 'Could not start'; running.value = false }
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
  picked.value = matches.value[0]?.id ?? null
  off = api.onEvent((e: FlowEvent) => {
    flow.value = applyFlowEvent(flow.value, e)
    if (flow.value.idle) running.value = false
  })
  timer = setInterval(() => { tick.value++ }, 200)
})
onBeforeUnmount(() => { off?.(); if (timer) clearInterval(timer) })
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
        <UfButton variant="primary" :disabled="!picked || running" @click="replay">{{ running ? 'Replaying…' : 'Replay this match' }}</UfButton>
      </div>
      <p v-else class="uf-t2">Only available in dev builds.</p>
    </header>
    <p v-if="error" class="uf-t3 cfd-err">{{ error }}</p>

    <div class="cfd-cols">
      <!-- What the player sees -->
      <section class="cfd-player" aria-label="What the player sees">
        <span class="uf-label">What the player sees</span>

        <div v-if="flow.summary" class="cfd-card uf-reveal">
          <span class="uf-label">Post-game</span>
          <p class="uf-d3" style="margin: 0" :style="{ color: flow.summary.won === null ? 'var(--uf-bone)' : flow.summary.won ? 'var(--uf-win)' : 'var(--uf-loss)' }">
            {{ flow.summary.won === null ? 'Match' : flow.summary.won ? 'Victory' : 'Defeat' }}
            <span v-if="flow.summary.ally !== null">{{ flow.summary.ally }}–{{ flow.summary.enemy }}</span>
          </p>
          <p class="uf-t4">{{ flow.summary.map }} · {{ flow.summary.agent }}</p>
        </div>
        <div v-else-if="running" class="cfd-card"><span class="uf-skel uf-skel-text" style="width: 60%" /></div>

        <div v-if="notes.headline" class="cfd-card uf-reveal">
          <span class="uf-label">Match report ready</span>
          <p class="uf-t1" style="margin: 0; font-size: 22px">{{ notes.headline }}</p>
          <ul class="cfd-list">
            <li v-for="(l, i) in notes.lines" :key="i" class="uf-t2">{{ l }}</li>
          </ul>
          <p v-if="notes.next" class="uf-t3">Next game: {{ notes.next }}</p>
        </div>

        <div v-for="m in flow.moments" :key="m.step" class="cfd-card uf-reveal">
          <span class="uf-label">Key moment · round {{ m.round_number }}</span>
          <p class="uf-t4">{{ m.why }}</p>
          <p class="uf-t2" style="color: var(--uf-bone)">{{ m.story }}</p>
          <ul class="cfd-list">
            <li v-for="(f, i) in m.fixes" :key="i" class="uf-t3">
              {{ f.title }}<span v-if="f.detail" class="uf-t4"> — {{ f.detail }}</span>
              <span v-if="f.evidence_ms?.length" class="uf-t4"> · {{ clock(f.evidence_ms[0]) }}</span>
            </li>
          </ul>
        </div>

        <div v-if="flow.roundOffer && !flow.roundReview" class="cfd-card cfd-offer uf-reveal">
          <span class="uf-label">Worth a full review</span>
          <p class="uf-t3" style="margin: 0">{{ flow.roundOffer.why }}</p>
          <UfButton variant="secondary" :disabled="reviewing" @click="reviewRound">{{ reviewing ? 'AI is watching the round…' : `Review round ${flow.roundOffer.round_number}` }}</UfButton>
        </div>

        <div v-if="flow.roundReview" class="cfd-card uf-reveal">
          <span class="uf-label">Round {{ flow.roundReview.round_number }} reviewed</span>
          <template v-if="flow.roundReview.success">
            <p class="uf-t2" style="color: var(--uf-bone)">{{ flow.roundReview.story }}</p>
            <ol class="cfd-list">
              <li v-for="(f, i) in flow.roundReview.fixes" :key="i" class="uf-t3">
                {{ f.title }}<span v-if="f.detail" class="uf-t4"> — {{ f.detail }}</span>
                <span v-if="f.evidence_ms?.length" class="uf-t4"> · {{ clock(f.evidence_ms[0]) }}</span>
              </li>
            </ol>
          </template>
          <p v-else class="uf-t3">{{ flow.roundReview.error }}</p>
        </div>
      </section>

      <!-- Timeline -->
      <aside class="cfd-timeline" aria-label="Timeline">
        <div class="cfd-tl-head">
          <span class="uf-label">Timeline since the match ended</span>
          <span class="uf-d4 uf-num">{{ seconds(running ? elapsed : flow.lastAt || elapsed) }}</span>
        </div>
        <ol class="cfd-steps">
          <li v-for="s in flow.steps" :key="s.step" class="cfd-step" :class="`is-${s.state}`">
            <span class="cfd-dot" aria-hidden="true" />
            <div class="cfd-step-text">
              <p class="uf-t3" style="margin: 0">{{ s.label }}</p>
              <p v-if="s.detail" class="uf-t4" style="margin: 0">{{ s.detail }}</p>
            </div>
            <div class="cfd-step-num uf-num">
              <span class="uf-t3">{{ s.state === 'running' ? 'running…' : seconds(s.at) }}</span>
              <span v-if="s.took" class="uf-t4">took {{ seconds(s.took) }}</span>
              <span v-if="s.costUsd" class="uf-t4">{{ usd(s.costUsd) }}</span>
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
.cfd { display: flex; flex-direction: column; gap: 20px; padding: 28px 32px; min-height: 100%; }
.cfd-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; flex-wrap: wrap; border-bottom: 1px solid var(--uf-line); padding-bottom: 18px; }
.cfd-title { display: flex; flex-direction: column; gap: 6px; }
.cfd-pick { display: flex; gap: 12px; align-items: center; }
.cfd-select { background: var(--uf-raised); color: var(--uf-bone); border: 1px solid var(--uf-line-2); padding: 9px 10px; font: 500 14px var(--uf-body); max-width: 380px; }
.cfd-err { color: var(--uf-loss); }
.cfd-cols { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(320px, 1fr); gap: 32px; align-items: start; }
.cfd-player { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.cfd-card { display: flex; flex-direction: column; gap: 8px; padding: 16px 0; border-top: 1px solid var(--uf-line); }
.cfd-offer { border-top-color: var(--uf-red); }
.cfd-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
.cfd-timeline { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 12px; border-left: 1px solid var(--uf-line); padding-left: 24px; }
.cfd-tl-head, .cfd-tl-foot { display: flex; justify-content: space-between; align-items: baseline; }
.cfd-tl-foot { border-top: 1px solid var(--uf-line); padding-top: 12px; }
.cfd-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.cfd-step { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--uf-line); align-items: start; }
.cfd-dot { width: 8px; height: 8px; margin-top: 6px; background: var(--uf-faint); }
.is-running .cfd-dot { background: var(--uf-gold); animation: uf-skel-pulse 1s ease-in-out infinite; }
.is-done .cfd-dot { background: var(--uf-win); }
.is-failed .cfd-dot { background: var(--uf-loss); }
.is-skipped .cfd-dot { background: var(--uf-faint); }
.cfd-step-num { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; text-align: right; }
.uf-num { font-variant-numeric: tabular-nums; }
</style>
