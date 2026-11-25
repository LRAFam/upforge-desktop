<script setup lang="ts">
/**
 * Students (UI v3): one student opened under their row. Their allowance with you this month and every
 * match they sent you, newest first; a row opens the match with your notes. Read-only (one GET).
 */
import { onMounted, ref } from 'vue'
import UfSkeleton from '../UfSkeleton.vue'
import RosterMatchRowV3 from './RosterMatchRowV3.vue'
import { studentAllowanceLine, studentReviewStatus } from './coach-format'
import { rosterFormatDate } from '../../../lib/roster-match-display'
import { plural } from '../../../lib/plural'
import type { CoachReview } from '../../rosters/coach-roster'
import type { RosterStudentDetail } from '../../../env.d.ts'

const props = defineProps<{ studentId: number }>()
const emit = defineEmits<{ openReview: [review: CoachReview] }>()

const detail = ref<RosterStudentDetail | null>(null)
const loading = ref(true)
const failed = ref(false)

async function load() {
  loading.value = true
  failed.value = false
  try {
    detail.value = (await window.api.coach.getRosterStudent?.(props.studentId)) ?? null
    failed.value = !detail.value
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}
onMounted(load)

type Row = RosterStudentDetail['reviews'][number]
function subtitle(r: Row): string {
  const when = r.completed_at ? `notes ${rosterFormatDate(r.completed_at)}` : r.requested_at ? `sent ${rosterFormatDate(r.requested_at)}` : null
  return [when, r.annotation_count ? plural(r.annotation_count, 'note') : null, r.student_question?.trim() ? 'asked a question' : null]
    .filter(Boolean).join(' · ')
}
function open(r: Row) {
  emit('openReview', { id: r.id, status: r.status, analysis_id: r.analysis_id, analysis: r.analysis, student_question: r.student_question, requested_at: r.requested_at })
}
</script>

<template>
  <div class="uf-sd" aria-live="polite">
    <div v-if="loading" aria-busy="true" aria-label="Loading student"><UfSkeleton w="40%" :h="14" /><UfSkeleton w="70%" :h="36" style="margin-top: 10px" /></div>
    <p v-else-if="failed" class="uf-t4">Couldn’t load this student. <button type="button" class="uf-link" @click="load">Try again</button></p>
    <template v-else-if="detail">
      <p class="uf-t4">
        {{ studentAllowanceLine(detail.reviews_this_month, detail.reviews_per_month_limit, detail.resets_at) }}<template v-if="detail.joined_at"> · joined {{ rosterFormatDate(detail.joined_at) }}</template>
      </p>
      <p v-if="!detail.reviews.length" class="uf-t4">No matches sent to you yet.</p>
      <template v-else>
        <span class="uf-label">Matches sent to you</span>
        <RosterMatchRowV3 v-for="r in detail.reviews" :key="r.id" :match="r.analysis ?? {}" :subtitle="subtitle(r)"
          :status="studentReviewStatus(r.status)" :status-tone="r.status === 'completed' ? 'muted' : undefined" @open="open(r)" />
      </template>
    </template>
  </div>
</template>

<style scoped>
.uf-sd { display: flex; flex-direction: column; gap: 10px; padding: 4px 0 16px 62px; }
.uf-sd p { margin: 0; }
</style>
