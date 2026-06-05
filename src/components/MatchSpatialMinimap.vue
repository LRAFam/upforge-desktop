<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { getMapMinimap } from '../lib/valorant'
import { fromMinimapDisplayNorm, toMinimapDisplayNorm } from '../lib/map-display-norm'
import type { MatchSpatialSummary, SpatialTimelineEvent } from '../lib/spatial-types'

const props = withDefaults(defineProps<{
  summary: MatchSpatialSummary | null | undefined
  mapName?: string | null
  activeIndex?: number | null
  showLegend?: boolean
  showHeatmap?: boolean
  /** callout = per-death blobs; site = aggregated bombsite heat */
  heatmapLayer?: 'callout' | 'site'
  large?: boolean
  /** Filter events to one round (null = all). */
  roundFilter?: number | null
  showRoundSlider?: boolean
}>(), {
  showLegend: true,
  showHeatmap: true,
  heatmapLayer: 'callout',
  large: false,
  roundFilter: null,
  showRoundSlider: false,
})

const emit = defineEmits<{
  select: [event: SpatialTimelineEvent, index: number]
  'update:roundFilter': [round: number | null]
}>()

const deathEvents = computed(() =>
  (props.summary?.events ?? []).filter((e) => e.type === 'death'),
)

const useCalloutHeat = computed(() =>
  props.showHeatmap
  && props.heatmapLayer === 'callout'
  && deathEvents.value.length >= 2,
)

const useSiteHeat = computed(() =>
  props.showHeatmap
  && props.heatmapLayer === 'site'
  && (props.summary?.siteHotspots?.length ?? 0) > 0,
)

const activeEvent = computed(() => {
  const idx = props.activeIndex
  const events = props.summary?.events
  if (idx == null || !events?.length) return null
  return events[idx] ?? null
})

const availableRounds = computed(() => {
  const rounds = new Set<number>()
  for (const e of props.summary?.events ?? []) rounds.add(e.round)
  return [...rounds].sort((a, b) => a - b)
})

const sliderRound = computed({
  get: () => props.roundFilter ?? availableRounds.value[0] ?? 0,
  set: (v: number) => emit('update:roundFilter', v),
})

const canvasRef = ref<HTMLCanvasElement | null>(null)
const imgLoaded = ref(false)

const minimapUrl = computed(() => {
  const m = props.summary?.map ?? props.mapName
  return m ? getMapMinimap(m) : ''
})

const size = computed(() => (props.large ? 640 : 320))

const mapLabel = computed(() => props.summary?.map ?? props.mapName ?? null)

function displayNorm(norm: { x: number; y: number }) {
  return toMinimapDisplayNorm(mapLabel.value, norm)
}

function drawDeathHeatmap(ctx: CanvasRenderingContext2D, s: number, deaths: SpatialTimelineEvent[]) {
  const blobR = props.large ? 36 : 22
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const ev of deaths) {
    const d = displayNorm(ev.norm)
    const px = d.x * s
    const py = d.y * s
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

function drawSiteHeatmap(ctx: CanvasRenderingContext2D, s: number) {
  const hotspots = props.summary?.siteHotspots ?? []
  const maxCount = Math.max(...hotspots.map((h) => h.count), 1)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const h of hotspots) {
    const d = displayNorm(h.norm)
    const px = d.x * s
    const py = d.y * s
    const blobR = (props.large ? 42 : 28) + (h.count / maxCount) * (props.large ? 24 : 14)
    const grad = ctx.createRadialGradient(px, py, 0, px, py, blobR)
    grad.addColorStop(0, 'rgba(239, 68, 68, 0.85)')
    grad.addColorStop(0.4, 'rgba(239, 68, 68, 0.4)')
    grad.addColorStop(1, 'rgba(239, 68, 68, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(px, py, blobR, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText(`${h.site} (${h.count})`, px - 16, py + 4)
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

    if (useCalloutHeat.value) drawDeathHeatmap(ctx, s, deathEvents.value)
    if (useSiteHeat.value) drawSiteHeatmap(ctx, s)

    const heatActive = useCalloutHeat.value || useSiteHeat.value
    summary.events.forEach((ev, idx) => {
      const d = displayNorm(ev.norm)
      const px = d.x * s
      const py = d.y * s
      const isDeath = ev.type === 'death'
      const active = props.activeIndex === idx
      const r = active ? 10 : isDeath ? (heatActive ? 5 : 7) : 6

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
      let legend = '● Deaths   ● Kills'
      if (useSiteHeat.value) legend = 'Heat = site deaths   ● Events'
      else if (useCalloutHeat.value) legend = 'Heat = death density   ● Kills'
      ctx.fillText(legend, 10, s - 10)
    }

    const active = activeEvent.value
    if (active) {
      const ad = displayNorm(active.norm)
      const ax = ad.x * s
      const ay = ad.y * s
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

watch(
  () => [props.summary, props.activeIndex, props.large, props.showHeatmap, props.heatmapLayer, props.roundFilter],
  draw,
  { deep: true },
)
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
  const clickNorm = fromMinimapDisplayNorm(mapLabel.value, { x: x / s, y: y / s })

  let best = -1
  let bestD = 20
  summary.events.forEach((ev, i) => {
    const d = Math.hypot(ev.norm.x - clickNorm.x, ev.norm.y - clickNorm.y) * s
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  if (best >= 0) emit('select', summary.events[best], best)
}

function exportPng(): string | null {
  return canvasRef.value?.toDataURL('image/png') ?? null
}

defineExpose({ exportPng })
</script>

<template>
  <div class="relative w-full space-y-2">
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

    <div
      v-if="showRoundSlider && availableRounds.length > 1"
      class="flex items-center gap-2 px-1"
    >
      <button
        type="button"
        class="text-[9px] font-semibold px-2 py-0.5 rounded-md border shrink-0 transition-colors"
        :class="roundFilter == null
          ? 'bg-white/10 border-white/20 text-white'
          : 'bg-black/30 border-white/10 text-gray-500'"
        @click="emit('update:roundFilter', null)"
      >All</button>
      <input
        v-if="roundFilter != null"
        type="range"
        class="flex-1 h-1 accent-red-500"
        :min="availableRounds[0]"
        :max="availableRounds[availableRounds.length - 1]"
        :value="sliderRound"
        @input="sliderRound = Number(($event.target as HTMLInputElement).value)"
      />
      <span
        v-if="roundFilter != null"
        class="text-[10px] font-bold tabular-nums text-gray-400 shrink-0 min-w-[2.5rem] text-right"
      >R{{ sliderRound + 1 }}</span>
      <button
        v-else
        type="button"
        class="text-[9px] font-semibold text-gray-500 hover:text-gray-300"
        @click="emit('update:roundFilter', availableRounds[0] ?? 0)"
      >Filter round</button>
    </div>
  </div>
</template>
