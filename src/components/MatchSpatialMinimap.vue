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
  /** Death density overlay (overlapping blobs = hotter zones) */
  showHeatmap?: boolean
  /** Export-friendly size */
  large?: boolean
}>(), {
  showLegend: true,
  showHeatmap: true,
  large: false,
})

const deathEvents = computed(() =>
  (props.summary?.events ?? []).filter((e) => e.type === 'death'),
)

const useHeatmap = computed(() =>
  props.showHeatmap && deathEvents.value.length >= 2,
)

const activeEvent = computed(() => {
  const idx = props.activeIndex
  const events = props.summary?.events
  if (idx == null || !events?.length) return null
  return events[idx] ?? null
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

function drawDeathHeatmap(ctx: CanvasRenderingContext2D, s: number, deaths: SpatialTimelineEvent[]) {
  const blobR = props.large ? 36 : 22
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const ev of deaths) {
    const px = ev.norm.x * s
    const py = ev.norm.y * s
    const grad = ctx.createRadialGradient(px, py, 0, px, py, blobR)
    grad.addColorStop(0, 'rgba(239, 68, 68, 0.75)')
    grad.addColorStop(0.45, 'rgba(239, 68, 68, 0.35)')
    grad.addColorStop(1, 'rgba(239, 68, 68, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(px, py, blobR, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

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

    if (useHeatmap.value) {
      drawDeathHeatmap(ctx, s, deathEvents.value)
    }

    summary.events.forEach((ev, idx) => {
      const px = ev.norm.x * s
      const py = ev.norm.y * s
      const isDeath = ev.type === 'death'
      const active = props.activeIndex === idx
      const r = active ? 10 : isDeath ? (useHeatmap.value ? 5 : 7) : 6

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
      const legend = useHeatmap.value
        ? 'Heat = death density   ● Kills'
        : '● Deaths   ● Kills'
      ctx.fillText(legend, 10, s - 10)
    }

    const active = activeEvent.value
    if (active) {
      const ax = active.norm.x * s
      const ay = active.norm.y * s
      const label = `${active.type === 'death' ? 'Died' : 'Kill'} · ${active.callout}`
      ctx.font = 'bold 12px system-ui, sans-serif'
      const tw = ctx.measureText(label).width
      const pad = 8
      const bx = Math.min(Math.max(ax - tw / 2 - pad, 4), s - tw - pad * 2 - 4)
      const by = Math.max(ay - 36, 8)
      ctx.fillStyle = 'rgba(0,0,0,0.82)'
      roundRect(ctx, bx, by, tw + pad * 2, 22, 6)
      ctx.fill()
      ctx.fillStyle = active.type === 'death' ? '#fca5a5' : '#86efac'
      ctx.fillText(label, bx + pad, by + 15)
    }
  }
  img.src = url
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

watch(() => [props.summary, props.activeIndex, props.large, props.showHeatmap], draw, { deep: true })
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
  </div>
</template>
