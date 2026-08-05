<script setup lang="ts">
defineProps<{
  on: boolean
  disabled?: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    type="button"
    class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
    :class="on ? '' : 'bg-white/20'"
    :style="on ? { backgroundColor: 'var(--game-accent, #ef4444)' } : undefined"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <span
      class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
      :class="on ? 'translate-x-4' : 'translate-x-0.5'"
    />
  </button>
</template>
