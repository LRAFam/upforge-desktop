<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  id?: string
  title: string
  hint?: string
  highlightId?: string | null
  /** Row list: flush padding + dividers between children */
  divided?: boolean
}>(), {
  divided: false,
})

const root = ref<HTMLElement | null>(null)
const highlighted = computed(() => !!props.id && props.highlightId === props.id)

onMounted(() => {
  if (highlighted.value) scrollIntoView()
})

watch(
  () => props.highlightId,
  (id) => {
    if (props.id && id === props.id) scrollIntoView()
  },
)

function scrollIntoView() {
  requestAnimationFrame(() => {
    root.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}
</script>

<template>
  <section
    :id="id ? `settings-section-${id}` : undefined"
    ref="root"
    class="settings-section overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.015]"
    :class="highlighted ? 'settings-section--highlight' : ''"
  >
    <div class="border-b border-white/[0.07] px-4 py-2.5">
      <p class="text-sm font-semibold text-white">{{ title }}</p>
      <p v-if="hint" class="mt-0.5 text-xs text-gray-500">{{ hint }}</p>
    </div>
    <div
      :class="divided
        ? 'divide-y divide-white/[0.06] [&>*]:px-4 [&>*]:py-3'
        : 'space-y-4 p-4'"
    >
      <slot />
    </div>
  </section>
</template>

<style scoped>
.settings-section--highlight {
  animation: settings-section-pulse 1s ease-out;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--game-accent, #ef4444) 45%, transparent);
}

@keyframes settings-section-pulse {
  0% {
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--game-accent, #ef4444) 70%, transparent);
    background-color: color-mix(in srgb, var(--game-accent, #ef4444) 8%, transparent);
  }
  100% {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--game-accent, #ef4444) 45%, transparent);
    background-color: transparent;
  }
}
</style>
