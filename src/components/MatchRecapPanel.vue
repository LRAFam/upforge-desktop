<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  buildMatchHighlights,
  highlightKindLabel,
  formatHighlightRound,
  type MatchHighlight,
  type HighlightClipSource,
} from '../lib/match-highlights'
import type { MatchSpatialSummary } from '../lib/spatial-types'

const props = defineProps<{
  priorityImprovements?: string[]
  topIssue?: string | null
  coachingTags?: string[]
  overallScore?: number | null
  spatialSummary?: MatchSpatialSummary | null
  sessionClips?: HighlightClipSource[]
  apiHighlights?: MatchHighlight[] | null
  recordingId?: string | null
}>()

const emit = defineEmits<{
  seek: [videoOffsetMs: number]
  openClip: [clipId: string]
}>()

const exporting = ref(false)
const exportError = ref<string | null>(null)
const exportDone = ref(false)

const recap = computed(() =>
  buildMatchHighlights({
    priorityImprovements: props.priorityImprovements,
    topIssue: props.topIssue,
    coachingTags: props.coachingTags,
    overallScore: props.overallScore,
    spatialSummary: props.spatialSummary,
    sessionClips: props.sessionClips,
    apiHighlights: props.apiHighlights,
  }),
)

const hasContent = computed(
  () =>
    recap.value.featured.length > 0
    || recap.value.bestPlays.length > 0
    || recap.value.mistakes.length > 0
    || recap.value.clutchMoments.length > 0,
)

function kindAccent(kind: MatchHighlight['kind']): string {
  if (kind === 'best_play' || kind === 'multikill' || kind === 'improved_moment') {
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
  }
  if (kind === 'clutch') return 'text-amber-300 bg-amber-500/10 border-amber-500/25'
  return 'text-red-300 bg-red-500/10 border-red-500/25'
}

function onSelect(h: MatchHighlight) {
  if (h.videoOffsetMs != null) {
    emit('seek', Math.max(0, h.videoOffsetMs - 4000))
    return
  }
  if (h.clipId) emit('openClip', h.clipId)
}

async function exportRecapVideo() {
  if (!props.recordingId || exporting.value) return
  exporting.value = true
  exportError.value = null
  exportDone.value = false
  try {
    const highlights = recap.value.featured.map((h) => ({
      id: h.id,
      clipId: h.clipId,
      videoOffsetMs: h.videoOffsetMs,
      rank: h.rank,
    }))
    const res = await window.api.recap.exportStitched({
      recordingId: props.recordingId,
      highlights,
      maxMoments: 5,
    })
    if (!res.ok) {
      exportError.value = res.error ?? 'Export failed'
      return
    }
    exportDone.value = true
    setTimeout(() => { exportDone.value = false }, 3000)
  } catch (err) {
    exportError.value = err instanceof Error ? err.message : 'Export failed'
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div v-if="hasContent" class="rounded-xl border border-white/[0.10] bg-white/[0.02] overflow-hidden">
    <div class="px-3.5 py-2.5 border-b border-white/[0.07] flex items-center justify-between gap-2">
      <span class="text-[10px] font-bold uppercase tracking-widest text-gray-500">Match recap</span>
      <div class="flex items-center gap-2">
        <button
          v-if="recordingId && recap.featured.length"
          type="button"
          class="text-[9px] font-semibold px-2 py-0.5 rounded-md border transition-colors disabled:opacity-50"
          :class="exportDone ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10' : 'border-white/[0.10] text-gray-400 hover:text-white hover:border-white/[0.18]'"
          :disabled="exporting"
          @click="exportRecapVideo"
        >{{ exporting ? 'Stitching…' : exportDone ? 'Saved!' : 'Export recap' }}</button>
        <span class="text-[9px] text-gray-600 tabular-nums">{{ recap.featured.length }} moments</span>
      </div>
    </div>

    <div class="p-2.5 space-y-2">
      <button
        v-for="item in recap.featured"
        :key="item.id"
        type="button"
        class="w-full text-left rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2.5 hover:bg-white/[0.04] hover:border-white/[0.12] transition-colors"
        :class="item.videoOffsetMs != null || item.clipId ? 'cursor-pointer' : 'cursor-default'"
        @click="onSelect(item)"
      >
        <div class="flex items-start gap-2">
          <span
            class="flex-shrink-0 mt-0.5 text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border"
            :class="kindAccent(item.kind)"
          >{{ highlightKindLabel(item.kind) }}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-xs font-semibold text-white truncate">{{ item.title }}</p>
              <span v-if="formatHighlightRound(item)" class="text-[9px] font-mono text-gray-600 flex-shrink-0">
                {{ formatHighlightRound(item) }}
              </span>
            </div>
            <p class="text-[10px] text-gray-500 leading-relaxed mt-0.5 line-clamp-2">{{ item.reason }}</p>
            <p v-if="item.benchmarkHint" class="text-[9px] text-amber-400/80 mt-1 leading-snug">{{ item.benchmarkHint }}</p>
          </div>
          <svg
            v-if="item.videoOffsetMs != null || item.clipId"
            class="w-3.5 h-3.5 text-gray-600 flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
      </button>
    </div>

    <div v-if="recap.clutchMoments.length || recap.bestPlays.length || recap.mistakes.length" class="px-3 pb-2.5 flex flex-wrap gap-1.5">
      <span
        v-if="recap.clutchMoments.length"
        class="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300/90 border border-amber-500/20"
      >{{ recap.clutchMoments.length }} clutch</span>
      <span
        v-if="recap.bestPlays.length"
        class="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300/90 border border-emerald-500/20"
      >{{ recap.bestPlays.length }} highlights</span>
      <span
        v-if="recap.mistakes.length"
        class="text-[9px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-300/90 border border-red-500/20"
      >{{ recap.mistakes.length }} to review</span>
    </div>
    <p v-if="exportError" class="px-3 pb-2.5 text-[10px] text-red-400">{{ exportError }}</p>
  </div>
</template>
