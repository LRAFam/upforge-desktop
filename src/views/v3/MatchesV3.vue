<script setup lang="ts">
/**
 * UI v3 · Matches (board 17). Every recording on this PC and in the cloud as hairline rows,
 * grouped by day, filtered by game and status. Coaching reviews keep their existing view for now.
 */
import { computed, ref, watch } from 'vue'
import type { AnalysisItem } from '../../env.d.ts'
import { loadGameAnalyses } from '../../lib/game-modules'
import type { PrimaryGame } from '../../lib/games'
import { useRoute, useRouter } from 'vue-router'
import MatchesTabsV3 from '../../components/v3/matches/MatchesTabsV3.vue'
import MatchRowV3 from '../../components/v3/matches/MatchRowV3.vue'
import { statusFilters, useFootageLibrary } from '../../components/v3/matches/useFootageLibrary'
import UfButton from '../../components/v3/UfButton.vue'
import UfSkeleton from '../../components/v3/UfSkeleton.vue'
import UfDialog from '../../components/v3/UfDialog.vue'
import UfTabs from '../../components/v3/UfTabs.vue'
import CoachingHistoryView from '../CoachingHistoryView.vue'
import CloudUsageNotice from '../../components/shared/CloudUsageNotice.vue'
import { recordingGameTitle } from '../../lib/recording-display'
import { formatRecordingBytes } from '../../lib/recording-library'

const route = useRoute()
const router = useRouter()
const coaching = computed(() => route.query.view === 'coaching')
// Confirmations go through UfDialog in v3 (the old screen keeps the native dialog).
const confirmState = ref<{ text: string; resolve: (ok: boolean) => void } | null>(null)
function askConfirm(text: string): Promise<boolean> {
  confirmState.value?.resolve(false)
  return new Promise(resolve => { confirmState.value = { text, resolve } })
}
function answerConfirm(ok: boolean) {
  const state = confirmState.value
  confirmState.value = null
  state?.resolve(ok)
}
const lib = useFootageLibrary({ confirm: askConfirm })
const {
  filtered, chipFiltered, dateGroups, gamesPresent, gameFilter, statusChip, accountFilter, hasAltRows, loading, cloudLoading, libraryError, cloudError,
  message, busyId, obsConnected, recordingsBytes, selecting, selectedIds, pendingDelete,
} = lib

// Scores for analysed rows whose own timeline has none: the server's analysis of the same match, joined by id.
const analysisById = ref(new Map<number, AnalysisItem>())
const ANALYSIS_GAMES: readonly PrimaryGame[] = ['valorant', 'cs2', 'deadlock', 'lol']
watch(() => [...new Set(filtered.value.filter(r => r.analysisId != null).map(r => r.game))].sort().join(','), async (games) => {
  for (const game of games.split(',').filter((g): g is PrimaryGame => (ANALYSIS_GAMES as readonly string[]).includes(g))) {
    try {
      const rows = await loadGameAnalyses(game, 50)
      const next = new Map(analysisById.value)
      for (const a of rows) next.set(a.id, a)
      analysisById.value = next
    } catch { /* score stays from the timeline */ }
  }
}, { immediate: true })

const gameItems = computed(() => [
  { key: 'all', label: 'All games' },
  ...gamesPresent.value.map(g => ({ key: g, label: recordingGameTitle({ game: g }) })),
])
const statusItems = statusFilters.map(s => ({ key: s.value, label: s.label }))
const accountItems = [{ key: 'all', label: 'All accounts' }, { key: 'main', label: 'Main' }, { key: 'alt', label: 'Alts' }]
function setStatus(key: string) {
  const match = statusFilters.find(s => s.value === key)
  if (match) statusChip.value = match.value
}

const countLine = computed(() => {
  if (coaching.value) return ''
  const n = chipFiltered.value.length
  return `${n} ${n === 1 ? 'recording' : 'recordings'} · ${formatRecordingBytes(recordingsBytes.value)} on this PC`
})
</script>

<template>
  <div class="uf-matches">
    <MatchesTabsV3 :active="coaching ? 'coaching' : 'matches'" :title="coaching ? 'Coaching reviews' : 'All matches'" :count="countLine">
      <button v-if="!coaching" type="button" class="uf-link" @click="lib.openFolder()">Open folder</button>
      <button type="button" class="uf-link" @click="router.push('/cloud-storage')">Manage storage</button>
    </MatchesTabsV3>

    <CoachingHistoryView v-if="coaching" embedded />

    <template v-else>
      <CloudUsageNotice kind="footage" />
      <div v-if="filtered.length > 0 || gamesPresent.length > 0" class="uf-filters">
        <UfTabs :items="gameItems" :model-value="gameFilter" size="filter" label="Game" @update:model-value="gameFilter = $event" />
        <UfTabs v-if="hasAltRows" :items="accountItems" :model-value="accountFilter" size="filter" label="Account" @update:model-value="accountFilter = $event as 'all' | 'main' | 'alt'" />
        <div class="uf-filter-row">
          <UfTabs :items="statusItems" :model-value="statusChip" size="filter" label="Status" @update:model-value="setStatus" />
          <span style="flex: 1" />
          <button type="button" class="uf-link" @click="lib.toggleSelectMode()">{{ selecting ? 'Cancel' : 'Select' }}</button>
        </div>
      </div>

      <div v-if="gameFilter === 'lol'" class="uf-note">
        <p class="uf-t3" style="margin: 0">Watch your saved League recordings here without Riot account verification.</p>
        <p class="uf-t4" style="margin: 4px 0 0">Keep UpForge and OBS running while you play to capture gameplay. Video review watches up to 3 short clips from your recording alongside the captured League stats. Riot stats coaching (lane CS and gold vs your opponent, deaths, objectives, vision) is separate and appears on the match page. Screenshots and .rofl replay imports are not supported.</p>
      </div>

      <div class="uf-body">
        <p v-if="cloudError" role="alert" class="uf-t4 uf-msg">{{ cloudError }} <button type="button" class="uf-link" @click="lib.loadCloud()">Retry cloud footage</button></p>
        <p v-if="message" class="uf-t4 uf-msg" role="status">{{ message }}</p>

        <div v-if="loading || (cloudLoading && !filtered.length)" class="uf-skel-rows" role="status" aria-label="Loading matches">
          <div v-for="i in 6" :key="i" class="uf-skel-row">
            <UfSkeleton :w="120" :h="62" />
            <UfSkeleton :w="22" :h="16" />
            <span class="uf-skel-who"><UfSkeleton :w="36" :h="36" /><UfSkeleton :lines="2" :w="'70%'" /></span>
            <UfSkeleton :w="70" :h="26" />
            <UfSkeleton :w="'60%'" :h="14" />
            <UfSkeleton :w="72" :h="32" />
          </div>
        </div>
        <div v-else-if="libraryError" role="alert" class="uf-state">
          <p class="uf-t3">{{ libraryError }}</p>
          <UfButton variant="secondary" @click="lib.load()">Retry loading footage</UfButton>
        </div>
        <div v-else-if="!filtered.length" class="uf-empty">
          <p class="uf-t1" style="margin: 0">No matches yet</p>
          <p class="uf-t2" style="margin: 0; max-width: 520px">
            {{ obsConnected === false
              ? 'Connect OBS to record new matches on this device. Cloud recordings appear here too.'
              : 'Play a match to record footage on this device, or browse your cloud recordings.' }}
          </p>
          <div style="display: flex; gap: 12px; align-items: center">
            <UfButton variant="primary" icon="matches" @click="router.push('/cloud-storage?kind=recording')">Browse cloud footage</UfButton>
            <UfButton v-if="obsConnected === false" variant="secondary" icon="settings" @click="router.push('/settings?tab=recording')">Open recording settings</UfButton>
          </div>
        </div>
        <div v-else-if="!chipFiltered.length" class="uf-state">
          <p class="uf-t3">No footage matches this filter</p>
          <p class="uf-t4">Try another status or clear the game filter.</p>
        </div>

        <div v-else class="uf-groups">
          <section v-for="(group, gi) in dateGroups" :key="group.label" class="uf-group uf-rise" :class="`uf-d${Math.min(gi + 1, 6)}s`">
            <button type="button" class="uf-group-head" :aria-expanded="lib.isGroupExpanded(group.label)" @click="lib.toggleGroup(group.label)">
              <span class="uf-label">{{ group.label }}</span>
              <span class="uf-t4">{{ group.items.length }}</span>
            </button>
            <template v-if="lib.isGroupExpanded(group.label)">
              <MatchRowV3
                v-for="rec in lib.groupVisibility(group).shown"
                :key="rec.id"
                :rec="rec"
                :busy="busyId === rec.id"
                :selecting="selecting"
                :selected="selectedIds.has(rec.id)"
                :hint="lib.attentionHint(rec)"
                :analysis="rec.analysisId != null ? analysisById.get(rec.analysisId) ?? null : null"
                @open="lib.openBest(rec)"
                @prefetch="lib.prefetchRow(rec)"
                @watch="lib.watchRecording(rec)"
                @continue="lib.continueInMatches(rec)"
                @delete="lib.deleteRecording(rec)"
                @toggle="lib.toggleSelected(rec.id)"
              />
              <button v-if="lib.groupVisibility(group).hiddenCount > 0" type="button" class="uf-link uf-more" @click="lib.showMoreInGroup(group.label)">
                Show {{ lib.groupVisibility(group).hiddenCount }} more
              </button>
            </template>
          </section>
        </div>
      </div>

      <div v-if="selecting && selectedIds.size > 0" class="uf-bulk">
        <span class="uf-t3">{{ selectedIds.size }} selected</span>
        <UfButton variant="secondary" :disabled="busyId === '__bulk__'" @click="lib.deleteSelected()">Delete</UfButton>
        <button type="button" class="uf-link" @click="lib.toggleSelectMode()">Cancel</button>
      </div>

      <UfDialog :open="pendingDelete?.variant === 'cloud'" title="Delete recording" :width="460" @close="pendingDelete = null">
        <p v-if="pendingDelete" class="uf-t2" style="margin: 0">
            <template v-if="lib.isRecordingInFlight(pendingDelete.rec)">This recording is still uploading or analysing. Deleting will abort the current process.</template>
            <template v-else>This recording is backed up to the cloud. Deleting the local copy also pauses automatic stats sync; Retry sync can restart it later.</template>
        </p>
        <template v-if="pendingDelete" #actions>
          <button type="button" class="uf-link" :disabled="busyId === pendingDelete.rec.id" @click="pendingDelete = null">Cancel</button>
          <UfButton variant="secondary" :disabled="busyId === pendingDelete.rec.id" @click="lib.runDismiss(pendingDelete.rec.id, 'localOnly')">Delete local only</UfButton>
          <button type="button" class="uf-btn-secondary uf-danger" :disabled="busyId === pendingDelete.rec.id" @click="lib.runDismiss(pendingDelete.rec.id, 'remove')">Remove from library</button>
        </template>
      </UfDialog>

      <UfDialog :open="!!confirmState" title="Are you sure?" :width="460" @close="answerConfirm(false)">
        <p class="uf-t2" style="margin: 0">{{ confirmState?.text }}</p>
        <template #actions>
          <button type="button" class="uf-link" @click="answerConfirm(false)">Cancel</button>
          <button type="button" class="uf-btn-secondary uf-danger" @click="answerConfirm(true)">Delete</button>
        </template>
      </UfDialog>
    </template>
  </div>
</template>

<style scoped>
/* Same grid as MatchRowV3 so rows replace their skeletons without moving. */
.uf-skel-rows { display: flex; flex-direction: column; }
.uf-skel-row { display: grid; grid-template-columns: 120px 22px minmax(0, 1.4fr) 120px minmax(0, 1fr) auto; gap: 18px; align-items: center; padding: 10px 0; border-top: 1px solid var(--uf-line); }
.uf-skel-who { display: flex; gap: 12px; align-items: center; min-width: 0; }
.uf-matches { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; background: var(--uf-bg); }
.uf-filters { flex: none; display: flex; flex-direction: column; gap: 12px; padding: 18px 40px 6px; }
.uf-filter-row { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }
.uf-note { margin: 12px 40px 0; padding: 12px 0; border-top: 1px solid var(--uf-line); border-bottom: 1px solid var(--uf-line); }
.uf-body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 40px 32px; }
.uf-msg { margin: 10px 0; color: var(--uf-gold); }
.uf-state { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; padding: 40px 0; }
.uf-empty { display: flex; flex-direction: column; gap: 16px; align-items: flex-start; padding: 56px 0; }
.uf-groups { display: flex; flex-direction: column; gap: 26px; padding-top: 12px; }
.uf-group-head { width: 100%; display: flex; justify-content: space-between; align-items: baseline; background: none; border: 0; padding: 0 0 10px; cursor: pointer; }
.uf-more { margin-top: 12px; }
.uf-bulk { flex: none; display: flex; align-items: center; justify-content: center; gap: 18px; padding: 12px 40px; border-top: 1px solid var(--uf-line); background: var(--uf-chrome); }
.uf-danger { color: var(--uf-loss); border-color: rgba(232, 80, 91, 0.5); }
</style>
