<script setup lang="ts">
import { computed } from 'vue'
import { timelineEventIcon, type TimelineEventKind } from '../../lib/timeline-event-icons'

/** All event kinds the icon can render (Valorant/CS2 spike + LoL objectives). */
type VodIconKind =
  | TimelineEventKind
  | 'dragon'
  | 'baron'
  | 'herald'
  | 'tower'
  | 'inhibitor'
  | 'ace'
  | 'multikill'

const props = withDefaults(defineProps<{
  type: VodIconKind
  game?: string | null
  size?: 'xs' | 'sm' | 'md'
  firstBlood?: boolean
  /** Weapon / ability / champion image; overrides the badge glyph when provided. */
  sourceImage?: string | null
}>(), {
  size: 'sm',
})

const isLol = computed(() => props.game === 'lol')

/** Games that don't have bundled raster icons for these kinds render an SVG glyph. */
const usesGlyph = computed(() => {
  if (props.sourceImage) return false
  if (isLol.value) return true
  return OBJECTIVE_KINDS.has(props.type)
})

const OBJECTIVE_KINDS = new Set<VodIconKind>([
  'dragon', 'baron', 'herald', 'tower', 'inhibitor', 'ace', 'multikill',
])

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
    case 'ace':
    case 'multikill':
      return 'border-teal-500/30 bg-teal-500/10 text-teal-300'
    case 'death':
      return 'border-red-500/30 bg-red-500/10 text-red-300'
    case 'plant':
      return 'border-orange-500/30 bg-orange-500/10 text-orange-300'
    case 'defuse':
      return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
    case 'detonation':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
    case 'dragon':
      return 'border-orange-500/30 bg-orange-500/10 text-orange-300'
    case 'baron':
      return 'border-violet-500/30 bg-violet-500/10 text-violet-300'
    case 'herald':
      return 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
    case 'tower':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
    case 'inhibitor':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-300'
    default:
      return 'border-white/10 bg-white/[0.04] text-gray-300'
  }
})

/** SVG glyph path for glyph-mode kinds (LoL kills/deaths + objectives). */
const glyphPath = computed((): string => {
  switch (props.type) {
    case 'kill':
    case 'ace':
    case 'multikill':
      // Crossed swords.
      return 'M4 4l16 16M20 4L4 20'
    case 'death':
      // Simple X.
      return 'M6 6l12 12M18 6L6 18'
    case 'tower':
    case 'inhibitor':
      // Tower — a stepped structure.
      return 'M8 20V9l4-3 4 3v11M6 20h12'
    default:
      // Objective (dragon/baron/herald) — a diamond.
      return 'M12 3l7 9-7 9-7-9z'
  }
})

const iconSrc = computed(() => {
  if (props.sourceImage) return props.sourceImage
  if (usesGlyph.value) return null
  return timelineEventIcon(props.type as TimelineEventKind, props.game)
})

const alt = computed(() => {
  switch (props.type) {
    case 'kill': return 'Kill'
    case 'death': return 'Death'
    case 'plant': return 'Bomb plant'
    case 'defuse': return 'Bomb defuse'
    case 'detonation': return 'Bomb explosion'
    case 'dragon': return 'Dragon'
    case 'baron': return 'Baron'
    case 'herald': return 'Rift Herald'
    case 'tower': return 'Tower'
    case 'inhibitor': return 'Inhibitor'
    case 'ace': return 'Ace'
    case 'multikill': return 'Multikill'
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
        v-if="iconSrc"
        :src="iconSrc"
        :alt="alt"
        class="h-full w-full object-contain p-px"
        draggable="false"
      >
      <svg
        v-else
        class="h-full w-full p-0.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        :aria-label="alt"
      >
        <path :d="glyphPath" />
      </svg>
    </div>
    <span
      v-if="firstBlood"
      class="absolute -top-1 -right-1 rounded px-0.5 text-[6px] font-black leading-none bg-yellow-500/90 text-black"
    >FB</span>
  </div>
</template>
