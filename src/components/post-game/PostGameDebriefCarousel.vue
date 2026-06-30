<script setup lang="ts">
import { computed } from 'vue'
import PanelCarousel, { type CarouselPanel } from '../PanelCarousel.vue'
import type { FocusHeroCopy } from '../../lib/skill-profile'
import type { MatchHighlight } from '../../lib/match-highlights'
import { highlightKindLabel } from '../../lib/match-highlights'

const props = defineProps<{
  focus: FocusHeroCopy | null
  overallScore?: number | null
  kills?: number | null
  deaths?: number | null
  assists?: number | null
  matchResult?: 'win' | 'loss' | null
  allyScore?: number | null
  enemyScore?: number | null
  topHighlight?: MatchHighlight | null
  debriefText?: string | null
  debriefLoading?: boolean
  debriefFailed?: boolean
  sessionClipCount?: number
  scoreGrade?: (score: number) => string
  scoreLabel?: (score: number) => string
}>()

const emit = defineEmits<{
  openClips: []
}>()

const panels = computed((): CarouselPanel[] => {
  const list: CarouselPanel[] = []

  if (props.focus?.headline) {
    list.push({ id: 'focus', label: 'Fix this first', accent: 'bg-red-500' })
  }
  if (props.overallScore != null) {
    list.push({ id: 'score', label: 'Your score', accent: 'bg-emerald-500' })
  }
  if (props.topHighlight) {
    list.push({ id: 'moment', label: 'Key moment', accent: 'bg-amber-500' })
  }
  if (props.debriefLoading || props.debriefText || props.debriefFailed) {
    list.push({ id: 'debrief', label: 'Instant debrief', accent: 'bg-violet-500' })
  }
  if ((props.sessionClipCount ?? 0) > 0) {
    list.push({ id: 'clips', label: 'Match clips', accent: 'bg-orange-500' })
  }

  return list
})

const debriefPreview = computed(() => {
  const text = props.debriefText?.trim()
  if (!text) return null
  const firstParagraph = text.split(/\n\n+/)[0] ?? text
  return firstParagraph.length > 220 ? `${firstParagraph.slice(0, 217)}…` : firstParagraph
})

function gradeFor(score: number): string {
  return props.scoreGrade?.(score) ?? ''
}

function labelFor(score: number): string {
  return props.scoreLabel?.(score) ?? ''
}
</script>

<template>
  <PanelCarousel
    v-if="panels.length"
    :panels="panels"
    :interval="5000"
    class="debrief-carousel"
  >
    <template #default="{ panel }">
      <!-- Focus -->
      <div v-if="panel?.id === 'focus' && focus" class="debrief-slide">
        <p class="text-sm font-bold text-white leading-snug">{{ focus.headline }}</p>
        <p v-if="focus.subline" class="text-[11px] text-gray-400 mt-1.5 leading-relaxed line-clamp-3">
          {{ focus.subline }}
        </p>
        <p
          v-if="focus.recurrence"
          class="mt-2 inline-flex text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-200"
        >
          {{ focus.recurrence }}
        </p>
      </div>

      <!-- Score -->
      <div v-else-if="panel?.id === 'score' && overallScore != null" class="debrief-slide">
        <div class="flex items-end gap-3">
          <div>
            <p class="text-3xl font-black tabular-nums text-white leading-none">{{ overallScore * 10 }}</p>
            <p class="text-[10px] text-gray-500 mt-0.5">/ 1000</p>
          </div>
          <div class="pb-0.5">
            <span class="text-lg font-black text-emerald-300">{{ gradeFor(overallScore) }}</span>
            <span class="text-[10px] text-gray-500 ml-1.5">{{ labelFor(overallScore) }}</span>
          </div>
        </div>
        <div
          v-if="kills != null || matchResult"
          class="mt-3 flex flex-wrap items-center gap-2"
        >
          <span
            v-if="matchResult"
            class="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
            :class="matchResult === 'win' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'"
          >{{ matchResult }}</span>
          <span
            v-if="allyScore != null && enemyScore != null && (allyScore > 0 || enemyScore > 0)"
            class="text-[11px] font-semibold text-gray-400 tabular-nums"
          >{{ allyScore }} – {{ enemyScore }}</span>
          <span v-if="kills != null" class="text-[11px] text-gray-500 tabular-nums">
            {{ kills }}/{{ deaths ?? '?' }}/{{ assists ?? '?' }} KDA
          </span>
        </div>
      </div>

      <!-- Key moment -->
      <div v-else-if="panel?.id === 'moment' && topHighlight" class="debrief-slide">
        <span
          class="inline-flex text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-white/10 text-gray-400 mb-1.5"
        >{{ highlightKindLabel(topHighlight.kind) }}</span>
        <p class="text-sm font-semibold text-white leading-snug">{{ topHighlight.title }}</p>
        <p class="text-[11px] text-gray-500 mt-1 leading-relaxed line-clamp-3">{{ topHighlight.reason }}</p>
      </div>

      <!-- Debrief -->
      <div v-else-if="panel?.id === 'debrief'" class="debrief-slide">
        <p v-if="debriefLoading && !debriefText" class="text-xs text-gray-500">Generating your debrief…</p>
        <p v-else-if="debriefPreview" class="text-xs text-gray-300 leading-relaxed">{{ debriefPreview }}</p>
        <p v-else-if="debriefFailed" class="text-xs text-gray-500 italic">Debrief unavailable for this match.</p>
        <p v-else class="text-xs text-gray-500">Your debrief will appear here shortly.</p>
      </div>

      <!-- Clips -->
      <div v-else-if="panel?.id === 'clips' && (sessionClipCount ?? 0) > 0" class="debrief-slide">
        <p class="text-sm font-bold text-white">
          {{ sessionClipCount }} clip{{ sessionClipCount === 1 ? '' : 's' }} from this match
        </p>
        <p class="text-[11px] text-gray-500 mt-1 leading-relaxed">
          Bookmarked highlights are saved locally — open Clips to review or upload.
        </p>
        <button
          type="button"
          class="mt-2.5 text-[10px] font-bold uppercase tracking-wider text-orange-300 hover:text-orange-200 transition-colors"
          @click="emit('openClips')"
        >
          View match clips →
        </button>
      </div>
    </template>
  </PanelCarousel>
  <div
    v-else
    class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-3 min-h-[108px] flex items-center"
  >
    <p class="text-xs text-gray-500 leading-relaxed">Open the full report for detailed coaching.</p>
  </div>
</template>

<style scoped>
.debrief-carousel :deep(.panel-carousel) {
  border-color: rgba(255, 255, 255, 0.08);
}

.debrief-carousel :deep(.panel-carousel__body) {
  min-height: 108px;
  max-height: 108px;
  display: flex;
  align-items: flex-start;
}

.debrief-slide {
  width: 100%;
}
</style>
