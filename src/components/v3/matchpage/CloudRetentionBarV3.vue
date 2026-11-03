<script setup lang="ts">
/**
 * Match page: one quiet line about the cloud copy of this match's full video (cloud retention).
 * Countdown → "Keep it in the cloud" + "Download". Removed and nothing on this PC → "Full video no
 * longer stored" (notes, clips and stats still show). Playing from this PC, kept, or an older API → nothing.
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useVodReview } from '../../../composables/useVodReview'
import { chooseVideoSource, parseRetention, retentionLine } from '../../../lib/cloud-retention'
import UfButton from '../UfButton.vue'

const router = useRouter()
const { timeline } = useVodReview()
const retention = computed(() => parseRetention(timeline.value?.cloudRetention))
const playingLocal = computed(() => {
  const path = timeline.value?.videoPath
  return !!path && !/^https?:\/\//i.test(path)
})
const line = computed(() => {
  const l = retentionLine(retention.value)
  if (!l) return null
  const source = chooseVideoSource({ hasLocalFile: playingLocal.value, inCloud: true, retention: retention.value })
  if (l.removed) return source === 'local' ? null : l
  return l.countdown ? l : null
})
/** Download target: the cloud archive, else the analysis video (by analysis id). */
const target = computed(() => {
  const t = timeline.value
  if (t?.archiveId) return { kind: 'recording' as const, id: t.archiveId }
  if (t?.analysisId) return { kind: 'analysis_video' as const, id: String(t.analysisId) }
  return null
})
const message = ref('')
const busy = ref(false)
watch(() => timeline.value?.id, () => { message.value = '' })
function keep() { router.push({ path: '/cloud-storage', query: { keep: '1' } }).catch(() => {}) }
async function download() {
  if (!target.value || busy.value) return
  busy.value = true
  message.value = 'Preparing download…'
  try {
    const result = await window.api.cloudStorage.download(target.value)
    message.value = result.ok ? 'Download started. Choose where to save it in the save window.' : result.error
  } catch {
    message.value = 'Could not start the download. Please retry.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section v-if="line" class="uf-crb" :aria-label="line.removed ? 'Full video removed from the cloud' : 'How long the cloud keeps this video'">
    <div class="uf-crb-text">
      <span class="uf-t3" :class="{ 'is-warn': line.tone === 'warn' }">{{ line.text }}</span>
      <span class="uf-t4">{{ line.removed ? line.detail : line.detail ?? 'Keep it in the cloud with a plan or storage pack, or download a copy.' }}</span>
    </div>
    <template v-if="line.countdown">
      <UfButton variant="secondary" @click="keep">Keep it in the cloud</UfButton>
      <UfButton v-if="target" variant="link" :disabled="busy" @click="download">Download</UfButton>
    </template>
    <p v-if="message" class="uf-t4 uf-crb-msg" role="status">{{ message }}</p>
  </section>
</template>

<style scoped>
.uf-crb { flex-shrink: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 10px 24px; border-bottom: 1px solid var(--uf-line); }
.uf-crb-text { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 2px; }
.uf-crb .is-warn { color: var(--uf-gold); }
.uf-crb-msg { flex-basis: 100%; margin: 0; }
</style>
