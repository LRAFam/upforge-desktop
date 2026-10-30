<script setup lang="ts">
import StorageIndicator from '../components/shared/StorageIndicator.vue'
import LibraryPageHeader from '../components/shared/LibraryPageHeader.vue'
import CloudUsageNotice from '../components/shared/CloudUsageNotice.vue'
import { useRouter } from 'vue-router'
import { useGameTheme } from '../composables/useGameTheme'
import { footageUnavailable } from '../lib/footage-library'
import { canOpenTimeline, canWatchRawRecording } from '../lib/recording-demo-status'
import {
  recordingGameTitle,
  recordingMapImage,
  recordingMapLabel,
  recordingPlayerAccent,
  recordingPlayerImage,
  recordingPlayerLabel,
} from '../lib/recording-display'
import { formatRecordingBytes, recordingNeedsAttention } from '../lib/recording-library'
import { recordingStatusBadge } from '../lib/recording-status'
import { statusFilters, useFootageLibrary } from '../components/v3/matches/useFootageLibrary'

// All state and actions live in useFootageLibrary (shared with the UI v3 Matches screen).
const router = useRouter()
const { theme, cssVars } = useGameTheme()

defineProps<{ embedded?: boolean }>()
const statusChips = statusFilters
const {
  recordings, filtered, chipFiltered, dateGroups, gamesPresent, gameFilter, statusChip,
  loading, libraryError, cloudError, message, busyId, obsConnected, recordingsBytes,
  selecting, selectedIds, pendingDelete,
  load, loadCloud, openFolder, toggleGroup, isGroupExpanded, showMoreInGroup, groupVisibility,
  watchRecording, openBest, continueInMatches, attentionHint, toggleSelectMode, toggleSelected,
  isRecordingInFlight, deleteRecording, runDismiss, deleteSelected,
} = useFootageLibrary()

function relativeDate(ms: number): string {
  if (!ms) return ''
  const diff = Date.now() - ms
  const mins = Math.round(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden text-white" :style="cssVars">
    <LibraryPageHeader v-if="!embedded" title="Matches" description="Review your recordings, on this device or in the cloud.">
      <span>{{ chipFiltered.length }} {{ chipFiltered.length === 1 ? 'recording' : 'recordings' }}</span>
      <button type="button" class="rounded-md border border-white/15 px-3 text-gray-300 hover:border-white/30" @click="openFolder">Open folder</button>
    </LibraryPageHeader>
    <CloudUsageNotice kind="footage" />


    <div v-if="gameFilter === 'lol'" class="mx-4 mt-3 rounded-lg border border-white/10 px-4 py-3 text-sm text-gray-300">
      <p>Watch your saved League recordings here without Riot account verification.</p>
      <p class="mt-1 text-xs text-gray-400">Keep UpForge and OBS running while you play to capture gameplay. Captured-stat coaching uses only the local League snapshot, not video, rank or vision analysis. Older recordings without that snapshot remain watchable. Screenshots and .rofl replay imports are not supported.</p>
    </div>
    <nav v-if="gamesPresent.length > 0" class="flex flex-shrink-0 gap-1 overflow-x-auto scrollbar-hide border-b border-white/[0.09] bg-[#161616]/80 px-4 py-2.5">
      <button
        class="rounded-xl px-3 py-1.5 text-xs font-medium transition-colors"
        :class="gameFilter === 'all' ? `${theme.accentBg} ${theme.accentText} ring-1 ${theme.accentBorder}` : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'"
        @click="gameFilter = 'all'"
      >All games</button>
      <button
        v-for="g in gamesPresent"
        :key="g"
        class="rounded-xl px-3 py-1.5 text-xs font-medium capitalize transition-colors"
        :class="gameFilter === g ? `${theme.accentBg} ${theme.accentText} ring-1 ${theme.accentBorder}` : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'"
        @click="gameFilter = g"
      >{{ recordingGameTitle({ game: g }) }}</button>
    </nav>

    <div
      v-if="filtered.length > 0"
      class="panel-elevated mx-4 mt-3 flex flex-shrink-0 flex-wrap items-center justify-between gap-3 px-3 py-2.5"
    >
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="chip in statusChips"
          :key="chip.value"
          class="rounded-md border px-3 py-2 text-xs font-medium transition-colors"
          :class="statusChip === chip.value
            ? `${theme.accentBorder} ${theme.accentBg} ${theme.accentText}`
            : 'border-white/[0.10] text-gray-500 hover:border-white/[0.12] hover:text-gray-300'"
          :aria-pressed="statusChip === chip.value"
          @click="statusChip = chip.value"
        >
          {{ chip.label }}
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
        <span>{{ chipFiltered.length }} {{ chipFiltered.length === 1 ? 'recording' : 'recordings' }}</span>
        <span class="text-gray-800">·</span>
        <span>{{ formatRecordingBytes(recordingsBytes) }} local</span>

        <button
          type="button"
          class="rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-colors"
          :class="selecting
            ? 'border-red-500/30 bg-red-500/15 text-red-400'
            : 'border-white/[0.08] text-gray-400 hover:border-white/[0.14] hover:text-gray-200'"
          @click="toggleSelectMode"
        >
          {{ selecting ? 'Cancel' : 'Select' }}
        </button>
      </div>
    </div>

    <div class="flex-1 scroll-col px-4 py-4">
      <p v-if="cloudError" role="alert" class="mb-3 text-xs text-amber-200">{{ cloudError }} <button class="underline" @click="loadCloud">Retry cloud footage</button></p>
      <p v-if="message" class="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">{{ message }}</p>

      <div v-if="loading" class="flex h-40 items-center justify-center text-sm text-gray-500">Loading footage…</div>

      <div v-else-if="libraryError" role="alert" class="py-8 text-center text-sm text-amber-200"><p>{{ libraryError }}</p><button class="mt-3 underline" @click="load">Retry loading footage</button></div>
      <div v-else-if="!filtered.length" class="flex h-56 flex-col items-center justify-center text-center gap-2">
        <p class="text-sm font-semibold text-gray-400">No recordings in this view</p>
        <p class="text-xs text-gray-600 max-w-sm">
          {{ obsConnected === false
            ? 'Connect OBS to record new matches on this device. Cloud recordings appear here too.'
            : 'Play a match to record footage on this device, or browse your cloud recordings.' }}
        </p>
        <button type="button" class="mt-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white" @click="router.push('/cloud-storage?kind=recording')">Browse cloud footage</button>
        <button
          v-if="obsConnected === false"
          type="button"
          class="mt-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-gray-200 bg-white/[0.06] hover:bg-white/[0.1]"
          @click="router.push('/settings?tab=recording')"
        >
          Open recording settings
        </button>
      </div>

      <div v-else-if="!chipFiltered.length" class="flex h-40 flex-col items-center justify-center text-center gap-1">
        <p class="text-sm font-semibold text-gray-400">No footage matches this filter</p>
        <p class="text-xs text-gray-600">Try another status chip or clear the game filter.</p>
      </div>

      <div v-else class="space-y-4">
        <section v-for="group in dateGroups" :key="group.label">
          <div
            class="mb-2 flex cursor-pointer items-center gap-2 px-1"
            @click="toggleGroup(group.label)"
          >
            <svg
              class="h-3 w-3 flex-shrink-0 text-gray-600 transition-transform"
              :class="isGroupExpanded(group.label) ? 'rotate-90' : ''"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">{{ group.label }}</span>
            <div class="hidden h-px flex-1 bg-white/[0.05] sm:block" />
            <span class="text-[10px] text-gray-700">{{ group.items.length }}</span>
          </div>

          <template v-if="isGroupExpanded(group.label)">
            <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              <div
                v-for="rec in groupVisibility(group).shown"
                :key="rec.id"
                class="group relative overflow-hidden rounded-xl border bg-white/[0.02] transition-colors"
                :class="selecting && selectedIds.has(rec.id)
                  ? 'border-red-500/40 ring-1 ring-red-500/20'
                  : 'border-white/[0.08] hover:border-white/[0.16]'"
                @click="selecting && !rec.cloudOnly ? toggleSelected(rec.id) : undefined"
              >
                <div
                  v-if="selecting && !rec.cloudOnly"
                  class="absolute left-3 top-3 z-10 flex h-5 w-5 items-center justify-center rounded border"
                  :class="selectedIds.has(rec.id) ? 'border-red-500 bg-red-500' : 'border-white/30 bg-black/50'"
                >
                  <svg v-if="selectedIds.has(rec.id)" class="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="relative h-28 overflow-hidden bg-black/40">
                  <img
                    v-if="recordingMapImage(rec)"
                    :src="recordingMapImage(rec)"
                    :alt="recordingMapLabel(rec)"
                    class="absolute inset-0 h-full w-full object-cover opacity-40"
                  />
                  <div class="absolute inset-0 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/40 to-transparent" />
                  <div class="absolute left-3 top-3 flex items-center gap-2">
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1"
                      :class="recordingStatusBadge(rec).class"
                    >{{ footageUnavailable(rec) || recordingStatusBadge(rec).label }}</span>
                    <span
                      v-if="rec.productionFixture"
                      class="rounded-md border border-amber-500/30 bg-black/60 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-300"
                    >Production fixture</span>
                  </div>
                  <div class="absolute right-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-medium text-gray-300 capitalize">
                    {{ recordingGameTitle(rec) }}
                  </div>
                  <div class="absolute bottom-2 left-3 right-3 flex items-end gap-2">
                    <div
                      v-if="recordingPlayerImage(rec)"
                      class="h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10"
                      :style="{ backgroundColor: recordingPlayerAccent(rec) }"
                    >
                      <img :src="recordingPlayerImage(rec)" :alt="recordingPlayerLabel(rec)" class="h-full w-full object-cover" />
                    </div>
                    <div class="min-w-0">
                      <p class="truncate text-sm font-bold text-white">{{ recordingPlayerLabel(rec) }}</p>
                      <p class="truncate text-[11px] text-gray-400">{{ recordingMapLabel(rec) }}</p><StorageIndicator :cloud="!!rec.archiveId || !!rec.cloudUploaded" :local="!!rec.hasLocalFile" />
                    </div>
                  </div>
                </div>

                <div class="px-3 py-2.5">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <span class="text-[11px] text-gray-500">{{ relativeDate(rec.recordedAt) }}</span>
                      <p
                        v-if="attentionHint(rec)"
                        class="mt-0.5 truncate text-[10px] text-amber-400/90"
                        :title="attentionHint(rec) ?? undefined"
                      >
                        {{ attentionHint(rec) }}
                      </p>
                    </div>
                    <div v-if="!selecting" class="flex flex-shrink-0 items-center gap-1.5">
                      <button
                        v-if="!rec.cloudOnly && recordingNeedsAttention(rec)"
                        class="rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-gray-200 transition-colors hover:bg-white/[0.12] disabled:opacity-50"
                        :disabled="busyId === rec.id"
                        @click.stop="continueInMatches(rec)"
                      >Continue in Matches</button>
                      <button
                        v-if="rec.analysisId != null && canWatchRawRecording(rec)"
                        class="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-gray-200 hover:bg-white/10"
                        @click.stop="watchRecording(rec)"
                      >Watch</button>
                      <button
                        class="rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-50"
                        :class="`${theme.accentBg} ${theme.accentText} ring-1 ${theme.accentBorder}`"
                        :disabled="!!footageUnavailable(rec) || busyId === rec.id || (!canWatchRawRecording(rec) && rec.analysisId == null)"
                        @click.stop="openBest(rec)"
                      >{{ footageUnavailable(rec) || (rec.cloudOnly || rec.analysisId != null || canOpenTimeline(rec) ? 'Review' : 'Watch') }}</button>
                      <button
                        type="button"
                        class="rounded-lg border border-white/[0.08] p-1.5 text-gray-500 transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                        v-if="!rec.cloudOnly"
                        title="Delete recording"
                        :disabled="busyId === rec.id"
                        @click.stop="deleteRecording(rec)"
                      >
                        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button
              v-if="groupVisibility(group).hiddenCount > 0"
              type="button"
              class="mt-2 w-full rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] font-medium text-gray-500 transition-colors hover:border-white/[0.14] hover:text-gray-300"
              @click="showMoreInGroup(group.label)"
            >
              Show more ({{ groupVisibility(group).hiddenCount }})
            </button>
          </template>
        </section>
      </div>
    </div>

    <div
      v-if="selecting && selectedIds.size > 0"
      class="flex flex-shrink-0 items-center justify-center gap-3 border-t border-white/[0.08] bg-[#121212]/95 px-4 py-3 backdrop-blur-sm"
    >
      <span class="text-xs font-medium text-gray-300">{{ selectedIds.size }} selected</span>
      <span class="text-gray-700">·</span>
      <button
        type="button"
        class="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/25 disabled:opacity-50"
        :disabled="busyId === '__bulk__'"
        @click="deleteSelected"
      >
        Delete
      </button>
      <button
        type="button"
        class="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-white/[0.14] hover:text-gray-200"
        @click="toggleSelectMode"
      >
        Cancel
      </button>
    </div>

    <div
      v-if="pendingDelete?.variant === 'cloud'"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      @click.self="pendingDelete = null"
    >
      <div class="panel-elevated w-full max-w-sm rounded-xl border border-white/[0.08] p-4">
        <h2 class="text-sm font-bold text-white">Delete recording</h2>
        <p class="mt-1.5 text-xs text-gray-400">
          <template v-if="isRecordingInFlight(pendingDelete.rec)">
            This recording is still uploading or analysing. Deleting will abort the current process.
          </template>
          <template v-else>
            This recording is backed up to the cloud. Deleting the local copy also pauses automatic stats sync; Retry sync can restart it later.
          </template>
        </p>
        <div class="mt-4 flex flex-col gap-2">
          <button
            type="button"
            class="rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:bg-white/[0.04]"
            :disabled="busyId === pendingDelete.rec.id"
            @click="runDismiss(pendingDelete.rec.id, 'localOnly')"
          >
            Delete local only
          </button>
          <button
            type="button"
            class="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/25"
            :disabled="busyId === pendingDelete.rec.id"
            @click="runDismiss(pendingDelete.rec.id, 'remove')"
          >
            Remove from library
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:text-gray-300"
            :disabled="busyId === pendingDelete.rec.id"
            @click="pendingDelete = null"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
