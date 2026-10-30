<script setup lang="ts">
/** Home: "Your coach replied" — newest unopened coach review (last 14 days). Hidden when there is none. */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import UfButton from '../UfButton.vue'
import { openAnalysisVodReview } from '../../../lib/open-vod-review'
import { markReplySeen, readSeenReplies, replySentence, unseenReplies } from './roster-flow'
import { useStudentHub } from './useStudentHub'

const router = useRouter()
const { hub, refresh } = useStudentHub()
const seen = ref(readSeenReplies())

const replies = computed(() => unseenReplies(hub.value, seen.value))
const latest = computed(() => replies.value[0] ?? null)
const more = computed(() => Math.max(0, replies.value.length - 1))

function forget(id: number) {
  markReplySeen(id)
  seen.value = readSeenReplies()
}

async function open() {
  const r = latest.value
  if (!r) return
  forget(r.reviewId)
  const opened = r.analysisId != null
    && await openAnalysisVodReview(router, r.analysisId, { coachNotes: true, source: 'desktop_coach_reply_home' }).catch(() => false)
  if (!opened) router.push('/rosters').catch(() => {})
}

onMounted(() => { void refresh() })
</script>

<template>
  <section v-if="latest" class="cr3 uf-reveal" aria-label="Coach reply">
    <span class="uf-label">Your coach replied</span>
    <p class="uf-t3 cr3-line">{{ replySentence(latest) }}</p>
    <p v-if="more" class="uf-t4 cr3-meta">{{ more }} more {{ more === 1 ? 'review' : 'reviews' }} waiting in Coaches</p>
    <div class="cr3-actions">
      <UfButton variant="link" @click="open">Open notes</UfButton>
      <button type="button" class="cr3-dismiss uf-t4" @click="forget(latest.reviewId)">Dismiss</button>
    </div>
  </section>
</template>

<style scoped>
.cr3 { display: flex; flex-direction: column; gap: 6px; padding-top: 16px; border-top: 1px solid var(--uf-line); }
.cr3-line, .cr3-meta { margin: 0; }
.cr3-meta { color: var(--uf-faint); }
.cr3-actions { display: flex; align-items: center; gap: 16px; }
.cr3-dismiss { background: none; border: 0; padding: 0; color: var(--uf-faint); cursor: pointer; }
.cr3-dismiss:hover { color: var(--uf-muted); }
</style>
