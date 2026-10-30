<script setup lang="ts">
import { uiV3 } from '../../lib/ui-v3'

defineProps<{
  label: string
  hint?: string
}>()
</script>

<template>
  <div v-if="uiV3" class="uf-set-row">
    <div class="uf-set-row-text">
      <p class="uf-t3">{{ label }}</p>
      <p v-if="hint" class="uf-t4">{{ hint }}</p>
      <slot name="below" />
    </div>
    <div class="uf-set-ctl">
      <slot />
    </div>
  </div>
  <div v-else class="flex items-start justify-between gap-4">
    <div class="min-w-0 flex-1">
      <p class="text-sm text-gray-200">{{ label }}</p>
      <p v-if="hint" class="mt-1 text-xs leading-relaxed text-gray-500">{{ hint }}</p>
      <slot name="below" />
    </div>
    <div class="flex flex-shrink-0 items-center self-center">
      <slot />
    </div>
  </div>
</template>
