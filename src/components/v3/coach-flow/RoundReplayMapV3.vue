<script setup lang="ts">
/**
 * The round, step by step on the map: every kill, plant and defuse with all ten agents where Riot
 * placed them. You are ringed in bone, your team in a cool tone, enemies in red; the dead stay
 * where they fell, greyed with a cross. Kill steps draw killer → victim. Steps can be stepped,
 * played, or picked on the scrubber; picking one asks the host to seek the clip, and the host's
 * clip time moves the map along.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getAgentImage, getMapMinimap } from '../../../lib/valorant'
import { drawMinimapImage, toMinimapDisplayNorm } from '../../../lib/map-display-norm'
import { focusStepIndex, mmss, type RoundReplayView, type ReplayStep } from './coach-visuals'

const props = withDefaults(defineProps<{
  view: RoundReplayView
  /** Recording time to open on (the moment the coach looked at). */
  focusVideoMs?: number | null
  /** Live clip time (recording ms); moves the map to the latest step at or before it. */
  videoMs?: number | null
  size?: number
}>(), { focusVideoMs: null, videoMs: null, size: 300 })
const emit = defineEmits<{ seek: [videoMs: number] }>()

const idx = ref(focusStepIndex(props.view, props.focusVideoMs))
watch(() => [props.view, props.focusVideoMs] as const, () => { idx.value = focusStepIndex(props.view, props.focusVideoMs) })
const step = computed<ReplayStep | null>(() => props.view.steps[idx.value] ?? null)

// Clip time → step (only steps the clip can reach).
watch(() => props.videoMs, (ms) => {
  if (typeof ms !== 'number') return
  let best = -1
  props.view.steps.forEach((s, i) => { if (s.videoMs != null && s.videoMs <= ms + 150) best = i })
  if (best >= 0 && best !== idx.value) idx.value = best
})

function go(i: number, seek = true): void {
  idx.value = Math.max(0, Math.min(props.view.steps.length - 1, i))
  const s = props.view.steps[idx.value]
  if (seek && s?.videoMs != null) emit('seek', s.videoMs)
}
const playing = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
function stop(): void { playing.value = false; if (timer) { clearInterval(timer); timer = null } }
function togglePlay(): void {
  if (playing.value) return stop()
  if (idx.value >= props.view.steps.length - 1) idx.value = 0
  playing.value = true
  timer = setInterval(() => { if (idx.value >= props.view.steps.length - 1) stop(); else idx.value += 1 }, 1400)
}
onBeforeUnmount(stop)

// ── Map image ────────────────────────────────────────────────────────────────────────────────────
const canvas = ref<HTMLCanvasElement | null>(null)
const ready = ref(false)
function draw(): void {
  const c = canvas.value
  const url = getMapMinimap(props.view.map)
  if (!c || !url) return
  const px = props.size * 2
  c.width = px; c.height = px
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, px, px)
    ctx.globalAlpha = 0.5
    drawMinimapImage(ctx, img, px, props.view.map)
    ready.value = true
  }
  img.src = url
}
onMounted(draw)
watch(() => [props.view.map, props.size], draw)

// ── Overlay ──────────────────────────────────────────────────────────────────────────────────────
const P = (x: number, y: number) => { const p = toMinimapDisplayNorm(props.view.map, { x, y }); return { x: p.x * 100, y: p.y * 100 } }
const player = (i: number) => props.view.players[i]
const dots = computed(() => {
  const s = step.value
  if (!s) return []
  return s.dots
    .map(d => ({ ...d, ...P(d.x, d.y), who: player(d.i)?.who ?? 'enemy', agent: player(d.i)?.agent ?? null, role: d.i === s.killer ? 'killer' : d.i === s.victim ? 'victim' : null }))
    // dead underneath, you on top
    .sort((a, b) => Number(a.alive) - Number(b.alive) || (a.who === 'you' ? 1 : 0) - (b.who === 'you' ? 1 : 0))
})
const line = computed(() => {
  const s = step.value
  if (!s || s.kind !== 'kill') return null
  const a = dots.value.find(d => d.role === 'killer'); const b = dots.value.find(d => d.role === 'victim')
  return a && b ? { a, b } : null
})
const lineTone = computed(() => (step.value?.outcome === 'kill' || step.value?.outcome === 'trade' ? 'var(--uf-win)' : step.value?.outcome ? 'var(--uf-loss)' : 'var(--uf-muted)'))
const spike = computed(() => (step.value?.spike ? P(step.value.spike.x, step.value.spike.y) : null))
const victimDot = computed(() => dots.value.find(d => d.role === 'victim') ?? null)
const ring = (who: string) => (who === 'you' ? 'var(--uf-bone)' : who === 'ally' ? 'var(--cf-ally)' : 'var(--uf-loss)')
const uid = Math.random().toString(36).slice(2, 8)

// ── Scrubber ─────────────────────────────────────────────────────────────────────────────────────
const span = computed(() => {
  const t = props.view.steps.map(s => s.roundMs ?? 0)
  return Math.max(...t, 1) * 1.04
})
const tickTone = (s: ReplayStep) => (s.kind !== 'kill' ? 'is-spike' : s.outcome === 'kill' || s.outcome === 'trade' ? 'is-win' : s.outcome === 'death' ? 'is-death' : s.outcome === 'teammate' ? 'is-loss' : '')
</script>

<template>
  <figure class="rrm" :style="{ width: `${size}px` }">
    <div class="rrm-board" :style="{ width: `${size}px`, height: `${size}px` }">
      <canvas ref="canvas" class="rrm-img" :class="{ 'is-ready': ready }" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true" />
      <svg class="rrm-svg" viewBox="0 0 100 100" role="img" :aria-label="step ? `${mmss(step.roundMs)} ${step.caption}` : 'Round on the map'">
        <defs>
          <clipPath :id="`rrm-c-${uid}`" clipPathUnits="objectBoundingBox"><circle cx="0.5" cy="0.5" r="0.5" /></clipPath>
        </defs>
        <line v-if="line" :x1="line.a.x" :y1="line.a.y" :x2="line.b.x" :y2="line.b.y" :stroke="lineTone" stroke-width="0.9" stroke-dasharray="2 1.4" />
        <g v-if="spike" :transform="`translate(${spike.x} ${spike.y})`">
          <rect x="-2" y="-2" width="4" height="4" transform="rotate(45)" fill="var(--uf-gold)" stroke="var(--uf-chrome)" stroke-width="0.5" />
        </g>
        <g v-for="d in dots" :key="d.i" class="rrm-agent" :class="{ 'is-dead': !d.alive, 'is-you': d.who === 'you', 'is-role': d.role }" :style="{ transform: `translate(${d.x}px, ${d.y}px)` }">
          <circle r="4.6" fill="var(--uf-chrome)" />
          <image v-if="d.agent && getAgentImage(d.agent)" :href="getAgentImage(d.agent)" x="-4.2" y="-4.2" width="8.4" height="8.4" :clip-path="`url(#rrm-c-${uid})`" preserveAspectRatio="xMidYMid slice" />
          <circle r="4.6" fill="none" :stroke="ring(d.who)" :stroke-width="d.who === 'you' ? 1.1 : 0.7" />
          <path v-if="!d.alive" d="M-2.8 -2.8 L2.8 2.8 M2.8 -2.8 L-2.8 2.8" stroke="var(--uf-bone)" stroke-width="0.8" />
        </g>
        <text v-if="victimDot && step?.callout" :x="Math.min(68, Math.max(3, victimDot.x + 6))" :y="Math.max(6, victimDot.y - 6)" class="rrm-callout">{{ step.callout }}</text>
      </svg>
    </div>

    <figcaption class="rrm-cap">
      <div class="rrm-now">
        <span class="uf-d4 uf-num rrm-time">{{ mmss(step?.roundMs) || '0:00' }}</span>
        <span class="uf-t3">{{ step?.caption }}</span>
      </div>
      <span v-if="step && (step.callout || step.weapon)" class="uf-t4">{{ [step.callout, step.weapon].filter(Boolean).join(' · ') }}</span>
    </figcaption>

    <div class="rrm-controls">
      <div class="rrm-btns" role="group" aria-label="Round steps">
        <button type="button" class="rrm-btn" aria-label="Previous step" :disabled="idx <= 0" @click="stop(); go(idx - 1)">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
        </button>
        <button type="button" class="rrm-btn" :aria-label="playing ? 'Pause' : 'Play the round'" @click="togglePlay">
          <svg v-if="!playing" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 3v10l8-5z" fill="currentColor" /></svg>
          <svg v-else viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" /></svg>
        </button>
        <button type="button" class="rrm-btn" aria-label="Next step" :disabled="idx >= view.steps.length - 1" @click="stop(); go(idx + 1)">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
        </button>
        <span class="uf-t4 uf-num rrm-count">Step {{ idx + 1 }} of {{ view.steps.length }}</span>
      </div>
      <div class="rrm-track">
        <button v-for="(s, i) in view.steps" :key="i" type="button" class="rrm-tick" :class="[tickTone(s), { 'is-on': i === idx }]"
          :style="{ left: `${((s.roundMs ?? 0) / span) * 100}%` }"
          :aria-label="`${mmss(s.roundMs)} ${s.caption}`" :aria-pressed="i === idx" :title="`${mmss(s.roundMs)} · ${s.caption}`"
          @click="stop(); go(i)" />
      </div>
      <div class="rrm-ends uf-t4 uf-num"><span>0:00</span><span>{{ mmss(span) }}</span></div>
    </div>
  </figure>
</template>

<style scoped>
.rrm { --cf-ally: #7fb4c7; margin: 0; display: flex; flex-direction: column; gap: 12px; flex: none; max-width: 100%; }
.rrm-board { position: relative; background: var(--uf-chrome); max-width: 100%; }
.rrm-img { position: absolute; inset: 0; opacity: 0; transition: opacity 200ms ease-out; }
.rrm-img.is-ready { opacity: 1; }
.rrm-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.rrm-agent { transition: transform 600ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 300ms; }
.rrm-agent.is-dead { opacity: 0.38; }
.rrm-agent.is-dead image { filter: grayscale(1); }
.rrm-callout { fill: var(--uf-bone); font: 600 4.4px var(--uf-body); letter-spacing: 0.02em; paint-order: stroke; stroke: var(--uf-chrome); stroke-width: 1.1px; }
.rrm-cap { display: flex; flex-direction: column; gap: 2px; margin: 0; min-height: 48px; }
.rrm-now { display: flex; align-items: baseline; gap: 10px; }
.rrm-time { color: var(--uf-bone); }
.rrm-controls { display: flex; flex-direction: column; gap: 8px; }
.rrm-btns { display: flex; gap: 6px; align-items: center; }
.rrm-btn { width: 28px; height: 28px; display: grid; place-items: center; background: transparent; color: var(--uf-muted); border: 1px solid var(--uf-line-2); cursor: pointer; }
.rrm-btn:hover:not(:disabled) { color: var(--uf-bone); border-color: var(--uf-muted); }
.rrm-btn:disabled { opacity: 0.35; cursor: default; }
.rrm-btn:focus-visible, .rrm-tick:focus-visible { outline: 1px solid var(--uf-bone); outline-offset: 1px; }
.rrm-count { margin-left: auto; }
.rrm-track { position: relative; height: 22px; border-bottom: 1px solid var(--uf-line-2); }
.rrm-tick { position: absolute; bottom: -1px; width: 3px; height: 10px; margin-left: -1.5px; padding: 0; border: 0; background: var(--uf-faint); cursor: pointer; }
.rrm-tick::after { content: ''; position: absolute; inset: -8px -4px; }
.rrm-tick.is-win { background: var(--uf-win); }
.rrm-tick.is-loss { background: color-mix(in srgb, var(--uf-loss) 55%, transparent); }
.rrm-tick.is-death { background: var(--uf-loss); height: 16px; }
.rrm-tick.is-spike { background: var(--uf-gold); }
.rrm-tick.is-on { height: 22px; box-shadow: 0 0 0 1px var(--uf-bone); }
.rrm-ends { display: flex; justify-content: space-between; margin-top: -4px; }
.uf-num { font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .rrm-agent, .rrm-img { transition: none; } }
</style>
