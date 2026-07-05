<script setup lang="ts">
import { squadTimeAgo } from '../../lib/squad-ui'

interface AnalysisItem {
  id: number
  map?: string | null
  agent?: string | null
  won?: boolean | null
  overall_score?: number | null
  kills?: number | null
  deaths?: number | null
  created_at: string
}

interface ClipItem {
  id: string
  trigger: string
  map?: string | null
  thumbPath?: string | null
  durationSeconds?: number | null
}

defineProps<{
  analyses: AnalysisItem[]
  clips: ClipItem[]
}>()

function clipTriggerLabel(trigger: string): string {
  const map: Record<string, string> = { ace: 'ACE', clutch: 'CLCH', multikill: '3K+', kill: 'KILL', hotkey: 'CLIP' }
  return map[trigger] ?? trigger.slice(0, 4).toUpperCase()
}

function clipTriggerClass(trigger: string): string {
  if (trigger === 'ace') return 'bg-yellow-500/20 text-yellow-300'
  if (trigger === 'clutch') return 'bg-purple-500/20 text-purple-300'
  if (trigger === 'multikill') return 'bg-orange-500/20 text-orange-300'
  return 'bg-white/10 text-gray-300'
}
</script>

<template>
  <div class="grid grid-cols-2 gap-3 flex-shrink-0">
    <div class="dash-panel overflow-hidden">
      <div class="px-3 py-2 border-b border-white/[0.08]">
        <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">My analyses</p>
      </div>
      <div v-if="analyses.length" class="divide-y divide-white/[0.05] max-h-[180px] overflow-y-auto scroll-col">
        <div v-for="a in analyses.slice(0, 5)" :key="a.id" class="px-3 py-2 flex items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="text-[11px] font-semibold text-white truncate">{{ a.map ?? 'Unknown' }}</p>
            <p class="text-[10px] text-gray-600 truncate">{{ a.agent ?? '—' }}</p>
          </div>
          <div class="text-right flex-shrink-0">
            <span
              v-if="a.overall_score != null"
              class="text-[9px] font-bold px-1.5 py-0.5 rounded"
              :class="a.overall_score >= 70 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-yellow-500/15 text-yellow-400'"
            >{{ a.overall_score }}</span>
            <p class="text-[10px] text-gray-600">{{ squadTimeAgo(a.created_at) }}</p>
          </div>
        </div>
      </div>
      <p v-else class="px-3 py-6 text-[11px] text-gray-600 text-center">No analyses yet.</p>
    </div>

    <div class="dash-panel overflow-hidden">
      <div class="px-3 py-2 border-b border-white/[0.08]">
        <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">My clips</p>
      </div>
      <div v-if="clips.length" class="flex gap-2 p-2 overflow-x-auto scroll-col">
        <div
          v-for="clip in clips.slice(0, 4)"
          :key="clip.id"
          class="flex-shrink-0 w-24 rounded-lg border border-white/[0.08] overflow-hidden bg-black/20"
        >
          <div class="relative h-14 bg-black/40">
            <img v-if="clip.thumbPath" :src="`file://${clip.thumbPath}`" alt="" class="w-full h-full object-cover opacity-80">
            <span
              class="absolute top-1 left-1 text-[8px] font-bold px-1 py-0.5 rounded uppercase"
              :class="clipTriggerClass(clip.trigger)"
            >{{ clipTriggerLabel(clip.trigger) }}</span>
          </div>
          <p class="px-1.5 py-1 text-[9px] text-gray-500 truncate">{{ clip.map ?? clip.trigger }}</p>
        </div>
      </div>
      <p v-else class="px-3 py-6 text-[11px] text-gray-600 text-center">No clips yet.</p>
    </div>
  </div>
</template>
