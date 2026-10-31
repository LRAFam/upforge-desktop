<script setup lang="ts">
/**
 * One key moment the coach watched. Title (what happened) and a quiet outcome line, then the
 * frame it looked at beside the round on the map, step by step with every agent. Under them the
 * coach's read in a few short lines and the numbered fixes, each with a Watch control.
 * The clip and the map stay in sync: stepping the map seeks the clip, playing the clip moves the map.
 */
import { computed, ref } from 'vue'
import ClipFrameV3 from './ClipFrameV3.vue'
import MomentMapV3 from './MomentMapV3.vue'
import OutcomeLineV3 from './OutcomeLineV3.vue'
import RoundReplayMapV3 from './RoundReplayMapV3.vue'
import { mmss, roundReplaySteps, roundTimeOf, storyLines, type MomentSnapshot } from './coach-visuals'

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
  matchData?: Record<string, unknown> | null
  loadClip?: (() => Promise<string | null>) | null
}>()
const emit = defineEmits<{ watch: [videoMs: number] }>()

const frame = ref<InstanceType<typeof ClipFrameV3> | null>(null)
const title = computed(() => props.snapshot?.caption ?? `Round ${props.moment.round_number}`)
const lines = computed(() => storyLines(props.moment.story, 3))
const fixes = computed(() => (props.moment.fixes ?? []).filter(f => f.title).slice(0, 2))
const replay = computed(() => (props.matchData ? roundReplaySteps(props.matchData, props.moment.round_number) : null))
const focusMs = computed(() => props.moment.still?.videoMs ?? props.snapshot?.videoMs ?? null)

const w = computed(() => props.moment.window)
const startAt = computed(() => (w.value && typeof focusMs.value === 'number' ? (focusMs.value - w.value.window_start_ms) / 1000 : null))
const clipVideoMs = ref<number | null>(null)
function onClipTime(sec: number): void { if (w.value) clipVideoMs.value = w.value.window_start_ms + sec * 1000 }

/** "1:02" into the round when we can pair it, else the clip offset. */
function when(ms: number): string {
  const rt = roundTimeOf(props.snapshot, ms)
  if (rt != null) return mmss(rt)
  return w.value ? mmss(ms - w.value.window_start_ms) : ''
}
const inWindow = (ms: number) => !!w.value && ms >= w.value.window_start_ms && ms <= w.value.window_end_ms
function watchAt(ms: number): void {
  if (props.loadClip && w.value && frame.value) void frame.value.play((ms - w.value.window_start_ms) / 1000)
  else emit('watch', ms)
}
function onMapSeek(ms: number): void {
  if (!inWindow(ms) || !w.value) return
  if (!frame.value?.seek((ms - w.value.window_start_ms) / 1000) && props.loadClip) void frame.value?.play((ms - w.value.window_start_ms) / 1000)
}
</script>

<template>
  <article class="km3">
    <header class="km3-head">
      <h3 class="uf-d4 km3-title">{{ title }}<span v-if="snapshot?.weapon" class="km3-weapon"> · {{ snapshot.weapon }}</span></h3>
      <OutcomeLineV3 :match-data="matchData ?? null" :round="moment.round_number" :round-ms="snapshot?.roundMs ?? null" />
    </header>

    <div class="km3-media">
      <ClipFrameV3 ref="frame" class="km3-frame" :still="moment.still?.src ?? null" :load-clip="loadClip ?? null" :start-at="startAt" @time="onClipTime" />
      <RoundReplayMapV3 v-if="replay && replay.steps.length" class="km3-map" :view="replay" :focus-video-ms="focusMs" :video-ms="clipVideoMs" :size="320" @seek="onMapSeek" />
      <MomentMapV3 v-else-if="snapshot" class="km3-map" :snapshot="snapshot" :size="320" />
    </div>

    <div class="km3-read">
      <div v-if="lines.length" class="km3-story">
        <span class="uf-label">What the coach saw</span>
        <p v-for="(l, i) in lines" :key="i" class="uf-t2">{{ l }}</p>
      </div>
      <div v-if="fixes.length" class="km3-fixcol">
        <span class="uf-label">What to change</span>
        <ol class="km3-fixes">
        <li v-for="(f, i) in fixes" :key="i" class="km3-fix">
          <span class="uf-d4 km3-n" aria-hidden="true">{{ i + 1 }}</span>
          <div class="km3-fix-text">
            <p class="uf-t3">{{ f.title }}</p>
            <p v-if="f.detail" class="uf-t4 km3-detail">{{ f.detail }}</p>
          </div>
          <button v-if="f.evidence_ms?.length" type="button" class="uf-link km3-watch" @click="watchAt(f.evidence_ms[0])">
            <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M4 3v10l9-5z" fill="currentColor" /></svg>
            {{ when(f.evidence_ms[0]) }}
          </button>
        </li>
      </ol>
      </div>
    </div>
  </article>
</template>

<style scoped>
.km3 { container-type: inline-size; display: flex; flex-direction: column; gap: 20px; padding: 32px 0 36px; border-top: 1px solid var(--uf-line); }
.km3-head { display: flex; flex-direction: column; gap: 8px; }
.km3-title { margin: 0; color: var(--uf-bone); text-transform: uppercase; }
.km3-weapon { color: var(--uf-faint); }
.km3-media { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 28px; align-items: start; }
.km3-read { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 40px; align-items: start; }
.km3-story { display: flex; flex-direction: column; gap: 8px; max-width: 64ch; }
.km3-story p { margin: 0; color: var(--uf-bone); }
.km3-fixcol { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.km3-fixes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.km3-fix { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 12px; align-items: baseline; padding: 12px 0; border-top: 1px solid var(--uf-line); }
.km3-fix:first-child { border-top: 0; padding-top: 4px; }
.km3-fix-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.km3-fix-text p { margin: 0; }
.km3-detail { color: var(--uf-muted); }
.km3-n { color: var(--uf-faint); }
.km3-watch { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-variant-numeric: tabular-nums; }
@container (max-width: 900px) { .km3-read { grid-template-columns: minmax(0, 1fr); gap: 24px; } }
@container (max-width: 900px) { .km3-media { grid-template-columns: minmax(0, 1fr); } }
</style>
