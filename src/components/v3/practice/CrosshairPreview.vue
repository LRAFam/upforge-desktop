<script setup lang="ts">
/**
 * Live crosshair render from the trainer settings (colour, inner/outer lines, thickness, length,
 * gap, opacity, centre dot, outline). Reusable: Practice › Loadouts uses it, and Settings › Trainer
 * can import it next to the sliders. `background` is an optional image URL (e.g. a map splash) so the
 * player can judge contrast; without it the preview sits on the raised surface.
 */
import { computed } from 'vue'
import type { CrosshairSettings } from '../../../lib/crosshair'
import { crosshairExtent, crosshairShapes } from './crosshair-preview'

const props = withDefaults(defineProps<{
  settings: CrosshairSettings
  /** Trainer pixels → screen pixels. */
  scale?: number
  /** Box size in px. */
  size?: number
  background?: string
}>(), { scale: 2, size: 160, background: '' })

const shapes = computed(() => crosshairShapes(props.settings, props.scale))
// Never clip a big crosshair: grow the viewBox if the lines reach past the box.
const half = computed(() => Math.max(props.size / 2, crosshairExtent(props.settings, props.scale) + 4))
const viewBox = computed(() => `${-half.value} ${-half.value} ${half.value * 2} ${half.value * 2}`)
const label = computed(() => {
  const s = props.settings
  const parts = [s.dotShow ? 'centre dot' : '', s.innerShow ? 'inner lines' : '', s.outerShow ? 'outer lines' : ''].filter(Boolean)
  return `Crosshair preview: ${parts.length ? parts.join(', ') : 'nothing shown'}`
})
</script>

<template>
  <div class="uf-xhair" :style="{ width: `${size}px`, height: `${size}px` }" role="img" :aria-label="label">
    <img v-if="background" :src="background" alt="" class="uf-xhair-bg">
    <svg :viewBox="viewBox" :width="size" :height="size" aria-hidden="true" shape-rendering="crispEdges">
      <rect v-for="(r, i) in shapes.rects" :key="`r${i}`" :x="r.x" :y="r.y" :width="r.w" :height="r.h" :fill="r.fill" :fill-opacity="r.opacity" />
      <circle v-for="(d, i) in shapes.dots" :key="`d${i}`" cx="0" cy="0" :r="d.r" :fill="d.fill" :fill-opacity="d.opacity" shape-rendering="geometricPrecision" />
    </svg>
  </div>
</template>

<style scoped>
.uf-xhair { position: relative; flex: none; overflow: hidden; background: var(--uf-raised); box-shadow: inset 0 0 0 1px var(--uf-line); }
.uf-xhair-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(0.85); }
.uf-xhair svg { position: relative; display: block; }
</style>
