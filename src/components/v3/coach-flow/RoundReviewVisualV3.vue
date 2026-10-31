<script setup lang="ts">
/**
 * A whole round, reviewed: how the round went (players alive over time, plant, your kill / death),
 * the frames the coach looked at, where everyone stood at the selected frame, then the story in a
 * few short lines and numbered fixes you can watch.
 */
import { computed, ref, watch } from 'vue'
import ClipFrameV3 from './ClipFrameV3.vue'
import MomentMapV3 from './MomentMapV3.vue'
import OutcomeLineV3 from './OutcomeLineV3.vue'
import RoundReplayMapV3 from './RoundReplayMapV3.vue'
import RoundTimelineV3 from './RoundTimelineV3.vue'
import { mmss, momentSnapshot, roundReplaySteps, roundTimeOf, roundTimeline, storyLines, type RoundMark } from './coach-visuals'

export interface RoundReviewShape {
  round_number: number
  why?: string | null
  story?: string | null
  fixes?: Array<{ title?: string; detail?: string; evidence_ms?: number[] }>
  stills?: Array<{ src: string; videoMs: number }>
  windows?: Array<{ key: string; start: number; end: number }>
}

const props = defineProps<{
  review: RoundReviewShape
  /** Match data (round summaries, every kill, position snapshots). */
  matchData: Record<string, unknown> | null
  /** Returns a playable URL for a clip key; without it, Watch asks the host to seek its own player. */
  loadClip?: ((key: string) => Promise<string | null>) | null
}>()
const emit = defineEmits<{ watch: [videoMs: number] }>()

const round = computed(() => props.review.round_number)
const timeline = computed(() => roundTimeline(props.matchData, round.value))
const stills = computed(() => props.review.stills ?? [])
const fixes = computed(() => (props.review.fixes ?? []).filter(f => f.title).slice(0, 3))
const lines = computed(() => storyLines(props.review.story, 3))

// The frame on screen: the first fix's moment, or the first still.
const firstEvidence = computed(() => fixes.value.find(f => f.evidence_ms?.length)?.evidence_ms?.[0] ?? null)
const selectedMs = ref<number | null>(null)
watch(() => props.review, () => {
  const s = stills.value
  const ev = firstEvidence.value
  const near = ev != null ? s.find(x => Math.abs(x.videoMs - ev) < 1500)?.videoMs : undefined
  selectedMs.value = near ?? s[0]?.videoMs ?? ev
}, { immediate: true })
const selected = computed(() => stills.value.find(s => s.videoMs === selectedMs.value) ?? null)
const snapshot = computed(() => (selectedMs.value != null ? momentSnapshot(props.matchData, round.value, selectedMs.value) : null))
// Any snapshot in this round gives the recording ↔ round-time pairing for labels.
const pairing = computed(() => snapshot.value ?? (firstEvidence.value != null ? momentSnapshot(props.matchData, round.value, firstEvidence.value) : null))
const at = (ms: number) => { const rt = roundTimeOf(pairing.value, ms); return rt == null ? '' : mmss(rt) }

const windowFor = (ms: number) => props.review.windows?.find(w => ms >= w.start && ms <= w.end) ?? null
const frame = ref<InstanceType<typeof ClipFrameV3> | null>(null)
const clipLoader = computed(() => {
  const w = selectedMs.value != null ? windowFor(selectedMs.value) : null
  return props.loadClip && w ? () => props.loadClip!(w.key) : null
})
const startAt = computed(() => {
  const w = selectedMs.value != null ? windowFor(selectedMs.value) : null
  return w && selectedMs.value != null ? (selectedMs.value - w.start) / 1000 : null
})
function watchAt(ms: number): void {
  const w = windowFor(ms)
  if (props.loadClip && w) {
    selectedMs.value = stills.value.reduce<number | null>((best, s) => (best == null || Math.abs(s.videoMs - ms) < Math.abs(best - ms) ? s.videoMs : best), null) ?? ms
    requestAnimationFrame(() => { void frame.value?.play((ms - w.start) / 1000) })
  } else emit('watch', ms)
}
function onMark(m: RoundMark): void { if (m.videoMs != null) watchAt(m.videoMs) }

const replay = computed(() => roundReplaySteps(props.matchData, round.value))
const clipVideoMs = ref<number | null>(null)
function onClipTime(sec: number): void {
  const w = selectedMs.value != null ? windowFor(selectedMs.value) : null
  if (w) clipVideoMs.value = w.start + sec * 1000
}
function onMapSeek(ms: number): void {
  const w = windowFor(ms)
  if (!w) return
  const near = stills.value.reduce<number | null>((best, s) => (best == null || Math.abs(s.videoMs - ms) < Math.abs(best - ms) ? s.videoMs : best), null)
  if (near != null && windowFor(near) === w) selectedMs.value = near
  if (!frame.value?.seek((ms - w.start) / 1000) && props.loadClip) requestAnimationFrame(() => { void frame.value?.play((ms - w.start) / 1000) })
}
</script>

<template>
  <article class="rv3">
    <header class="rv3-head">
      <h3 class="uf-d4 rv3-title">Round {{ review.round_number }}, watched in full</h3>
      <OutcomeLineV3 :match-data="matchData" :round="review.round_number" :show-round="false" />
    </header>

    <RoundTimelineV3 v-if="timeline" :timeline="timeline" @watch="onMark" />

    <div class="rv3-media">
      <div class="rv3-frames">
        <ClipFrameV3 ref="frame" :still="selected?.src ?? null" :load-clip="clipLoader" :start-at="startAt" @time="onClipTime" />
        <div v-if="stills.length > 1" class="rv3-strip" role="list" aria-label="Frames the coach looked at">
          <button v-for="s in stills" :key="s.videoMs" type="button" role="listitem" class="rv3-thumb" :class="{ 'is-on': s.videoMs === selectedMs }"
            :aria-label="`Frame at ${at(s.videoMs) || 'this moment'}`" :aria-pressed="s.videoMs === selectedMs" @click="selectedMs = s.videoMs">
            <img :src="s.src" alt="">
            <span class="uf-t4 uf-num">{{ at(s.videoMs) }}</span>
          </button>
        </div>
      </div>
      <RoundReplayMapV3 v-if="replay && replay.steps.length" :view="replay" :focus-video-ms="selectedMs" :video-ms="clipVideoMs" :size="320" @seek="onMapSeek" />
      <MomentMapV3 v-else-if="snapshot" :snapshot="snapshot" :size="320" />
    </div>

    <div class="rv3-read">
      <div v-if="lines.length" class="rv3-story">
        <span class="uf-label">What the coach saw</span>
        <p v-for="(l, i) in lines" :key="i" class="uf-t2">{{ l }}</p>
      </div>
      <div v-if="fixes.length" class="rv3-fixcol">
        <span class="uf-label">What to change</span>
        <ol class="rv3-fixes">
        <li v-for="(f, i) in fixes" :key="i" class="rv3-fix">
          <span class="uf-d4 rv3-n" aria-hidden="true">{{ i + 1 }}</span>
          <div class="rv3-fix-text">
            <p class="uf-t3">{{ f.title }}</p>
            <p v-if="f.detail" class="uf-t4 rv3-detail">{{ f.detail }}</p>
          </div>
          <button v-if="f.evidence_ms?.length" type="button" class="uf-link rv3-watch" @click="watchAt(f.evidence_ms[0])">
            <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M4 3v10l9-5z" fill="currentColor" /></svg>
            {{ at(f.evidence_ms[0]) }}
          </button>
        </li>
      </ol>
      </div>
    </div>
  </article>
</template>

<style scoped>
.rv3 { container-type: inline-size; display: flex; flex-direction: column; gap: 20px; }
.rv3-head { display: flex; flex-direction: column; gap: 8px; }
.rv3-title { margin: 0; color: var(--uf-bone); text-transform: uppercase; }
.rv3-media { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 28px; align-items: start; }
.rv3-frames { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.rv3-strip { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.rv3-thumb { position: relative; padding: 0; border: 0; border-bottom: 2px solid transparent; background: var(--uf-chrome); cursor: pointer; aspect-ratio: 16 / 9; overflow: hidden; }
.rv3-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0.6; transition: opacity 150ms; }
.rv3-thumb.is-on { border-bottom-color: var(--uf-bone); }
.rv3-thumb.is-on img, .rv3-thumb:hover img { opacity: 1; }
.rv3-thumb span { position: absolute; left: 6px; bottom: 4px; color: var(--uf-bone); text-shadow: 0 1px 2px #000; }
.rv3-thumb:focus-visible { outline: 1px solid var(--uf-bone); }
.rv3-read { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 40px; align-items: start; }
.rv3-story { display: flex; flex-direction: column; gap: 8px; max-width: 64ch; }
.rv3-story p { margin: 0; color: var(--uf-bone); }
.rv3-fixcol { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.rv3-fixes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.rv3-fix { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 12px; align-items: baseline; padding: 12px 0; border-top: 1px solid var(--uf-line); }
.rv3-fix:first-child { border-top: 0; padding-top: 4px; }
.rv3-fix-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.rv3-fix-text p { margin: 0; }
.rv3-detail { color: var(--uf-muted); }
.rv3-n { color: var(--uf-faint); }
.rv3-watch { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.uf-num { font-variant-numeric: tabular-nums; }
@container (max-width: 900px) { .rv3-read { grid-template-columns: minmax(0, 1fr); gap: 24px; } }
@container (max-width: 900px) { .rv3-media { grid-template-columns: minmax(0, 1fr); } }
</style>
