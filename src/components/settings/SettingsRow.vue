<script setup lang="ts">
defineProps<{
  label: string
  hint?: string
}>()
</script>

<template>
  <div class="flex items-start justify-between gap-4">
    <div class="min-w-0 flex-1">
      <p class="text-sm text-gray-200">{{ label }}</p>
      <p v-if="hint" class="mt-1 text-xs text-gray-500">{{ hint }}</p>
      <slot name="below" />
    </div>
    <div class="flex-shrink-0">
      <slot />
    </div>
  </div>
</template>
