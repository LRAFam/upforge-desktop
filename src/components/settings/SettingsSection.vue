<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  id?: string
  title: string
  hint?: string
  highlightId?: string | null
}>()

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
    class="rounded-xl border border-white/[0.10] bg-white/[0.02] overflow-hidden transition-shadow duration-500"
    :class="highlighted ? 'ring-2 ring-[color:var(--game-accent,#ef4444)]/40' : ''"
  >
    <div class="px-4 py-3 border-b border-white/[0.08]">
      <p class="text-sm font-semibold text-white">{{ title }}</p>
      <p v-if="hint" class="mt-0.5 text-xs text-gray-500">{{ hint }}</p>
    </div>
    <div class="p-4 space-y-4">
      <slot />
    </div>
  </section>
</template>
