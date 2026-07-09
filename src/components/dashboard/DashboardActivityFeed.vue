<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '../../composables/useDashboard'
import { gameBrand } from '../../lib/game-branding'
import { recordingMapLabel, recordingPlayerLabel } from '../../lib/recording-display'
import GameBrandIcon from './GameBrandIcon.vue'
import type { PrimaryGame } from '../../lib/games'
import { analysisCompleteBadge, inferAnalysisGame } from '../../lib/analysis-display'
import upforgeIcon from '../../assets/upforge-icon.png'

const { activityLog, pendingRecordings, formatLogTime, dashboardAnalyses, openAnalysisRow } = useDashboard()

type FeedScope = PrimaryGame | 'system'

type FeedEntry = {
  id: string
  scope: FeedScope
  title: string
  subtitle: string
  badge?: string
  badgeTone?: 'green' | 'blue' | 'gold' | 'gray' | 'red'
  tag?: string
  time?: number | string
  analysisId?: number
}

const TONE_CLASS = {
  green: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/20',
  blue: 'bg-blue-500/12 text-blue-300 border-blue-500/20',
  gold: 'bg-amber-500/12 text-amber-300 border-amber-500/20',
  gray: 'bg-white/[0.05] text-gray-400 border-white/[0.08]',
  red: 'bg-red-500/12 text-red-300 border-red-500/20',
} as const

function entryTimeMs(t: number | string | undefined): number {
  if (t == null) return 0
  if (typeof t === 'number') return t
  const ms = new Date(t).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

function classifyActivityScope(msg: string): FeedScope {
  const lower = msg.toLowerCase()
  if (/\bcs2\b|counter-strike|\bde_[a-z0-9_]+\b|faceit|demo recording|gsi/.test(lower)) return 'cs2'
  if (/\bdeadlock\b|-condebug|replay saving/.test(lower)) return 'deadlock'
  if (/\bvalorant\b|riot|premier queue|spikerush|vandal|pregame brief/.test(lower)) return 'valorant'
  return 'system'
}

function activityTag(msg: string): string | undefined {
  const lower = msg.toLowerCase()
  if (/update|install|restart upforge|version/.test(lower)) return 'Update'
  if (/obs|capture|recording|match detected|watching for|reopen|window capture/.test(lower)) return 'Recording'
  if (/analysis|upload|debrief|coaching|score:/.test(lower)) return 'Coaching'
  if (/clip|demo|highlight/.test(lower)) return 'Clips'
  if (classifyActivityScope(msg) === 'system') return 'App'
  return undefined
}

function activitySubtitle(msg: string): string {
  const dash = msg.match(/^[—–-]\s*(.+)$/)
  if (dash?.[1]) return dash[1].trim()
  const split = msg.split(' — ')
  if (split.length > 1) return split.slice(1).join(' — ').trim()
  return ''
}

function inferRecordingGame(map: string, agent: string): PrimaryGame {
  const blob = `${map} ${agent}`.toLowerCase()
  if (/de_|mirage|inferno|nuke|dust|anubis|ancient|overpass|vertigo/.test(blob)) return 'cs2'
  if (/deadlock|hero|oracle|lash|vindicta/.test(blob)) return 'deadlock'
  return 'valorant'
}

const entries = computed<FeedEntry[]>(() => {
  type Sortable = FeedEntry & { sortTime: number; pinned?: boolean }

  const merged: Sortable[] = []

  for (const r of pendingRecordings.value) {
    const game = (r.game ?? inferRecordingGame(r.map ?? '', r.agent ?? '')) as PrimaryGame
    const syncing = r.analysisReadiness?.state === 'syncing' || r.analysisReadiness?.state === 'finalizing'

    if (r.pipelineStatus === 'uploading' || r.pipelineStatus === 'analysing') {
      merged.push({
        id: `p-${r.id}`,
        scope: game,
        title: r.pipelineStatus === 'analysing'
          ? `${gameBrand(game).wordmark} analysis running`
          : `${gameBrand(game).wordmark} upload in progress`,
        subtitle: `${recordingPlayerLabel(r)} · ${recordingMapLabel(r)}`,
        badge: r.pipelineStatus === 'analysing' ? 'Processing' : 'Uploading',
        badgeTone: 'blue',
        tag: 'Live',
        time: r.recordedAt ?? Date.now(),
        sortTime: entryTimeMs(r.recordedAt) || Date.now(),
        pinned: true,
      })
      continue
    }

    if (syncing) {
      const title = game === 'cs2'
        ? 'CS2 match recorded — waiting for demo'
        : game === 'deadlock'
          ? 'Deadlock match recorded — waiting for replay'
          : `${gameBrand(game).wordmark} match recorded — syncing stats`
      merged.push({
        id: `sync-${r.id}`,
        scope: game,
        title,
        subtitle: r.analysisReadiness?.message
          || `${recordingPlayerLabel(r)} · ${recordingMapLabel(r)}`,
        badge: r.analysisReadiness?.state === 'finalizing' ? 'Finalizing' : 'Syncing',
        badgeTone: 'blue',
        tag: 'Recording',
        time: r.recordedAt ?? Date.now(),
        sortTime: entryTimeMs(r.recordedAt) || Date.now(),
        pinned: true,
      })
    }
  }

  for (const a of dashboardAnalyses.value) {
    const game = inferAnalysisGame(a)
    merged.push({
      id: `a-${a.id}`,
      scope: game,
      title: `${gameBrand(game).wordmark} analysis complete`,
      subtitle: `Analyzed match on ${a.map || 'unknown map'}`,
      badge: analysisCompleteBadge(game, a.overall_score),
      badgeTone: 'green',
      tag: 'Coaching',
      time: a.created_at,
      sortTime: entryTimeMs(a.created_at),
      analysisId: a.id,
    })
  }

  for (const [i, e] of activityLog.value.entries()) {
    const scope = classifyActivityScope(e.message)
    const tag = activityTag(e.message)
    merged.push({
      id: `l-${e.time}-${i}`,
      scope,
      title: e.message.split(' — ')[0]?.trim() || e.message,
      subtitle: activitySubtitle(e.message),
      tag,
      badgeTone: tag === 'Update' ? 'gold' : tag === 'Recording' ? 'blue' : 'gray',
      time: e.time,
      sortTime: entryTimeMs(e.time),
    })
  }

  return merged
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.sortTime - a.sortTime
    })
    .slice(0, 8)
    .map(({ sortTime: _sortTime, pinned: _pinned, ...entry }) => entry)
})

function formatTime(t: number | string | undefined): string {
  if (t == null) return ''
  const ms = entryTimeMs(t)
  if (!ms) return ''
  const diff = Date.now() - ms
  if (diff < 45_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`
  if (diff < 86_400_000) return formatLogTime(ms)
  if (diff < 172_800_000) return 'Yesterday'
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function openEntry(e: FeedEntry) {
  if (e.analysisId == null) return
  const row = dashboardAnalyses.value.find(a => a.id === e.analysisId)
  if (row) void openAnalysisRow(row)
}
</script>

<template>
  <div class="dash-panel overflow-hidden flex flex-col h-full min-h-0">
    <div class="px-4 py-2.5 border-b border-white/[0.07] flex items-center justify-between flex-shrink-0">
      <span class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">Activity</span>
      <span v-if="entries.length" class="text-[10px] font-semibold text-gray-600 tabular-nums">{{ entries.length }} recent</span>
    </div>

    <ul v-if="entries.length" class="divide-y divide-white/[0.05] flex-1 min-h-0 overflow-y-auto scroll-col">
      <li
        v-for="e in entries"
        :key="e.id"
        class="px-4 py-2.5 flex items-center gap-2.5 transition-colors"
        :class="e.analysisId != null ? 'hover:bg-white/[0.03] cursor-pointer' : 'hover:bg-white/[0.02]'"
        @click="openEntry(e)"
      >
        <div
          class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border bg-black/30"
          :class="e.tag === 'Live' ? 'border-blue-500/25' : 'border-white/[0.08]'"
        >
          <img
            v-if="e.scope === 'system'"
            :src="upforgeIcon"
            alt=""
            class="h-[18px] w-[18px] object-contain"
          />
          <GameBrandIcon v-else :game="e.scope" :active="true" size="md" />
        </div>

        <div class="flex-1 min-w-0">
          <p class="text-[12px] font-semibold text-gray-100 leading-snug truncate">{{ e.title }}</p>
          <p v-if="e.subtitle" class="text-[10px] text-gray-500 mt-0.5 truncate">{{ e.subtitle }}</p>
          <div v-if="e.badge || e.tag" class="flex flex-wrap items-center gap-1 mt-1">
            <span
              v-if="e.badge"
              class="text-[9px] font-bold px-2 py-0.5 rounded-full border"
              :class="TONE_CLASS[e.badgeTone ?? 'gray']"
            >{{ e.badge }}</span>
            <span
              v-if="e.tag"
              class="text-[9px] font-semibold px-2 py-0.5 rounded-full border"
              :class="e.tag === 'Live'
                ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                : e.tag === 'Update'
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                  : 'bg-white/[0.04] text-gray-500 border-white/[0.06]'"
            >{{ e.tag }}</span>
          </div>
        </div>

        <span v-if="e.time" class="text-[10px] text-gray-500 tabular-nums whitespace-nowrap flex-shrink-0">{{ formatTime(e.time) }}</span>
      </li>
    </ul>

    <p v-else class="flex-1 flex items-center justify-center px-4 text-[12px] text-gray-600">
      Activity will show here after matches, uploads, and app events.
    </p>
  </div>
</template>
