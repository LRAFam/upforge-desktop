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
  <div class="flex flex-wrap gap-x-5 gap-y-2 border-b border-white/[0.07] pb-3">
    <div v-for="item in items" :key="item.id" class="flex min-w-0 max-w-full items-center gap-2">
      <span class="h-1.5 w-1.5 flex-shrink-0 rounded-full" :class="toneDot[item.tone]" />
      <p class="min-w-0 truncate text-[11px] text-gray-400">
        <span class="font-medium text-gray-300">{{ item.label }}</span>
        <span class="text-gray-600"> · </span>
        {{ item.detail }}
      </p>
    </div>
  </div>
</template>
