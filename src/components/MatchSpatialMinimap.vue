<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { getMapMinimap } from '../lib/valorant'
import type { MatchSpatialSummary, SpatialTimelineEvent } from '../lib/spatial-types'

const props = withDefaults(defineProps<{
  summary: MatchSpatialSummary | null | undefined
  mapName?: string | null
  /** Highlight one event index */
  activeIndex?: number | null
  showLegend?: boolean
  /** Export-friendly size */
  large?: boolean
}>(), {
  showLegend: true,
  large: false,
})

const emit = defineEmits<{
  select: [event: SpatialTimelineEvent, index: number]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const imgLoaded = ref(false)

const minimapUrl = computed(() => {
  const m = props.summary?.map ?? props.mapName
  return m ? getMapMinimap(m) : ''
})

const size = computed(() => (props.large ? 640 : 320))

function draw() {
  const canvas = canvasRef.value
  const url = minimapUrl.value
  const summary = props.summary
  if (!canvas || !url || !summary?.events?.length) return

  const s = size.value
  canvas.width = s
  canvas.height = s
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    imgLoaded.value = true
    ctx.clearRect(0, 0, s, s)
    ctx.drawImage(img, 0, 0, s, s)

    summary.events.forEach((ev, idx) => {
      const px = ev.norm.x * s
      const py = ev.norm.y * s
      const isDeath = ev.type === 'death'
      const active = props.activeIndex === idx
      const r = active ? 10 : isDeath ? 7 : 6

      ctx.beginPath()
      ctx.arc(px, py, r + 2, 0, Math.PI * 2)
      ctx.fillStyle = active ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)'
      ctx.fill()

      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fillStyle = isDeath ? '#ef4444' : '#22c55e'
      ctx.fill()
    })

    if (props.showLegend) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      ctx.fillRect(0, s - 28, s, 28)
      ctx.fillStyle = '#fff'
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillText('● Deaths   ● Kills', 10, s - 10)
    }
  }
  img.src = url
}

watch(() => [props.summary, props.activeIndex, props.large], draw, { deep: true })
onMounted(draw)

function onClick(e: MouseEvent) {
  const summary = props.summary
  const canvas = canvasRef.value
  if (!summary?.events?.length || !canvas) return
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const x = (e.clientX - rect.left) * scaleX
  const y = (e.clientY - rect.top) * scaleY
  const s = size.value

  let best = -1
  let bestD = 20
  summary.events.forEach((ev, i) => {
    const d = Math.hypot(ev.norm.x * s - x, ev.norm.y * s - y)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  if (best >= 0) emit('select', summary.events[best], best)
}

/** Returns PNG data URL for social export. */
function exportPng(): string | null {
  return canvasRef.value?.toDataURL('image/png') ?? null
}

defineExpose({ exportPng })
</script>

<template>
  <div class="relative w-full">
    <canvas
      ref="canvasRef"
      class="w-full rounded-xl border border-white/10 bg-black/40 cursor-pointer"
      :class="large ? 'max-w-[640px]' : 'max-w-[320px]'"
      :style="{ aspectRatio: '1 / 1' }"
      @click="onClick"
    />
    <div
      v-if="!summary?.events?.length"
      class="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 text-xs text-gray-500"
    >
      No spatial data for this match
    </div>
    <ul v-if="summary?.patterns?.length" class="mt-3 space-y-1.5 text-xs text-gray-400">
      <li v-for="(p, i) in summary.patterns.slice(0, 4)" :key="i" class="flex gap-2">
        <span class="text-red-400 shrink-0">▸</span>
        <span>{{ p }}</span>
      </li>
    </ul>
  </div>
</template>
