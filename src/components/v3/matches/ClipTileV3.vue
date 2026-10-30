<script setup lang="ts">
/** One clip: 16:9 thumbnail (square corners), what happened, then title/meta and quiet actions. */
import { ref } from 'vue'
import type { ClipRecord } from '../../../env.d'
import UfIcon from '../UfIcon.vue'

defineProps<{
  clip: ClipRecord
  thumb?: string
  title: string
  label: string
  duration: string
  ago: string
  bulk: boolean
  selected: boolean
  uploading: boolean
  analysing: boolean
  busy: boolean
  canAnalyse: boolean
  uploadTitle?: string
}>()
const emit = defineEmits<{ open: []; toggle: []; favourite: []; upload: []; analyse: []; delete: [] }>()
const confirming = ref(false)
</script>

<template>
  <article class="uf-clip" :class="{ 'is-selected': selected }">
    <button type="button" class="uf-clip-media" :aria-label="bulk ? `Select ${title}` : `Play ${title}`" @click="bulk ? emit('toggle') : emit('open')">
      <img v-if="thumb" :src="thumb" alt="" class="uf-clip-img">
      <span v-else class="uf-clip-img uf-clip-empty"><UfIcon name="play" :size="22" /></span>
      <span class="uf-clip-scrim" />
      <span class="uf-clip-tag">
        <span v-if="bulk" class="uf-clip-check" :class="{ 'is-on': selected }"><UfIcon v-if="selected" name="check" :size="11" /></span>
        {{ label }}<template v-if="(clip.trigger === 'multikill' || clip.trigger === 'ace') && clip.killCount"> · {{ clip.trigger === 'ace' ? 'ACE' : `${clip.killCount}K` }}</template>
      </span>
      <span v-if="clip.overallScore" class="uf-clip-score uf-d4">{{ clip.overallScore }}</span>
      <span class="uf-clip-dur">{{ duration }}</span>
      <span class="uf-clip-play" aria-hidden="true"><UfIcon name="play" :size="20" /></span>
    </button>
    <div class="uf-clip-body">
      <div class="uf-clip-line">
        <span class="uf-t3 uf-trunc">{{ title }}</span>
        <span class="uf-t4">{{ ago }}</span>
      </div>
      <span v-if="clip.map || clip.agent" class="uf-t4">{{ [clip.map, clip.agent].filter(Boolean).join(' · ') }}</span>
      <span v-if="clip.suggestion" class="uf-t4 uf-clip-tip">{{ clip.suggestion }}</span>
      <span v-else-if="clip.analysisStatus === 'queued' || clip.analysisStatus === 'processing'" class="uf-t4"><span class="uf-live">●</span> Analysing…</span>
      <div v-if="!bulk" class="uf-clip-actions">
        <button type="button" class="uf-clip-fav" :class="{ 'is-on': clip.favorited }" :aria-pressed="!!clip.favorited"
          :aria-label="clip.favorited ? 'Unfavourite' : 'Favourite'" @click="emit('favourite')">
          <UfIcon name="star" :size="15" />
        </button>
        <button v-if="clip.uploadStatus !== 'uploaded'" type="button" class="uf-link" :disabled="busy" :title="uploadTitle" @click="emit('upload')">
          {{ uploading ? 'Uploading…' : 'Upload' }}
        </button>
        <button v-else-if="canAnalyse" type="button" class="uf-link" :disabled="busy" @click="emit('analyse')">
          {{ analysing ? 'Analysing…' : 'Analyse' }}
        </button>
        <span v-else class="uf-t4">In the cloud</span>
        <span style="flex: 1" />
        <template v-if="confirming">
          <button type="button" class="uf-link uf-danger" @click="confirming = false; emit('delete')">Delete</button>
          <button type="button" class="uf-link" @click="confirming = false">Keep</button>
        </template>
        <button v-else type="button" class="uf-clip-del" aria-label="Delete clip" @click="confirming = true"><UfIcon name="close" :size="14" /></button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.uf-clip { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.uf-clip.is-selected .uf-clip-media { outline: 2px solid var(--uf-red); outline-offset: 2px; }
.uf-clip-media { position: relative; display: block; aspect-ratio: 16 / 9; padding: 0; border: 1px solid var(--uf-line); background: #000; overflow: hidden; cursor: pointer; }
.uf-clip-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.uf-clip-empty { display: flex; align-items: center; justify-content: center; color: var(--uf-faint); background: var(--uf-raised); }
.uf-clip-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.45), transparent 35%, transparent 60%, rgba(0,0,0,0.7)); }
.uf-clip-tag { position: absolute; left: 10px; top: 9px; display: inline-flex; align-items: center; gap: 6px; font: 600 12px/1.2 var(--uf-body); letter-spacing: 0.12em; text-transform: uppercase; color: var(--uf-bone); }
.uf-clip-check { width: 14px; height: 14px; border: 1px solid var(--uf-bone); display: inline-flex; align-items: center; justify-content: center; }
.uf-clip-check.is-on { background: var(--uf-red); border-color: var(--uf-red); }
.uf-clip-score { position: absolute; right: 10px; top: 7px; color: var(--uf-bone); }
.uf-clip-dur { position: absolute; right: 10px; bottom: 8px; font: 600 12px/1 var(--uf-body); color: var(--uf-bone); font-variant-numeric: tabular-nums; }
.uf-clip-play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; opacity: 0; transition: opacity 0.15s; }
.uf-clip-media:hover .uf-clip-play, .uf-clip-media:focus-visible .uf-clip-play { opacity: 1; }
.uf-clip-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.uf-clip-line { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.uf-trunc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uf-clip-tip { color: var(--uf-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.uf-clip-actions { display: flex; align-items: center; gap: 14px; padding-top: 6px; }
.uf-clip-fav, .uf-clip-del { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; background: none; border: 1px solid var(--uf-line); color: var(--uf-faint); cursor: pointer; }
.uf-clip-fav.is-on { color: var(--uf-gold); border-color: rgba(232, 194, 106, 0.5); }
.uf-clip-fav:hover { color: var(--uf-gold); }
.uf-clip-del:hover { color: var(--uf-loss); border-color: var(--uf-loss); }
.uf-danger { color: var(--uf-loss); }
</style>
