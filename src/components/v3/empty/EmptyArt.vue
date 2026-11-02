<script setup lang="ts">
/**
 * Empty state with the screen's one image: a dim, scrimmed map/agent/game backdrop on the right,
 * the honest copy (what's missing) on a solid area on the left, then one action in the default slot.
 * Use it only where the screen has no other big image (rule 7: one image, used big).
 */
import { computed } from 'vue'
import { usePrimaryGame } from '../../../composables/usePrimaryGame'
import { pickEmptyArt } from './empty-art'

const props = withDefaults(defineProps<{
  title: string
  text?: string
  /** Game whose art to show; defaults to the title-bar game. */
  game?: string
  agent?: string | null
  map?: string | null
  /** Override the backdrop with a bundled asset (e.g. the leaderboard podium). */
  art?: string
  /** page = the screen's main state (T1 title); section = one block inside a screen (T3 title). */
  size?: 'page' | 'section'
}>(), { text: '', game: undefined, agent: null, map: null, art: undefined, size: 'page' })

const { primaryGame } = usePrimaryGame()
const pick = computed(() => pickEmptyArt({ game: props.game ?? primaryGame.value, agent: props.agent, map: props.map, art: props.art }))
</script>

<template>
  <section class="uf-ea uf-rise" :class="[`is-${size}`, { 'has-agent': !!pick.agent }]" :data-art="pick.kind">
    <img :src="pick.backdrop" alt="" aria-hidden="true" class="uf-ea-art" decoding="async">
    <div class="uf-ea-scrim" aria-hidden="true" />
    <img v-if="pick.agent" :src="pick.agent" alt="" aria-hidden="true" class="uf-ea-agent" decoding="async">
    <div class="uf-ea-body">
      <p :class="size === 'page' ? 'uf-t1' : 'uf-t3'" class="uf-ea-title">{{ title }}</p>
      <p v-if="text" class="uf-t2 uf-ea-text">{{ text }}</p>
      <div v-if="$slots.default" class="uf-ea-act"><slot /></div>
    </div>
  </section>
</template>

<style scoped>
/* clip-path keeps the art inside the band but lets an agent cut-out break the top edge. */
.uf-ea { position: relative; isolation: isolate; display: flex; align-items: center; min-height: 280px; margin-top: 8px; border-top: 1px solid var(--uf-line); border-bottom: 1px solid var(--uf-line); clip-path: inset(-64px 0 0 0); }
.uf-ea.is-section { min-height: 184px; }
.uf-ea-art { position: absolute; inset: 0; z-index: -2; width: 100%; height: 100%; object-fit: cover; object-position: right center; filter: saturate(0.6) brightness(0.72); }
/* Gradient as a scrim only: solid where the text sits, fading to a dim view of the art on the right. */
.uf-ea-scrim { position: absolute; inset: 0; z-index: -1; background: linear-gradient(90deg, var(--uf-bg) 0%, var(--uf-bg) 38%, rgba(14, 17, 22, 0.82) 62%, rgba(14, 17, 22, 0.5) 100%); }
.uf-ea-agent { position: absolute; right: 6%; bottom: 0; z-index: -1; height: calc(100% + 56px); width: auto; max-width: 46%; object-fit: contain; object-position: bottom; filter: saturate(0.7) brightness(0.8); pointer-events: none; }
.uf-ea-body { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; max-width: min(560px, 58%); padding: 40px 0; }
.uf-ea.is-section .uf-ea-body { padding: 24px 0; }
.uf-ea-title, .uf-ea-text { margin: 0; }
.uf-ea-act { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; margin-top: 8px; }
@media (max-width: 760px) {
  .uf-ea-body { max-width: 100%; }
  .uf-ea-agent { display: none; }
  .uf-ea-scrim { background: rgba(14, 17, 22, 0.86); }
}
</style>
