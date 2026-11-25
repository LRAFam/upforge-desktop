<script setup lang="ts">
/**
 * One "Event timing" control for the match review (under the player, and in Map intel). It shifts the
 * kill / death / round markers and the map positions against this recording's video; the video itself
 * never moves. Shows the player's own adjustment on top of the detected timing, with a one-click reset.
 */
import { useVodReview } from '../../composables/useVodReview'

defineProps<{ compact?: boolean }>()
const { eventTimingState, nudgeTimelineSync, resetTimelineSync } = useVodReview()
</script>

<template>
  <div class="vet" :class="{ 'vet--compact': compact }" role="group" aria-label="Event timing">
    <span class="uf-label" aria-hidden="true">Event timing</span>
    <span class="vet-steps">
      <button type="button" class="vet-b uf-num" title="Move all events and map positions 5 seconds earlier" aria-label="Move events 5 seconds earlier" @click="nudgeTimelineSync(-5000)">−5s</button>
      <button type="button" class="vet-b uf-num" title="Move all events and map positions 1 second earlier" aria-label="Move events 1 second earlier" @click="nudgeTimelineSync(-1000)">−1s</button>
      <span class="uf-t3 uf-num vet-value" aria-live="polite">
        <template v-if="eventTimingState.adjusted">Your adjustment: {{ eventTimingState.adjustmentLabel }}</template>
        <template v-else>Detected timing</template>
      </span>
      <button type="button" class="vet-b uf-num" title="Move all events and map positions 1 second later" aria-label="Move events 1 second later" @click="nudgeTimelineSync(1000)">+1s</button>
      <button type="button" class="vet-b uf-num" title="Move all events and map positions 5 seconds later" aria-label="Move events 5 seconds later" @click="nudgeTimelineSync(5000)">+5s</button>
    </span>
    <button type="button" class="uf-link vet-reset" :disabled="!eventTimingState.adjusted" @click="resetTimelineSync">Reset to detected timing</button>
    <span v-if="!compact" class="uf-t4 vet-help">Moves the kill, death and round markers and the map on this recording. The video doesn't move. Saved for this recording.</span>
  </div>
</template>

<style scoped>
.vet { flex-shrink: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 8px 24px; border-top: 1px solid var(--uf-line); }
.vet--compact { padding: 10px 0 0; border-top: 0; }
.vet-steps { display: inline-flex; align-items: center; gap: 6px; }
.vet-b { height: 30px; padding: 0 10px; background: none; border: 1px solid var(--uf-line); color: var(--uf-muted); cursor: pointer; font: 600 13px/1 var(--uf-body); }
.vet-b:hover, .vet-b:focus-visible { color: var(--uf-bone); background: var(--uf-hover); }
.vet-value { min-width: 170px; text-align: center; }
.vet--compact .vet-value { min-width: 0; }
.vet-reset:disabled { color: var(--uf-faint); cursor: default; text-decoration: none; }
.vet-help { flex-basis: 100%; }
.vet:not(.vet--compact) .vet-help { flex-basis: auto; }
</style>
