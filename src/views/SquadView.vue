<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import SquadBriefingHero from '../components/squad/SquadBriefingHero.vue'
import SquadStatsStrip from '../components/squad/SquadStatsStrip.vue'
import SquadLineupRow from '../components/squad/SquadLineupRow.vue'
import type { SquadLineupMember } from '../components/squad/SquadLineupRow.vue'
import SquadMemberPanel from '../components/squad/SquadMemberPanel.vue'
import type { SquadMemberStat } from '../components/squad/SquadMemberPanel.vue'
import SquadInviteRail from '../components/squad/SquadInviteRail.vue'
import SquadActivityCards from '../components/squad/SquadActivityCards.vue'
import SquadActivityFeed from '../components/squad/SquadActivityFeed.vue'
import SquadPersonalPanel from '../components/squad/SquadPersonalPanel.vue'
import SquadLiveRecording from '../components/squad/SquadLiveRecording.vue'
import SquadMemberCompare from '../components/squad/SquadMemberCompare.vue'
import SquadContributions from '../components/squad/SquadContributions.vue'
import type { SquadActivityItem } from '../components/squad/SquadActivityCards.vue'
import {
  squadPlanBadgeClass,
  squadPlanBadgeLabel,
  squadMaxMembers,
  squadWeekActivityCount,
  squadWeekRecord,
  squadGameMixCounts,
  squadActivityUrl,
  buildSquadCompareRows,
} from '../lib/squad-ui'

interface Team {
  name: string
  plan?: string
  max_members?: number
  credits_remaining?: number
  credits_total?: number
  invite_code?: string
  members: SquadLineupMember[]
}

interface PresenceEntry {
  online: boolean
  is_recording: boolean
  game?: string | null
}

interface AnalysisItem {
  id: number
  map?: string | null
  agent?: string | null
  won?: boolean | null
  overall_score?: number | null
  created_at: string
}

interface ClipItem {
  id: string
  trigger: string
  map?: string | null
  thumbPath?: string | null
  durationSeconds?: number | null
}

const team = ref<Team | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const squadError = ref<string | null>(null)
const presence = ref<Record<number, PresenceEntry>>({})
const activity = ref<SquadActivityItem[]>([])
const memberStats = ref<SquadMemberStat[]>([])
const leaderboard = ref<Array<{ user_id: number; name: string; analyses_count?: number }>>([])
const recentAnalyses = ref<AnalysisItem[]>([])
const recentClips = ref<ClipItem[]>([])
const pendingInvites = ref<Array<{ value: string; createdAt: number }>>(loadPendingInvites())
const selectedMemberId = ref<number | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null

const maxSlots = computed(() =>
  team.value ? squadMaxMembers(team.value.plan, team.value.max_members) : 4,
)

const onlineMembers = computed(() =>
  team.value?.members.filter(m => {
    const p = presence.value[m.id]
    return p?.online || p?.is_recording
  }).length ?? 0,
)

const recordingMembers = computed(() =>
  team.value?.members.filter(m => presence.value[m.id]?.is_recording).length ?? 0,
)

const weekActivityCount = computed(() => squadWeekActivityCount(activity.value))

const weekRecord = computed(() => squadWeekRecord(activity.value))

const gameMix = computed(() => squadGameMixCounts(presence.value))

const recordingMemberEntries = computed(() => {
  if (!team.value) return []
  return team.value.members
    .filter(m => presence.value[m.id]?.is_recording)
    .map(m => ({ member: m, presence: presence.value[m.id]! }))
})

const compareRows = computed(() => buildSquadCompareRows(memberStats.value, leaderboard.value))

const briefingHeadline = computed(() => {
  if (recordingMembers.value > 0) {
    const n = recordingMembers.value
    return `${n} teammate${n === 1 ? '' : 's'} recording now`
  }
  if (weekActivityCount.value > 0) {
    return `${weekActivityCount.value} squad ${weekActivityCount.value === 1 ? 'analysis' : 'analyses'} this week`
  }
  return 'Your squad hub'
})

const briefingSubline = computed(() => {
  if (recordingMembers.value > 0) return 'Live captures will show up in squad activity when they finish.'
  if (weekActivityCount.value > 0) return 'Review recent matches from your roster below.'
  return 'Invite teammates, share credits, and track cross-game activity together.'
})

const sortedMembers = computed(() => {
  if (!team.value) return []
  return [...team.value.members].sort((a, b) => {
    const rank = (id: number) => {
      const p = presence.value[id]
      if (p?.is_recording) return 2
      if (p?.online) return 1
      return 0
    }
    return rank(b.id) - rank(a.id)
  })
})

const selectedMember = computed(() =>
  team.value?.members.find(m => m.id === selectedMemberId.value) ?? null,
)

const selectedMemberStats = computed(() =>
  memberStats.value.find(s => s.user_id === selectedMemberId.value) ?? null,
)

const feedItems = computed(() => activity.value.slice(0, 15))

function memberIndex(userId: number): number {
  return team.value?.members.findIndex(m => m.id === userId) ?? 0
}

function memberName(userId: number): string {
  return team.value?.members.find(m => m.id === userId)?.name ?? 'Unknown'
}

function selectMember(member: SquadLineupMember) {
  selectedMemberId.value = selectedMemberId.value === member.id ? null : member.id
}

function loadPendingInvites(): Array<{ value: string; createdAt: number }> {
  try {
    const raw = localStorage.getItem('upforge-squad-pending-invites')
    return raw ? JSON.parse(raw) as Array<{ value: string; createdAt: number }> : []
  } catch {
    return []
  }
}

function persistPendingInvites() {
  localStorage.setItem('upforge-squad-pending-invites', JSON.stringify(pendingInvites.value.slice(0, 5)))
}

async function load() {
  loading.value = true
  squadError.value = null
  try {
    window.api.squad.syncPresence().catch(() => {})

    const [result, analyses, clipsResult] = await Promise.all([
      window.api.squad.getTeam(),
      window.api.analyses.get(7).catch(() => []),
      window.api.clips.get().catch(() => []),
    ])

    if (result?.error && !result.team) {
      squadError.value = result.error
      team.value = null
    } else if (result?.team) {
      team.value = result.team as Team
      activity.value = (result.activity as SquadActivityItem[]) ?? []
      memberStats.value = (result.stats as SquadMemberStat[]) ?? []
      leaderboard.value = result.leaderboard ?? []
      if (result.presence) presence.value = result.presence as Record<number, PresenceEntry>
    } else {
      team.value = null
    }

    recentAnalyses.value = (analyses as AnalysisItem[]) ?? []
    const allClips = (Array.isArray(clipsResult) ? clipsResult : []) as ClipItem[]
    recentClips.value = allClips.filter(c => c.thumbPath || c.id).slice(0, 6)
  } catch {
    squadError.value = 'Failed to connect to UpForge servers'
    team.value = null
  } finally {
    loading.value = false
  }
}

async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    window.api.squad.syncPresence().catch(() => {})
    const result = await window.api.squad.getTeam()
    if (result?.presence) presence.value = result.presence as Record<number, PresenceEntry>
    if (result?.activity) activity.value = result.activity as SquadActivityItem[]
    if (result?.stats) memberStats.value = result.stats as SquadMemberStat[]
    if (result?.leaderboard) leaderboard.value = result.leaderboard
    if (result?.team) team.value = result.team as Team
  } catch { /* ignore */ } finally {
    refreshing.value = false
  }
}

function submitInvite(value: string) {
  pendingInvites.value = [{ value, createdAt: Date.now() }, ...pendingInvites.value.filter(i => i.value !== value)].slice(0, 5)
  persistPendingInvites()
  openWebTeam(value)
}

function removePendingInvite(value: string) {
  pendingInvites.value = pendingInvites.value.filter(i => i.value !== value)
  persistPendingInvites()
}

function openWebTeam(inviteValue?: string) {
  const target = inviteValue?.trim() ?? ''
  const url = target ? `https://upforge.gg/team?invite=${encodeURIComponent(target)}` : 'https://upforge.gg/team'
  window.open(url, '_blank')
}

function openActivityItem(item: SquadActivityItem) {
  const url = squadActivityUrl(item)
  if (url) window.open(url, '_blank')
}

onMounted(() => {
  load()
  pollTimer = setInterval(() => {
    window.api.squad.syncPresence().catch(() => {})
    refresh()
  }, 30000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  window.api.squad.sendPresence(false, null).catch(() => {})
})
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden bg-[#0a0a0a] text-white">
    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <div class="w-7 h-7 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>

    <template v-else-if="squadError">
      <div class="flex flex-1 items-center justify-center p-6">
        <div class="dash-panel max-w-md w-full px-6 py-10 text-center">
          <h2 class="text-base font-bold text-white">Couldn't load squad</h2>
          <p class="text-xs text-gray-500 mt-2">{{ squadError }}</p>
          <div class="flex justify-center gap-2 mt-5">
            <button class="px-4 py-2 rounded-lg border border-white/[0.10] text-xs font-semibold text-gray-300" @click="load">Retry</button>
            <button class="px-4 py-2 rounded-lg border border-red-500/25 bg-red-500/10 text-xs font-semibold text-red-400" @click="openWebTeam()">Open website</button>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="!team">
      <div class="flex flex-1 items-center justify-center p-6">
        <div class="dash-panel max-w-md w-full px-6 py-10 text-center relative overflow-hidden">
          <div class="absolute -top-16 -left-16 h-40 w-40 rounded-full bg-red-500/10 blur-3xl pointer-events-none" />
          <h2 class="relative text-base font-bold text-white">No squad yet</h2>
          <p class="relative text-xs text-gray-500 mt-2">Create or join a squad on UpForge — works for Valorant, CS2, and Deadlock teams.</p>
          <button class="relative mt-5 px-4 py-2 rounded-lg border border-red-500/25 bg-red-500/10 text-xs font-semibold text-red-400" @click="openWebTeam()">Open on website</button>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="flex-shrink-0 px-5 pt-4 pb-3 space-y-3">
        <div class="dash-panel px-4 py-3 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-base font-black text-white truncate">{{ team.name }}</h1>
              <span class="px-1.5 py-0.5 text-[10px] font-bold rounded" :class="squadPlanBadgeClass(team.plan)">
                {{ squadPlanBadgeLabel(team.plan) }}
              </span>
            </div>
            <p class="text-[11px] text-gray-500 mt-0.5">Cross-game squad · Valorant, CS2, Deadlock</p>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.04]"
              :class="{ 'animate-spin': refreshing }"
              title="Refresh"
              @click="refresh"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <button type="button" class="px-3 py-1.5 rounded-lg border border-white/[0.10] text-[11px] font-semibold text-gray-400 hover:text-white" @click="openWebTeam()">Website</button>
          </div>
        </div>

        <SquadBriefingHero
          :headline="briefingHeadline"
          :subline="briefingSubline"
          :recording-count="recordingMembers"
          :week-activity-count="weekActivityCount"
          :week-wins="weekRecord.wins"
          :week-losses="weekRecord.losses"
        />

        <SquadLiveRecording
          v-if="recordingMemberEntries.length"
          :members="recordingMemberEntries"
          :member-index="memberIndex"
          @select="selectMember"
        />

        <SquadStatsStrip
          :credits-remaining="team.credits_remaining ?? null"
          :credits-total="team.credits_total ?? null"
          :online-count="onlineMembers"
          :member-count="team.members.length"
          :game-mix="gameMix"
        />

        <SquadLineupRow
          :members="sortedMembers"
          :max-slots="maxSlots"
          :presence="presence"
          :member-index="memberIndex"
          :selected-id="selectedMemberId"
          @invite="openWebTeam()"
          @select="selectMember"
        />

        <SquadMemberPanel
          v-if="selectedMember"
          :member="selectedMember"
          :member-index="memberIndex(selectedMember.id)"
          :presence="presence[selectedMember.id]"
          :stats="selectedMemberStats"
          @close="selectedMemberId = null"
        />
      </div>

      <div class="flex-1 min-h-0 px-5 pb-4 grid grid-cols-[minmax(0,1fr)_minmax(220px,260px)] gap-4">
        <div class="flex flex-col gap-3 min-h-0 overflow-y-auto scroll-col">
          <div v-if="activity.length">
            <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500 mb-2 px-0.5">Recent squad matches</p>
            <SquadActivityCards
              :items="activity"
              :member-name="memberName"
              :member-index="memberIndex"
              @open="openActivityItem"
            />
          </div>
          <SquadActivityFeed
            :items="feedItems"
            :member-name="memberName"
            :member-index="memberIndex"
            @open="openActivityItem"
            @view-all="openWebTeam()"
          />
          <SquadMemberCompare
            v-if="compareRows.length"
            :rows="compareRows"
            :member-index="memberIndex"
          />
          <SquadPersonalPanel :analyses="recentAnalyses" :clips="recentClips" />
        </div>

        <aside class="min-h-0 overflow-y-auto scroll-col space-y-3">
          <SquadContributions
            v-if="leaderboard.length"
            :entries="leaderboard"
            :member-index="memberIndex"
          />
          <SquadInviteRail
            :pending-invites="pendingInvites"
            :credits-remaining="team.credits_remaining ?? null"
            :credits-total="team.credits_total ?? null"
            :invite-code="team.invite_code ?? null"
            @invite="submitInvite"
            @remove-pending="removePendingInvite"
            @manage="openWebTeam()"
          />
        </aside>
      </div>
    </template>
  </div>
</template>
