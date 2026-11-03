<script setup lang="ts">
/**
 * v3 list of coached sessions + matches waiting for coaching, as hairline rows grouped by match date
 * with the same groups and row order as Matches (Today / This week / Last week / month; map · agent).
 */
import { computed, inject } from 'vue'
import { useCoachingHistory } from '../../../composables/useCoachingHistory'
import { formatMatchDate, groupByMatchDate, matchMapArt, matchMapLabel } from '../matches/match-meta'
import { matchScore, scoreToneColor } from '../../../lib/upforge-score'
import UfSkeleton from '../UfSkeleton.vue'
import EmptyArt from '../empty/EmptyArt.vue'
import { pendingMatchLifecycleState, pendingMatchStatusLabel } from '../../../lib/match-lifecycle'
import { recordingRowStats } from '../../../lib/dashboard-match-row'
import { normalizeAgentName } from '../../../lib/valorant'
import { ARCHIVE_DATES_KEY, kdaLine, pendingDot, resultTone, reviewPlayedAt, scoreLine, sessionStatusLabel } from './reviews-v3'

const {
  allAnalyses,
  coachReviewByAnalysisId,
  filteredAnalyses,
  getAgentImage,
  getMapListViewImage,
  loading,
  pendingLoading,
  pendingRecordings,
  selectPendingRecording,
  selectSession,
  prefetchSession,
  selectedId,
  selectedRecordingId,
} = useCoachingHistory()

const toneColor = (t: 'win' | 'loss' | 'none') => (t === 'win' ? 'var(--uf-win)' : t === 'loss' ? 'var(--uf-loss)' : 'var(--uf-faint)')

// Match dates: the earliest of analysis time and recording upload (from Matches, when embedded there).
const archiveDates = inject(ARCHIVE_DATES_KEY, null)
const playedAt = (a: { id: number; created_at: string }) => reviewPlayedAt(a, archiveDates?.value)
const groups = computed(() => groupByMatchDate(filteredAnalyses.value, playedAt))
const mapArt = (map: string | null) => (map ? getMapListViewImage(map) || matchMapArt(null, map) : '')
</script>

<template>
  <div class="rv3-list" :class="{ 'is-collapsed': selectedId != null || selectedRecordingId != null }">
    <!-- Skeleton until reviews exist to show: never flash "No coaching reviews yet" while they load. -->
    <div v-if="(loading && !allAnalyses.length) || (pendingLoading && !allAnalyses.length && !pendingRecordings.length)" class="rv3-loading" role="status" aria-label="Loading coaching reviews">
      <div v-for="i in 6" :key="i" class="rv3-skel-row">
        <UfSkeleton :w="72" :h="40" />
        <span class="rv3-main"><UfSkeleton :w="'55%'" :h="15" /><UfSkeleton :w="'38%'" :h="12" /></span>
        <UfSkeleton :w="54" :h="26" />
      </div>
    </div>

    <div v-else-if="filteredAnalyses.length === 0 && pendingRecordings.length === 0 && allAnalyses.length === 0" class="rv3-empty">
      <EmptyArt size="section" title="No coaching reviews yet" text="Record a match and run AI coaching — every review lands here." />
    </div>
    <div v-else-if="filteredAnalyses.length === 0 && pendingRecordings.length === 0" class="rv3-empty">
      <p class="uf-t3">No reviews match this filter</p>
      <p class="uf-t4">Try another result or map filter.</p>
    </div>

    <template v-else>
      <section v-if="pendingRecordings.length" class="rv3-group" aria-label="Before coaching">
        <div class="rv3-group-head"><span class="uf-label">Before coaching</span><span class="uf-t4">{{ pendingRecordings.length }}</span></div>
        <button
          v-for="rec in pendingRecordings"
          :key="rec.id"
          type="button"
          class="rv3-row"
          :class="{ 'is-on': selectedRecordingId === rec.id }"
          :aria-current="selectedRecordingId === rec.id ? 'true' : undefined"
          @click="selectPendingRecording(rec)"
        >
          <span class="rv3-thumb">
            <img v-if="mapArt(rec.map)" :src="mapArt(rec.map)" alt="" class="rv3-map" loading="lazy" decoding="async">
            <img v-if="rec.agent && getAgentImage(rec.agent)" :src="getAgentImage(rec.agent)" alt="" class="rv3-agent" loading="lazy" decoding="async">
          </span>
          <span class="rv3-main">
            <span class="uf-t3 rv3-trunc">{{ matchMapLabel(rec.game, rec.map) }} · {{ normalizeAgentName(rec.agent) || 'Unknown agent' }}</span>
            <span class="uf-t4 rv3-trunc">
              <span v-if="kdaLine(recordingRowStats(rec))">{{ kdaLine(recordingRowStats(rec)) }} K/D/A · </span>{{ pendingMatchStatusLabel(rec) }}<span v-if="rec.productionFixture"> · Production fixture</span>
            </span>
          </span>
          <span class="rv3-side">
            <span v-if="scoreLine(recordingRowStats(rec))" class="uf-d4" :style="{ color: toneColor(resultTone(recordingRowStats(rec))) }">{{ scoreLine(recordingRowStats(rec)) }}</span>
            <span class="rv3-dot" :class="{ 'uf-live': pendingDot(pendingMatchLifecycleState(rec)).live }" :style="{ background: pendingDot(pendingMatchLifecycleState(rec)).color }" aria-hidden="true" />
          </span>
        </button>
      </section>

      <section v-for="group in groups" :key="group.label" class="rv3-group" :aria-label="group.label">
        <div class="rv3-group-head"><span class="uf-label">{{ group.label }}</span><span class="uf-t4">{{ group.items.length }}</span></div>
        <button
          v-for="a in group.items"
          :key="a.id"
          type="button"
          class="rv3-row"
          :class="{ 'is-on': selectedId === a.id }"
          :aria-current="selectedId === a.id ? 'true' : undefined"
          @click="selectSession(a)"
          @mouseenter="prefetchSession(a)"
          @focus="prefetchSession(a)"
        >
          <span class="rv3-thumb">
            <img v-if="mapArt(a.map)" :src="mapArt(a.map)" alt="" class="rv3-map" loading="lazy" decoding="async">
            <img v-if="a.agent && getAgentImage(a.agent)" :src="getAgentImage(a.agent)" alt="" class="rv3-agent" loading="lazy" decoding="async">
          </span>
          <span class="rv3-main">
            <span class="uf-t3 rv3-trunc">{{ a.map ? matchMapLabel(null, a.map) : 'Unknown map' }} · {{ normalizeAgentName(a.agent) || 'Unknown agent' }}</span>
            <span class="uf-t4 rv3-trunc">
              {{ formatMatchDate(playedAt(a)) }}<span v-if="kdaLine(a)"> · {{ kdaLine(a) }} K/D/A</span> · {{ sessionStatusLabel(a.status, coachReviewByAnalysisId[a.id]?.status) }}
            </span>
          </span>
          <span class="rv3-side">
            <span v-if="scoreLine(a)" class="uf-d4" :style="{ color: toneColor(resultTone(a)) }">{{ scoreLine(a) }}</span>
            <span v-else-if="resultTone(a) !== 'none'" class="uf-d4" :style="{ color: toneColor(resultTone(a)) }">{{ resultTone(a) === 'win' ? 'W' : 'L' }}</span>
            <span v-for="s in [matchScore(a)].filter(x => x != null)" :key="s.kind" class="uf-t4 rv3-num" :title="s.kind === 'stats' ? `UpForge score ${s.text} of 1000 · ${s.label}` : `Coach rating ${s.text}`">
              <span :style="{ color: s.tone ? scoreToneColor(s.tone) : 'var(--uf-bone)' }">{{ s.text }}</span> {{ s.kind === 'stats' ? 'UpForge' : 'Coach rating' }}
            </span>
          </span>
        </button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.rv3-list { width: min(420px, 38%); flex: none; min-height: 0; overflow-y: auto; border-right: 1px solid var(--uf-line); padding: 8px 0 24px; }
.rv3-group { display: flex; flex-direction: column; }
.rv3-group + .rv3-group { margin-top: 14px; }
.rv3-group-head { display: flex; align-items: baseline; justify-content: space-between; padding: 10px 24px 8px 40px; }
.rv3-row { display: flex; align-items: center; gap: 14px; width: 100%; padding: 10px 24px 10px 40px; background: none; border: 0; border-top: 1px solid var(--uf-line); text-align: left; cursor: pointer; color: inherit; }
.rv3-row:hover { background: var(--uf-hover); }
.rv3-row.is-on { background: var(--uf-raised); box-shadow: inset 2px 0 0 var(--uf-red); }
.rv3-thumb { position: relative; width: 72px; height: 40px; flex: none; overflow: hidden; background: var(--uf-raised); }
.rv3-map { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
.rv3-agent { position: absolute; right: 0; bottom: 0; height: 100%; width: auto; }
.rv3-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.rv3-trunc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
.rv3-side { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.rv3-num { font-variant-numeric: tabular-nums; }
.rv3-dot { width: 6px; height: 6px; border-radius: 3px; }
.rv3-empty { padding: 32px 24px 32px 40px; display: flex; flex-direction: column; gap: 6px; }
.rv3-loading { display: flex; flex-direction: column; }
.rv3-skel-row { display: flex; align-items: center; gap: 14px; padding: 10px 24px 10px 40px; border-top: 1px solid var(--uf-line); }
@media (max-width: 1023px) {
  .rv3-list { width: 100%; border-right: 0; }
  .rv3-list.is-collapsed { display: none; }
}
</style>
