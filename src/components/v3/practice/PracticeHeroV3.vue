<script setup lang="ts">
/**
 * Practice hero (UI v3): real footage of the drill behind the copy. A run-through clip where the
 * drill has one (muted loop; a still when the player asks for reduced motion), else a frame of the
 * drill in play with the aim point marked by a red line and a square reticle. Never artwork.
 * Same scrim and bottom hairline as UfHeroBand. The picture is placed by frameLayout() from the
 * box's real size, so the aim point sits right of the copy at any window width.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { CLIP_ASPECT, drillPicture, frameLayout } from './drill-frames'

const props = defineProps<{
  /** Drill to picture. Null, or a drill with no picture of its own: the default clip. */
  scenario: string | null
  /** Shown bottom right, so the picture says which drill it is. */
  caption?: string | null
}>()

const el = ref<HTMLElement | null>(null)
const box = ref({ width: 1200, height: 420 })
const reducedMotion = ref(false)
let observer: ResizeObserver | null = null

function measure() {
  if (!el.value) return
  const width = el.value.clientWidth
  const height = el.value.clientHeight
  if (width > 0 && height > 0) box.value = { width, height }
}

onMounted(() => {
  measure()
  reducedMotion.value = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (typeof ResizeObserver !== 'undefined' && el.value) {
    observer = new ResizeObserver(measure)
    observer.observe(el.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())

const picture = computed(() => drillPicture(props.scenario))
// A clip is filmed through the crosshair, so its aim point is the middle of the picture.
const layout = computed(() => (picture.value.clip
  ? frameLayout([0.5, 0.5], box.value, { x: 0.64, y: 0.5 }, 1.3, CLIP_ASPECT)
  : frameLayout(picture.value.frame?.target ?? null, box.value)))
const place = computed(() => ({ width: `${layout.value.width}%`, left: `${layout.value.left}%`, top: `${layout.value.top}%` }))
const mark = computed(() => (picture.value.frame ? layout.value.target : null))
const says = computed(() => picture.value.clip?.caption ?? props.caption ?? null)
</script>

<template>
  <section ref="el" class="uf-phero">
    <template v-if="picture.clip">
      <img v-if="reducedMotion" :src="picture.clip.still" alt="" class="uf-phero-frame" :style="place">
      <video v-else :key="picture.clip.video" class="uf-phero-frame" :src="picture.clip.video" :poster="picture.clip.still"
        :style="place" autoplay muted loop playsinline disablepictureinpicture aria-hidden="true" />
    </template>
    <img v-else-if="picture.frame" :src="picture.frame.url" alt="" class="uf-phero-frame" :style="place">
    <div class="uf-phero-scrim" />
    <template v-if="mark">
      <!-- The line starts clear of the copy column and always runs through the target. -->
      <div class="uf-phero-line" :style="{ top: `${mark.y * 100}%`, left: `min(max(660px, 54%), calc(${mark.x * 100}% - 34px))` }" />
      <svg class="uf-phero-reticle" viewBox="0 0 44 44" aria-hidden="true" :style="{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%` }">
        <path d="M1 13V1h12M31 1h12v12M43 31v12H31M13 43H1V31" fill="none" stroke="currentColor" stroke-width="2" />
      </svg>
    </template>
    <span v-if="says" class="uf-t4 uf-phero-caption">{{ says }}</span>
    <div class="uf-phero-body uf-rise"><slot /></div>
  </section>
</template>

<style scoped>
.uf-phero { position: relative; overflow: hidden; flex: none; min-height: 400px; display: flex; border-bottom: 1px solid var(--uf-line); background: var(--uf-chrome); }
.uf-phero-frame { position: absolute; max-width: none; height: auto; filter: saturate(0.9); }
.uf-phero-scrim { position: absolute; inset: 0; background:
  linear-gradient(90deg, var(--uf-bg) 0%, rgba(14,17,22,0.94) 34%, rgba(14,17,22,0.3) 54%, rgba(14,17,22,0.05) 100%),
  linear-gradient(180deg, transparent 70%, rgba(14,17,22,0.65)); }
.uf-phero-line { position: absolute; right: 0; height: 1px; margin-top: -0.5px; background: var(--uf-red); opacity: 0.9; }
.uf-phero-reticle { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px; color: var(--uf-red); }
.uf-phero-caption { position: absolute; right: 40px; bottom: 14px; color: var(--uf-bone); text-shadow: 0 1px 2px rgba(14,17,22,0.9); }
.uf-phero-body { position: relative; box-sizing: border-box; width: min(100%, 680px); padding: 34px 40px 32px; display: flex; flex-direction: column; justify-content: center; gap: 14px; }
@media (max-width: 1000px) {
  .uf-phero-line, .uf-phero-reticle, .uf-phero-caption { display: none; }
}
</style>
