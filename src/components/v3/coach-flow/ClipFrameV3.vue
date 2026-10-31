<script setup lang="ts">
/**
 * A 16:9 frame from the match: the still the coach was looking at, swapped for the clip itself
 * when the player presses Watch (played from just before that moment). With no still and no clip
 * it shows nothing rather than an empty box.
 */
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  still?: string | null
  /** Loads the clip and returns a playable URL (blob:), or null when it isn't on this PC. */
  loadClip?: (() => Promise<string | null>) | null
  /** Seconds into the clip to start from when Watch is pressed. */
  startAt?: number | null
  /** Short words over the bottom of the frame, e.g. "Death · B Main". */
  tag?: string | null
  tone?: 'win' | 'loss' | 'none'
}>()

const src = ref<string | null>(null)
const playing = ref(false)
const failed = ref(false)
const video = ref<HTMLVideoElement | null>(null)

async function play(at?: number | null): Promise<void> {
  if (!props.loadClip) return
  if (!src.value) {
    src.value = await props.loadClip().catch(() => null)
    if (!src.value) { failed.value = true; return }
  }
  playing.value = true
  requestAnimationFrame(() => {
    const v = video.value
    if (!v) return
    v.currentTime = Math.max(0, (at ?? props.startAt ?? 0) - 1.5)
    void v.play().catch(() => {})
  })
}
const emit = defineEmits<{ time: [sec: number] }>()
/** Seek the clip if it's already loaded (used when the map steps). */
function seek(sec: number): boolean {
  const v = video.value
  if (!playing.value || !v) return false
  v.currentTime = Math.max(0, sec)
  return true
}
defineExpose({ play, seek })
watch(() => props.still, () => { playing.value = false })
onBeforeUnmount(() => { if (src.value?.startsWith('blob:')) URL.revokeObjectURL(src.value) })
</script>

<template>
  <div v-if="still || loadClip" class="cf3">
    <video v-if="playing && src" ref="video" class="cf3-media" :src="src" controls muted playsinline @timeupdate="emit('time', ($event.target as HTMLVideoElement).currentTime)" />
    <template v-else>
      <img v-if="still" :src="still" alt="Frame from the match at this moment" class="cf3-media">
      <div v-else class="cf3-media cf3-empty" />
      <button v-if="loadClip && !failed" type="button" class="cf3-play" aria-label="Watch this moment" @click="play()">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
      </button>
    </template>
    <span v-if="tag && !playing" class="cf3-tag uf-t3" :class="`is-${tone ?? 'none'}`">{{ tag }}</span>
  </div>
</template>

<style scoped>
.cf3 { position: relative; aspect-ratio: 16 / 9; background: var(--uf-chrome); overflow: hidden; min-width: 0; }
.cf3-media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; background: #000; }
.cf3-empty { background: var(--uf-raised); }
.cf3-play { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 52px; height: 52px; display: grid; place-items: center; background: rgba(11, 14, 18, 0.72); color: var(--uf-bone); border: 1px solid var(--uf-line-2); cursor: pointer; }
.cf3-play:hover { background: rgba(11, 14, 18, 0.9); }
.cf3-play:focus-visible { outline: 1px solid var(--uf-bone); }
.cf3-tag { position: absolute; left: 0; bottom: 0; padding: 6px 10px 6px 12px; background: linear-gradient(90deg, rgba(11, 14, 18, 0.88), rgba(11, 14, 18, 0.55)); border-left: 3px solid var(--uf-faint); color: var(--uf-bone); }
.cf3-tag.is-win { border-left-color: var(--uf-win); }
.cf3-tag.is-loss { border-left-color: var(--uf-loss); }
</style>
