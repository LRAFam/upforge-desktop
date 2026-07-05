<script setup lang="ts">
import { computed } from 'vue'
import { timelineEventIcon, type TimelineEventKind } from '../../lib/valorant-round-icons'

const props = withDefaults(defineProps<{
  type: TimelineEventKind
  size?: 'xs' | 'sm' | 'md'
  firstBlood?: boolean
  /** Weapon / ability image overrides kill & death badges when provided. */
  sourceImage?: string | null
}>(), {
  size: 'sm',
})

const boxClass = computed(() => {
  if (props.sourceImage) {
    return {
      xs: 'h-4 min-w-4 px-0.5 rounded',
      sm: 'h-5 min-w-5 px-0.5 rounded-md',
      md: 'h-6 min-w-6 px-0.5 rounded-lg',
    }[props.size]
  }
  return {
    xs: 'h-4 w-4 rounded',
    sm: 'h-5 w-5 rounded-md',
    md: 'h-6 w-6 rounded-lg',
  }[props.size]
})

const toneClass = computed(() => {
  switch (props.type) {
    case 'kill':
      return 'border-teal-500/30 bg-teal-500/10'
    case 'death':
      return 'border-red-500/30 bg-red-500/10'
    case 'plant':
      return 'border-orange-500/30 bg-orange-500/10'
    case 'defuse':
      return 'border-cyan-500/30 bg-cyan-500/10'
    case 'detonation':
      return 'border-amber-500/30 bg-amber-500/10'
    default:
      return 'border-white/10 bg-white/[0.04]'
  }
})

const iconSrc = computed(() => {
  if (props.sourceImage) return props.sourceImage
  return timelineEventIcon(props.type)
})

const alt = computed(() => {
  switch (props.type) {
    case 'kill': return 'Kill'
    case 'death': return 'Death'
    case 'plant': return 'Spike plant'
    case 'defuse': return 'Spike defuse'
    case 'detonation': return 'Spike detonation'
    default: return 'Team kill'
  }
})
</script>

<template>
  <div class="relative flex-shrink-0">
    <div
      class="flex items-center justify-center overflow-hidden border"
      :class="[boxClass, toneClass]"
    >
      <img
        :src="iconSrc"
        :alt="alt"
        class="h-full w-full object-contain p-px"
        draggable="false"
      >
    </div>
    <span
      v-if="firstBlood"
      class="absolute -top-1 -right-1 rounded px-0.5 text-[6px] font-black leading-none bg-yellow-500/90 text-black"
    >FB</span>
  </div>
</template>
