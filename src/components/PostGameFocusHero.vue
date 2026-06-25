<script setup lang="ts">
import type { FocusHeroCopy } from '../lib/skill-profile'

defineProps<{
  focus: FocusHeroCopy
  matchLabel?: string | null
}>()
</script>

<template>
  <div
    class="rounded-2xl border border-[#ff4655]/30 bg-gradient-to-br from-[#ff4655]/[0.12] via-[#141c2b] to-[#141c2b] px-4 py-4 shadow-[0_0_32px_rgba(255,70,85,0.08)]"
  >
    <div class="flex items-start justify-between gap-3 mb-2">
      <p class="text-[10px] font-black uppercase tracking-[0.24em] text-[#ff4655]">
        Fix this first
      </p>
      <span
        v-if="focus.recurrence"
        class="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-200 flex-shrink-0"
      >
        {{ focus.recurrence }}
      </span>
    </div>
    <p class="text-base sm:text-lg font-black text-white leading-snug">{{ focus.headline }}</p>
    <p v-if="focus.subline" class="text-[11px] text-gray-400 mt-2 leading-relaxed">{{ focus.subline }}</p>
    <p v-if="matchLabel" class="text-[10px] text-gray-600 mt-2">{{ matchLabel }}</p>
  </div>
</template>
