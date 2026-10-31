<script setup lang="ts">
/**
 * Minimap at one moment: where everyone stood at that kill (Riot's position snapshot), you in bone,
 * teammates muted, enemies in the loss colour, and the killer → victim line. Only drawn from real
 * positions; the parent hides it when there's no snapshot.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { getMapMinimap } from '../../../lib/valorant'
import { drawMinimapImage, toMinimapDisplayNorm } from '../../../lib/map-display-norm'
import type { MomentSnapshot } from './coach-visuals'

const props = withDefaults(defineProps<{ snapshot: MomentSnapshot; size?: number; showCaption?: boolean }>(), { size: 240, showCaption: true })

const canvas = ref<HTMLCanvasElement | null>(null)
const ready = ref(false)
const url = computed(() => getMapMinimap(props.snapshot.map))

function draw(): void {
  const c = canvas.value
  if (!c || !url.value) return
  const px = props.size * 2
  c.width = px
  c.height = px
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, px, px)
    ctx.globalAlpha = 0.55
    drawMinimapImage(ctx, img, px, props.snapshot.map)
    ready.value = true
  }
  img.src = url.value
}
onMounted(draw)
watch(() => [props.snapshot.map, props.size], draw)

const P = (x: number, y: number) => {
  const p = toMinimapDisplayNorm(props.snapshot.map, { x, y })
  return { x: p.x * 100, y: p.y * 100 }
}
const dots = computed(() => props.snapshot.points
  .map(p => ({ ...p, ...P(p.x, p.y) }))
  // you on top
  .sort((a, b) => (a.who === 'you' ? 1 : 0) - (b.who === 'you' ? 1 : 0)))
const line = computed(() => (props.snapshot.line ? { a: P(props.snapshot.line.from.x, props.snapshot.line.from.y), b: P(props.snapshot.line.to.x, props.snapshot.line.to.y), outcome: props.snapshot.line.outcome } : null))
const lineColor = computed(() => (line.value?.outcome === 'kill' ? 'var(--uf-win)' : line.value?.outcome === 'death' ? 'var(--uf-loss)' : 'var(--uf-muted)'))
const victim = computed(() => dots.value.find(d => d.role === 'victim') ?? null)
const fill = (who: string) => (who === 'you' ? 'var(--uf-bone)' : who === 'ally' ? 'var(--uf-muted)' : 'var(--uf-loss)')
</script>

<template>
  <figure class="mm3" :style="{ width: `${size}px` }">
    <div class="mm3-board" :style="{ width: `${size}px`, height: `${size}px` }">
      <canvas ref="canvas" class="mm3-img" :class="{ 'is-ready': ready }" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true" />
      <svg class="mm3-svg" viewBox="0 0 100 100" role="img" :aria-label="snapshot.caption ?? 'Positions at this moment'">
        <line v-if="line" :x1="line.a.x" :y1="line.a.y" :x2="line.b.x" :y2="line.b.y" :stroke="lineColor" stroke-width="1.1" stroke-dasharray="2.4 1.6" />
        <g v-for="(d, i) in dots" :key="i">
          <rect v-if="d.who === 'you'" :x="d.x - 3.4" :y="d.y - 3.4" width="6.8" height="6.8" fill="none" stroke="var(--uf-bone)" stroke-width="0.8" />
          <circle :cx="d.x" :cy="d.y" :r="d.who === 'you' ? 2.2 : 2"
            :fill="d.alive === false ? 'none' : fill(d.who)" :stroke="fill(d.who)" :stroke-width="d.alive === false ? 0.7 : 0" />
          <path v-if="d.alive === false" :d="`M${d.x - 1.6} ${d.y - 1.6} L${d.x + 1.6} ${d.y + 1.6} M${d.x + 1.6} ${d.y - 1.6} L${d.x - 1.6} ${d.y + 1.6}`" :stroke="fill(d.who)" stroke-width="0.7" />
        </g>
        <text v-if="victim && snapshot.callout" :x="Math.min(76, Math.max(4, victim.x + 4))" :y="Math.max(7, victim.y - 4)" class="mm3-callout">{{ snapshot.callout }}</text>
      </svg>
    </div>
    <figcaption v-if="showCaption" class="mm3-key uf-t4">
      <span><i class="mm3-sw is-you" />You</span><span><i class="mm3-sw is-ally" />Team</span><span><i class="mm3-sw is-enemy" />Enemy</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.mm3 { margin: 0; display: flex; flex-direction: column; gap: 8px; flex: none; }
.mm3-board { position: relative; background: var(--uf-chrome); }
.mm3-img { position: absolute; inset: 0; opacity: 0; transition: opacity 200ms ease-out; }
.mm3-img.is-ready { opacity: 1; }
.mm3-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.mm3-callout { fill: var(--uf-bone); font: 600 5.2px var(--uf-body); letter-spacing: 0.02em; paint-order: stroke; stroke: var(--uf-chrome); stroke-width: 1.2px; }
.mm3-key { display: flex; gap: 14px; margin: 0; }
.mm3-key span { display: inline-flex; align-items: center; gap: 6px; }
.mm3-sw { width: 7px; height: 7px; display: inline-block; border-radius: 50%; }
.mm3-sw.is-you { background: var(--uf-bone); }
.mm3-sw.is-ally { background: var(--uf-muted); }
.mm3-sw.is-enemy { background: var(--uf-loss); }
@media (prefers-reduced-motion: reduce) { .mm3-img { transition: none; } }
</style>
