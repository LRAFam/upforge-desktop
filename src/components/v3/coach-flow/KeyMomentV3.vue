<script setup lang="ts">
/**
 * One key moment the coach watched: the frame it looked at (play the clip inline), where everyone
 * stood on the map at that kill, what happened in words, then 1–2 fixes you can watch.
 */
import { computed, ref } from 'vue'
import ClipFrameV3 from './ClipFrameV3.vue'
import MomentMapV3 from './MomentMapV3.vue'
import { mmss, roundTimeOf, storyLines, type MomentSnapshot } from './coach-visuals'

export interface KeyMoment {
  round_number: number
  why?: string
  story?: string
  fixes?: Array<{ title?: string; detail?: string; evidence_ms?: number[] }>
  still?: { src: string; videoMs: number } | null
  window?: { window_start_ms: number; window_end_ms: number } | null
}

const props = defineProps<{
  moment: KeyMoment
  snapshot: MomentSnapshot | null
  loadClip?: (() => Promise<string | null>) | null
}>()
const emit = defineEmits<{ watch: [videoMs: number] }>()

const frame = ref<InstanceType<typeof ClipFrameV3> | null>(null)
const OUTCOME = { kill: 'Kill', death: 'Death', trade: 'Trade', teammate: 'Teammate down' } as const
const tone = computed(() => (props.snapshot?.outcome === 'kill' || props.snapshot?.outcome === 'trade' ? 'win' : props.snapshot?.outcome === 'death' || props.snapshot?.outcome === 'teammate' ? 'loss' : 'none'))
const tag = computed(() => {
  const s = props.snapshot
  if (!s?.outcome) return null
  return [OUTCOME[s.outcome], s.callout].filter(Boolean).join(' · ')
})
const lines = computed(() => storyLines(props.moment.story, 3))
const fixes = computed(() => (props.moment.fixes ?? []).filter(f => f.title).slice(0, 2))
const startAt = computed(() => {
  const w = props.moment.window
  const at = props.moment.still?.videoMs
  return w && typeof at === 'number' ? (at - w.window_start_ms) / 1000 : null
})
/** "1:02" into the round when we can pair it, else the clip offset. */
function when(ms: number): string {
  const rt = roundTimeOf(props.snapshot, ms)
  if (rt != null) return mmss(rt)
  const w = props.moment.window
  return w ? mmss(ms - w.window_start_ms) : ''
}
function watch(ms: number): void {
  const w = props.moment.window
  if (props.loadClip && w && frame.value) void frame.value.play((ms - w.window_start_ms) / 1000)
  else emit('watch', ms)
}
</script>

<template>
  <article class="km3">
    <header class="km3-head">
      <span class="uf-label">Round {{ moment.round_number }}</span>
      <span v-if="snapshot?.caption" class="uf-t3">{{ snapshot.caption }}<template v-if="snapshot.weapon"> · {{ snapshot.weapon }}</template></span>
      <span v-if="snapshot?.roundMs != null" class="uf-t4 uf-num">{{ mmss(snapshot.roundMs) }} into the round</span>
    </header>

    <div class="km3-body">
      <ClipFrameV3 ref="frame" class="km3-frame" :still="moment.still?.src ?? null" :load-clip="loadClip ?? null" :start-at="startAt" :tag="tag" :tone="tone" />
      <div class="km3-side">
        <MomentMapV3 v-if="snapshot" :snapshot="snapshot" :size="196" />
        <div v-if="lines.length" class="km3-story">
          <p v-for="(l, i) in lines" :key="i" class="uf-t2">{{ l }}</p>
        </div>
        <p v-if="moment.why" class="uf-t4 km3-why">{{ moment.why }}</p>
      </div>
    </div>

    <ol v-if="fixes.length" class="km3-fixes">
      <li v-for="(f, i) in fixes" :key="i" class="km3-fix">
        <span class="uf-d4 km3-n" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
        <div class="km3-fix-text">
          <p class="uf-t3">{{ f.title }}</p>
          <p v-if="f.detail" class="uf-t4">{{ f.detail }}</p>
        </div>
        <button v-if="f.evidence_ms?.length" type="button" class="uf-link km3-watch" @click="watch(f.evidence_ms[0])">Watch {{ when(f.evidence_ms[0]) }}</button>
      </li>
    </ol>
  </article>
</template>

<style scoped>
.km3 { display: flex; flex-direction: column; gap: 12px; padding: 20px 0; border-top: 1px solid var(--uf-line); }
.km3-head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.km3-body { display: grid; grid-template-columns: minmax(0, 560px) minmax(260px, 1fr); gap: 24px; align-items: start; }
.km3-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.km3-why { margin: 0; }
.km3-story { display: flex; flex-direction: column; gap: 4px; max-width: 72ch; }
.km3-story p { margin: 0; color: var(--uf-bone); }
.km3-fixes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.km3-fix { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 12px; align-items: baseline; padding: 10px 0; border-top: 1px solid var(--uf-line); }
.km3-fix-text p { margin: 0; }
.km3-n { color: var(--uf-faint); }
.km3-watch { white-space: nowrap; }
.uf-num { font-variant-numeric: tabular-nums; }
@media (max-width: 1000px) { .km3-body { grid-template-columns: minmax(0, 1fr); } }
</style>
