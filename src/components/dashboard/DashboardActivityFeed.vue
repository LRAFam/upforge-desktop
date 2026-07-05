<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '../../composables/useDashboard'
import { gameBrand } from '../../lib/game-branding'
import GameBrandIcon from './GameBrandIcon.vue'
import type { PrimaryGame } from '../../lib/games'

const { activityLog, pendingRecordings, formatLogTime, dashboardAnalyses, openAnalysisRow } = useDashboard()

type FeedEntry = {
  id: string
  game: PrimaryGame
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

function inferGame(msg: string): PrimaryGame {
  if (/cs2|demo|mirage|de_|faceit|premier/i.test(msg)) return 'cs2'
  if (/deadlock|replay|hero|oracle/i.test(msg)) return 'deadlock'
  return 'valorant'
}

function entryTimeMs(t: number | string | undefined): number {
  if (t == null) return 0
  if (typeof t === 'number') return t
  const ms = new Date(t).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

const entries = computed<FeedEntry[]>(() => {
  type Sortable = FeedEntry & { sortTime: number; pinned?: boolean }

  const merged: Sortable[] = []

  for (const r of pendingRecordings.value) {
    if (r.pipelineStatus !== 'uploading' && r.pipelineStatus !== 'analysing') continue
    const game = inferGame(`${r.map} ${r.agent}`)
    merged.push({
      id: `p-${r.id}`,
      game,
      title: r.pipelineStatus === 'analysing'
        ? `${gameBrand(game).wordmark} analysis running`
        : `${gameBrand(game).wordmark} upload in progress`,
      subtitle: `${r.agent || 'Match'} · ${r.map || 'Unknown map'}`,
      badge: r.pipelineStatus === 'analysing' ? 'Processing' : 'Uploading',
      badgeTone: 'blue',
      tag: 'Live',
      time: r.recordedAt ?? Date.now(),
      sortTime: entryTimeMs(r.recordedAt) || Date.now(),
      pinned: true,
    })
  }

  for (const a of dashboardAnalyses.value) {
    const game = inferGame(`${a.game_mode ?? ''} ${a.map ?? ''} ${a.agent ?? ''}`)
    merged.push({
      id: `a-${a.id}`,
      game,
      title: `${gameBrand(game).wordmark} analysis complete`,
      subtitle: `Analyzed match on ${a.map || 'unknown map'}`,
      badge: a.overall_score != null ? `+${Math.round(a.overall_score * 2)} RR` : undefined,
      badgeTone: 'green',
      tag: 'Performance',
      time: a.created_at,
      sortTime: entryTimeMs(a.created_at),
      analysisId: a.id,
    })
  }

  for (const [i, e] of activityLog.value.entries()) {
    merged.push({
      id: `l-${e.time}-${i}`,
      game: inferGame(e.message),
      title: e.message.split('·')[0]?.trim() || e.message,
      subtitle: e.message.includes('·') ? e.message.split('·').slice(1).join('·').trim() : 'System update',
      tag: 'Update',
      badgeTone: 'gray',
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
    .slice(0, 6)
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
      <span class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">Cross-game activity</span>
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
          <GameBrandIcon :game="e.game" :active="true" size="md" />
        </div>

        <div class="flex-1 min-w-0">
          <p class="text-[12px] font-semibold text-gray-100 leading-snug truncate">{{ e.title }}</p>
          <p class="text-[10px] text-gray-500 mt-0.5 truncate">{{ e.subtitle }}</p>
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
                : 'bg-white/[0.04] text-gray-500 border-white/[0.06]'"
            >{{ e.tag }}</span>
          </div>
        </div>

        <span v-if="e.time" class="text-[10px] text-gray-500 tabular-nums whitespace-nowrap flex-shrink-0">{{ formatTime(e.time) }}</span>
      </li>
    </ul>

    <p v-else class="flex-1 flex items-center justify-center px-4 text-[12px] text-gray-600">
      Activity will show here after matches and uploads.
    </p>
  </div>
</template>
