<script setup lang="ts">
/**
 * One drill as a picture tile (UI v3): a real frame of the drill with its target marked, then its
 * name, your best and where you stand. The whole tile starts the drill. Where the drill has a
 * run-through clip, pointing at the tile (or focusing it) plays it; reduced motion keeps the still.
 * Used by Practice › Today and Practice › Drills.
 */
import { computed, ref } from 'vue'
import UfIcon from '../UfIcon.vue'
import { drillFrame, frameLayout, ownClip } from './drill-frames'
import { noBestCaption } from './practice-v3'

const props = defineProps<{
  drill: {
    scenario: string
    label: string
    description: string
    beta?: boolean
    personalBest: number | null
    oldBest: number | null
    globalRank: number | null
    completed: boolean
  }
  /** Marks the drill the session is built around. */
  focus?: boolean
  running?: boolean
  busy?: boolean
  /** Replaces the best and the state, for a tile that is not a plain drill (the daily challenge). */
  stateText?: string | null
}>()

const emit = defineEmits<{ play: [scenario: string] }>()

/** The frame cut to the tile, its target a little above the middle so the name sits clear of it. */
const picture = computed(() => {
  const frame = drillFrame(props.drill.scenario)
  if (!frame) return null
  const l = frameLayout(frame.target, { width: 320, height: 180 }, { x: 0.5, y: 0.46 }, 1.35)
  return { url: frame.url, style: { width: `${l.width}%`, left: `${l.left}%`, top: `${l.top}%` }, mark: l.target }
})
const clip = computed(() => ownClip(props.drill.scenario))
const playing = ref(false)
function play(on: boolean) {
  if (!clip.value) return
  playing.value = on && !(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}
const state = computed(() => {
  if (props.stateText != null) return props.stateText
  if (props.drill.completed) return 'Played today'
  if (props.drill.personalBest == null) return noBestCaption(props.drill.oldBest)
  return props.drill.globalRank ? `Rank #${props.drill.globalRank}` : ''
})
</script>

<template>
  <li class="uf-tile-item">
    <button type="button" class="uf-tile" :class="{ 'is-running': running, 'is-focus': focus }" :disabled="busy"
      :aria-label="`Play ${drill.label}`" @click="emit('play', drill.scenario)"
      @mouseenter="play(true)" @mouseleave="play(false)" @focus="play(true)" @blur="play(false)">
      <span class="uf-tile-pic">
        <img v-if="picture" :src="picture.url" alt="" :style="picture.style">
        <video v-if="playing && clip" class="uf-tile-clip" :src="clip.video" autoplay muted loop playsinline disablepictureinpicture aria-hidden="true" />
        <svg v-if="picture?.mark && !playing" class="uf-tile-reticle" viewBox="0 0 44 44" aria-hidden="true"
          :style="{ left: `${picture.mark.x * 100}%`, top: `${picture.mark.y * 100}%` }">
          <path d="M1 13V1h12M31 1h12v12M43 31v12H31M13 43H1V31" fill="none" stroke="currentColor" stroke-width="2.5" />
        </svg>
        <span v-if="drill.beta" class="uf-tile-tag">Beta</span>
        <span class="uf-tile-go" aria-hidden="true"><UfIcon name="play" :size="18" /></span>
      </span>
      <span class="uf-tile-line">
        <span class="uf-t3 uf-tile-name">{{ drill.label }}</span>
        <span v-if="stateText == null && drill.personalBest != null" class="uf-d4" style="color: var(--uf-gold)"><span aria-hidden="true">★ </span>{{ Math.round(drill.personalBest) }}</span>
      </span>
      <span class="uf-tile-line">
        <span class="uf-t4 uf-tile-what" :title="drill.description">{{ drill.description }}</span>
        <span v-if="running" class="uf-t4 uf-live" style="color: var(--uf-red)">Running</span>
        <span v-else-if="state" class="uf-t4 uf-tile-state" :style="drill.completed || stateText === 'Done today' ? 'color: var(--uf-win)' : undefined">{{ state }}</span>
      </span>
    </button>
  </li>
</template>

<style scoped>
.uf-tile-item { list-style: none; min-width: 0; }
.uf-tile { display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 0; border: 0; background: none; color: inherit; text-align: left; cursor: pointer; }
.uf-tile:disabled { cursor: not-allowed; opacity: 0.6; }
.uf-tile-pic { position: relative; display: block; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; background: var(--uf-raised); margin-bottom: 4px; box-shadow: inset 0 0 0 1px var(--uf-line); }
.uf-tile-pic img { position: absolute; max-width: none; height: auto; filter: saturate(0.9) brightness(0.92); transition: filter 160ms ease-out; }
.uf-tile:hover:not(:disabled) .uf-tile-pic img, .uf-tile:focus-visible .uf-tile-pic img { filter: saturate(1) brightness(1.04); }
.uf-tile.is-focus .uf-tile-pic, .uf-tile.is-running .uf-tile-pic { box-shadow: inset 0 3px 0 var(--uf-red); }
.uf-tile.is-focus .uf-tile-pic::after, .uf-tile.is-running .uf-tile-pic::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--uf-red); }
.uf-tile-clip { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.uf-tile-reticle { position: absolute; width: 26px; height: 26px; margin: -13px 0 0 -13px; color: var(--uf-red); }
.uf-tile-tag { position: absolute; left: 10px; top: 10px; padding: 3px 6px; background: rgba(14,17,22,0.82); font: 600 12px/1.2 var(--uf-body); letter-spacing: 0.12em; text-transform: uppercase; color: var(--uf-gold); }
.uf-tile-go { position: absolute; right: 10px; bottom: 10px; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; background: var(--uf-red); color: #fff; opacity: 0; transition: opacity 140ms ease-out; }
.uf-tile:hover:not(:disabled) .uf-tile-go, .uf-tile:focus-visible .uf-tile-go { opacity: 1; }
.uf-tile-line { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; min-width: 0; }
.uf-tile-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Two lines before it cuts; the full text is in the tooltip and in the launch dialog. */
.uf-tile-what { min-width: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.uf-tile-state { flex: none; white-space: nowrap; }
</style>
