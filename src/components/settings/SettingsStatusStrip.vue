<script setup lang="ts">
export type StatusTone = 'ok' | 'warn' | 'bad' | 'neutral'

export type StatusItem = {
  id: string
  label: string
  detail: string
  tone: StatusTone
}

defineProps<{
  items: StatusItem[]
}>()

const toneDot: Record<StatusTone, string> = {
  ok: 'bg-green-500',
  warn: 'bg-amber-400',
  bad: 'bg-red-500',
  neutral: 'bg-gray-500',
}
</script>

<template>
  <div class="flex flex-wrap gap-x-4 gap-y-2 rounded-xl border border-white/[0.10] bg-black/20 px-3 py-2.5">
    <div v-for="item in items" :key="item.id" class="flex min-w-0 items-center gap-2">
      <span class="h-2 w-2 flex-shrink-0 rounded-full" :class="toneDot[item.tone]" />
      <div class="min-w-0">
        <p class="text-[11px] font-medium text-gray-300">{{ item.label }}</p>
        <p class="truncate text-[11px] text-gray-500">{{ item.detail }}</p>
      </div>
    </div>
  </div>
</template>
