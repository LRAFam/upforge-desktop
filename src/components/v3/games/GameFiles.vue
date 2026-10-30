<script setup lang="ts">
/** CS2 demos / Deadlock replays on this PC, with the old panels' actions (open folder, analyse, upload). */
import { computed } from 'vue'
import { formatAge, formatSize } from './game-data'
import type { GameData } from './useGameData'

const props = defineProps<{ game: 'cs2' | 'deadlock'; data: GameData; limit?: number }>()

const list = computed(() => (props.game === 'cs2' ? props.data.cs2.demos : props.data.deadlock.replays))
const files = computed(() => (list.value?.files ?? []).slice(0, props.limit ?? 5))
const noun = computed(() => (props.game === 'cs2' ? 'demo' : 'replay'))
const a = computed(() => props.data.actions)

function upload(path: string) { return props.game === 'deadlock' ? props.data.deadlock.uploads[path] : undefined }
function label(path: string): string {
  if (props.game === 'cs2') return 'Analyse'
  const s = upload(path)
  if (!s || s.status === 'idle') return 'Analyse'
  if (s.status === 'uploading') return `${s.pct}%`
  if (s.status === 'done') return 'View'
  return 'Retry'
}
function analyse(path: string) {
  if (props.game === 'cs2') a.value.cs2OpenAnalyze()
  else void props.data.analyzeReplay(path)
}
function openFolder() {
  if (props.game === 'cs2') a.value.cs2OpenFolder()
  else a.value.deadlockOpenFolder()
}
</script>

<template>
  <section class="gfiles" :aria-label="game === 'cs2' ? 'CS2 demos on this PC' : 'Deadlock replays on this PC'">
    <div class="gfiles-head">
      <p class="uf-label">{{ game === 'cs2' ? 'Demos' : 'Replays' }}</p>
      <span class="gfiles-links">
        <button v-if="game === 'deadlock'" type="button" class="uf-link" @click="data.load()">Refresh</button>
        <button v-if="list?.exists" type="button" class="uf-link" @click="openFolder">Open folder →</button>
      </span>
    </div>
    <p v-if="data.loading.value && !list" class="uf-t4">Scanning for {{ noun }}s…</p>
    <template v-else-if="!list?.exists">
      <p v-if="game === 'cs2'" class="uf-t4">No CS2 demo folder found yet. Install CS2 via Steam on this PC, or set a path in Settings → Recording.</p>
      <p v-else class="uf-t4">No Deadlock replay folder found yet. Replays save after matches, under Deadlock\game\citadel\replays.</p>
      <button v-if="game === 'cs2'" type="button" class="uf-link" @click="a.cs2OpenAnalyze()">Upload a demo on the web →</button>
    </template>
    <p v-else-if="!files.length" class="uf-t4">
      {{ game === 'cs2' ? 'No demos yet. Download the replay from your CS2 match history, then attach it to the matching recording.' : 'No replays yet. Play a match and come back.' }}
    </p>
    <template v-else>
      <div v-for="f in files" :key="f.path" class="gfiles-row">
        <span class="gfiles-text">
          <span class="uf-t3 gfiles-name" :title="f.name">{{ f.name }}</span>
          <span class="uf-t4">{{ formatSize(f.sizeBytes) }} · {{ formatAge(f.modifiedAt) }}</span>
          <span v-if="upload(f.path)?.status === 'uploading'" class="gfiles-bar"><span :style="{ width: `${upload(f.path)?.pct ?? 0}%` }" /></span>
          <span v-if="upload(f.path)?.error" class="uf-t4" style="color: var(--uf-loss)">{{ upload(f.path)?.error }}</span>
        </span>
        <button type="button" class="uf-link" :disabled="!!upload(f.path)?.busy" :aria-label="`${label(f.path)} ${f.name}`" @click="analyse(f.path)">{{ label(f.path) }} →</button>
      </div>
      <p class="uf-t4">Attach {{ noun }}s to recordings after each match{{ game === 'deadlock' ? ' for the kill timeline and clips' : '' }}.</p>
    </template>
  </section>
</template>

<style scoped>
.gfiles { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.gfiles p { margin: 0; }
.gfiles-head { display: flex; justify-content: space-between; align-items: baseline; }
.gfiles-links { display: flex; gap: 14px; }
.gfiles-row { display: flex; gap: 12px; align-items: center; padding: 8px 0; border-top: 1px solid var(--uf-line); }
.gfiles-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.gfiles-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gfiles-bar { height: 2px; background: var(--uf-line-2); margin-top: 4px; }
.gfiles-bar > span { display: block; height: 2px; background: var(--uf-bone); }
</style>
