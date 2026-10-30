<script setup lang="ts">
/**
 * One round over time: players alive on each side (your team in bone, enemies in the loss colour),
 * spike plant / defuse, and your kill and death as markers you can click to watch.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { mmss, type RoundMark, type RoundTimeline } from './coach-visuals'

const props = defineProps<{ timeline: RoundTimeline }>()
const emit = defineEmits<{ watch: [mark: RoundMark] }>()

// Drawn at its real width so labels keep their size on any screen.
const box = ref<HTMLElement | null>(null)
const W = ref(600)
let ro: ResizeObserver | null = null
onMounted(() => {
  if (!box.value) return
  W.value = Math.max(280, Math.round(box.value.clientWidth))
  ro = new ResizeObserver(([e]) => { W.value = Math.max(280, Math.round(e.contentRect.width)) })
  ro.observe(box.value)
})
onBeforeUnmount(() => ro?.disconnect())
const H = 96
const TOP = 10
const ROW = (H - TOP - 18) / 5
const x = (ms: number) => Math.round((ms / props.timeline.durationMs) * (W.value - 8) * 10) / 10 + 4
const y = (n: number) => TOP + (5 - n) * ROW

function steps(side: 'allies' | 'enemies'): string {
  const pts = props.timeline.alive
  let d = `M0 ${y(pts[0][side])}`
  for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i].ms)} V${y(pts[i][side])}`
  return `${d} H${W.value - 4}`
}
const allies = computed(() => steps('allies'))
const enemies = computed(() => steps('enemies'))
const last = computed(() => props.timeline.alive[props.timeline.alive.length - 1])
const mine = computed(() => props.timeline.marks.filter(m => m.kind === 'your-kill' || m.kind === 'your-death'))
const spike = computed(() => props.timeline.marks.filter(m => m.kind === 'plant' || m.kind === 'defuse'))
const ticks = computed(() => {
  const out: number[] = []
  for (let ms = 0; ms <= props.timeline.durationMs; ms += 20_000) out.push(ms)
  return out
})
</script>

<template>
  <figure ref="box" class="rt3">
    <svg :viewBox="`0 0 ${W} ${H}`" :width="W" :height="H" class="rt3-svg" role="img" :aria-label="`Round ${timeline.round}: ${last.allies} of your team and ${last.enemies} enemies alive at the end`">
      <line v-for="n in 5" :key="`g${n}`" x1="0" :x2="W" :y1="y(n)" :y2="y(n)" stroke="var(--uf-line)" stroke-width="1" />
      <g v-for="m in spike" :key="`s${m.ms}`">
        <line :x1="x(m.ms)" :x2="x(m.ms)" :y1="TOP - 4" :y2="H - 18" stroke="var(--uf-line-2)" stroke-dasharray="3 3" />
        <text :x="x(m.ms) + 4" :y="TOP + 2" class="rt3-lbl">{{ m.kind === 'plant' ? 'Plant' : 'Defuse' }}</text>
      </g>
      <path :d="enemies" fill="none" stroke="var(--uf-loss)" stroke-width="2" class="uf-fill" />
      <path :d="allies" fill="none" stroke="var(--uf-bone)" stroke-width="2" class="uf-fill" />
      <g v-for="m in mine" :key="`m${m.ms}`" class="rt3-mark" role="button" tabindex="0" :aria-label="`${m.label} at ${mmss(m.ms)} — watch`"
        @click="emit('watch', m)" @keydown.enter="emit('watch', m)">
        <line :x1="x(m.ms)" :x2="x(m.ms)" :y1="TOP" :y2="H - 18" :stroke="m.kind === 'your-kill' ? 'var(--uf-win)' : 'var(--uf-loss)'" stroke-width="1.5" />
        <rect v-if="m.kind === 'your-kill'" :x="x(m.ms) - 5" :y="H - 22" width="10" height="10" fill="var(--uf-win)" />
        <g v-else>
          <rect :x="x(m.ms) - 5" :y="H - 22" width="10" height="10" fill="var(--uf-bg)" stroke="var(--uf-loss)" stroke-width="1.5" />
          <path :d="`M${x(m.ms) - 3} ${H - 20} L${x(m.ms) + 3} ${H - 14} M${x(m.ms) + 3} ${H - 20} L${x(m.ms) - 3} ${H - 14}`" stroke="var(--uf-loss)" stroke-width="1.5" />
        </g>
      </g>
      <text v-for="t in ticks" :key="`t${t}`" :x="Math.min(W - 28, x(t))" :y="H - 2" class="rt3-lbl">{{ mmss(t) }}</text>
    </svg>
    <figcaption class="rt3-key uf-t4">
      <span><i class="rt3-sw is-you" />Your team alive</span>
      <span><i class="rt3-sw is-enemy" />Enemies alive</span>
      <span v-if="mine.some(m => m.kind === 'your-kill')"><i class="rt3-sq is-kill" />Your kill</span>
      <span v-if="mine.some(m => m.kind === 'your-death')"><i class="rt3-sq is-death" />Your death</span>
      <span class="uf-num">Ended {{ last.allies }}v{{ last.enemies }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.rt3 { margin: 0; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.rt3-svg { display: block; overflow: visible; }
.rt3-lbl { fill: var(--uf-faint); font: 500 11px var(--uf-body); font-variant-numeric: tabular-nums; }
.rt3-mark { cursor: pointer; outline: none; }
.rt3-mark:hover rect, .rt3-mark:focus-visible rect { filter: brightness(1.3); }
.rt3-key { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; }
.rt3-key span { display: inline-flex; align-items: center; gap: 6px; }
.rt3-sw { width: 14px; height: 2px; display: inline-block; }
.rt3-sw.is-you { background: var(--uf-bone); }
.rt3-sw.is-enemy { background: var(--uf-loss); }
.rt3-sq { width: 8px; height: 8px; display: inline-block; }
.rt3-sq.is-kill { background: var(--uf-win); }
.rt3-sq.is-death { border: 1.5px solid var(--uf-loss); }
.uf-num { font-variant-numeric: tabular-nums; }
</style>
