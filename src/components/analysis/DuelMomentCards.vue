<script setup lang="ts">
import { ref } from 'vue'
import {
  confidenceTone,
  duelMomentWeightReasons,
  formatPeekSequence,
  type DuelMoment,
} from '../../lib/duel-moments'

defineProps<{
  moments: DuelMoment[]
  activeMomentId?: string | null
  compact?: boolean
}>()

const emit = defineEmits<{
  seek: [offsetMs: number, momentId: string]
}>()

const expandedWeights = ref<string | null>(null)

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function confidenceClass(conf: string | undefined): string {
  const tone = confidenceTone(conf)
  if (tone === 'high') return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
  if (tone === 'medium') return 'text-amber-200 bg-amber-500/15 border-amber-500/30'
  return 'text-gray-400 bg-white/[0.04] border-white/10'
}
</script>

<template>
  <div
    class="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden"
    :class="compact ? '' : 'shadow-[0_0_30px_rgba(249,115,22,0.06)]'"
  >
    <div class="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5" :class="compact ? 'py-2' : ''">
      <div>
        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400/90">Duel analysis</p>
        <p v-if="!compact" class="text-[11px] text-gray-500 mt-0.5">High-fps windows the coach studied — not the full match</p>
      </div>
      <span class="text-[10px] font-bold tabular-nums text-gray-500">{{ moments.length }} moments</span>
    </div>

    <div class="divide-y divide-white/[0.05] max-h-[420px] overflow-y-auto">
      <div
        v-for="moment in moments"
        :key="moment.moment_id"
        class="px-3 py-3 transition-colors"
        :class="activeMomentId === moment.moment_id ? 'bg-orange-500/[0.07]' : 'hover:bg-white/[0.02]'"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-xs font-bold text-white">R{{ moment.round }}</span>
              <span v-if="moment.callout" class="text-[10px] text-gray-400">{{ moment.callout }}</span>
              <span
                v-if="moment.isolated"
                class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-300"
              >
                Untraded
              </span>
              <span
                v-if="moment.confidence"
                class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border"
                :class="confidenceClass(moment.confidence)"
              >
                {{ moment.confidence }}
              </span>
            </div>
            <p class="text-[10px] text-gray-600 mt-0.5 tabular-nums">Death @ {{ formatMs(moment.video_offset_ms) }}</p>
          </div>
          <button
            type="button"
            class="shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20 transition-colors"
            @click="emit('seek', moment.video_offset_ms, moment.moment_id)"
          >
            Watch
          </button>
        </div>

        <div v-if="moment.key_observation" class="mt-2 text-xs text-gray-300 leading-relaxed">
          {{ moment.key_observation }}
        </div>

        <div v-if="formatPeekSequence(moment.peek_sequence) || moment.crosshair_on_commit" class="mt-2 flex flex-wrap gap-1">
          <span
            v-if="formatPeekSequence(moment.peek_sequence)"
            class="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.04] text-gray-300"
          >
            Peek: {{ formatPeekSequence(moment.peek_sequence) }}
          </span>
          <span
            v-if="moment.crosshair_on_commit && moment.crosshair_on_commit !== 'unknown'"
            class="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.04] text-gray-300"
          >
            Crosshair: {{ moment.crosshair_on_commit.replace(/_/g, ' ') }}
          </span>
          <span
            v-if="moment.movement_on_commit && moment.movement_on_commit !== 'unknown'"
            class="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.04] text-gray-300"
          >
            Move: {{ moment.movement_on_commit.replace(/_/g, ' ') }}
          </span>
        </div>

        <button
          v-if="duelMomentWeightReasons(moment).length"
          type="button"
          class="mt-2 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          @click="expandedWeights = expandedWeights === moment.moment_id ? null : moment.moment_id"
        >
          {{ expandedWeights === moment.moment_id ? 'Hide' : 'Why this moment?' }}
        </button>
        <p v-if="expandedWeights === moment.moment_id" class="mt-1 text-[10px] text-gray-500">
          Selected because: {{ duelMomentWeightReasons(moment).join(' · ') }}
        </p>
      </div>
    </div>
  </div>
</template>
