<script setup lang="ts">
/**
 * Squad (UI v3): the paid team plan (API `Team`, web /team). Not coach rosters — those are Coaches (/rosters).
 * Pure view: SquadView keeps all data loading, polling and presence;
 * this renders it to the rulebook (docs/design/ui-v3.md · board 24).
 */
import { computed, ref } from 'vue'
import UfButton from '../../components/v3/UfButton.vue'
import UfIcon from '../../components/v3/UfIcon.vue'
import UfSkeleton from '../../components/v3/UfSkeleton.vue'
import UfStatRow from '../../components/v3/UfStatRow.vue'
import { gameMixLabel, initial, pctLabel, presenceLabel, presenceTone } from '../../components/v3/squad/squad-format'
import type { SquadActivityItem } from '../../components/squad/SquadActivityCards.vue'
import type { SquadLineupMember, SquadPresenceEntry } from '../../components/squad/SquadLineupRow.vue'
import type { SquadMemberStat } from '../../components/squad/SquadMemberPanel.vue'
import { squadGameMixCounts, squadPlanBadgeLabel, squadTimeAgo, type SquadCompareRow } from '../../lib/squad-ui'
import { formatMapLabel } from '../../lib/valorant'
import { plural } from '../../lib/plural'

interface Team {
  name: string
  plan?: string
  credits_remaining?: number
  credits_total?: number
  invite_code?: string
  members: SquadLineupMember[]
}

const props = defineProps<{
  loading: boolean
  refreshing: boolean
  squadError: string | null
  team: Team | null
  members: SquadLineupMember[]
  maxSlots: number
  presence: Record<number, SquadPresenceEntry>
  onlineMembers: number
  weekActivityCount: number
  weekRecord: { wins: number; losses: number }
  briefingHeadline: string
  briefingSubline: string
  activity: SquadActivityItem[]
  compareRows: SquadCompareRow[]
  leaderboard: Array<{ user_id: number; name: string; analyses_count?: number }>
  pendingInvites: Array<{ value: string; createdAt: number }>
  selectedMemberId: number | null
  selectedMemberStats: SquadMemberStat | null
  memberName: (userId: number) => string
}>()

const emit = defineEmits<{
  retry: []
  refresh: []
  openWeb: []
  invite: [value: string]
  removePending: [value: string]
  select: [member: SquadLineupMember]
  openActivity: [item: SquadActivityItem]
}>()

const inviteTarget = ref('')
const copied = ref(false)

/** Who is in which game right now (from presence), as the old stats strip showed. */
const gameMix = computed(() => gameMixLabel(squadGameMixCounts(props.presence)))

const selectedMember = computed(() => props.members.find(m => m.id === props.selectedMemberId) ?? null)

const stats = computed(() => {
  const t = props.team
  if (!t) return []
  const items: Array<{ value: string; caption: string; sub?: string }> = [
    { value: `${props.onlineMembers}/${t.members.length}`, caption: 'Online now', sub: gameMix.value ?? `${props.maxSlots} seats` },
    { value: String(props.weekActivityCount), caption: 'Matches this week', sub: 'Across the squad' },
  ]
  if (props.weekRecord.wins + props.weekRecord.losses > 0) {
    items.push({ value: `${props.weekRecord.wins}–${props.weekRecord.losses}`, caption: 'Week record', sub: 'Wins–losses' })
  }
  if (t.credits_remaining != null && t.credits_total) {
    items.push({ value: `${t.credits_remaining}/${t.credits_total}`, caption: 'Shared credits', sub: 'Squad pool' })
  }
  return items
})

const maxAnalyses = computed(() => Math.max(1, ...props.compareRows.map(r => r.analysesCount)))

function sendInvite() {
  const v = inviteTarget.value.trim()
  if (!v) return
  emit('invite', v)
  inviteTarget.value = ''
}

async function copyCode() {
  if (!props.team?.invite_code) return
  try {
    await navigator.clipboard.writeText(props.team.invite_code)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { /* ignore */ }
}

function activityTitle(a: SquadActivityItem): string {
  const map = a.map ? formatMapLabel(a.map) || a.map : 'Match'
  return a.agent ? `${map} · ${a.agent}` : map
}

function activityResult(a: SquadActivityItem): { text: string; tone: 'win' | 'loss' | null } | null {
  const r = (a.result ?? '').toLowerCase()
  if (r.startsWith('w') || r === 'victory') return { text: 'Win', tone: 'win' }
  if (r.startsWith('l') || r === 'defeat') return { text: 'Loss', tone: 'loss' }
  return null
}

function kda(a: SquadActivityItem): string | null {
  if (a.kills == null || a.deaths == null) return null
  return `${a.kills}/${a.deaths}/${a.assists ?? 0}`
}
</script>

<template>
  <div class="uf-squad">
    <div class="uf-squad-pad">
      <template v-if="loading || squadError || !team">
        <header class="uf-squad-head uf-rise">
          <div class="uf-squad-titles">
            <span class="uf-label">Squad plan</span>
            <h1 class="uf-d2">Squad</h1>
          </div>
        </header>
      </template>

      <!-- First-ever load: placeholders in the shape of the squad screen (brief, stat row, members | sidebar). -->
      <div v-if="loading" class="uf-squad-skel" aria-busy="true" aria-label="Loading your squad">
        <div class="uf-squad-brief">
          <UfSkeleton w="62%" :h="28" />
          <UfSkeleton w="44%" :h="16" />
        </div>
        <div class="uf-squad-skel-stats">
          <div v-for="i in 3" :key="i"><UfSkeleton :w="72" :h="36" /><UfSkeleton :w="110" :h="13" /></div>
        </div>
        <div class="uf-squad-cols">
          <div class="uf-squad-main">
            <div v-for="i in 5" :key="i" class="uf-squad-skel-row"><UfSkeleton :w="34" :h="34" /><UfSkeleton w="38%" :h="15" /></div>
          </div>
          <div class="uf-squad-side">
            <UfSkeleton :w="90" :h="12" />
            <UfSkeleton :lines="3" />
          </div>
        </div>
      </div>

      <div v-else-if="squadError" class="uf-squad-state">
        <p class="uf-t1">Couldn’t load your squad.</p>
        <p class="uf-t2">{{ squadError }}</p>
        <div class="uf-squad-actions">
          <UfButton variant="primary" @click="emit('retry')">Try again</UfButton>
          <UfButton variant="link" @click="emit('openWeb')">Open on website</UfButton>
        </div>
      </div>

      <div v-else-if="!team" class="uf-squad-state">
        <p class="uf-t1">You're not in a squad yet.</p>
        <p class="uf-t2">Squad is a paid team plan: 4–6 players share AI reviews and credits and see each other's matches in one place. Create one or join with an invite on upforge.gg.</p>
        <div class="uf-squad-actions">
          <UfButton variant="primary" icon="team" @click="emit('openWeb')">Create or join a squad</UfButton>
        </div>
      </div>

      <template v-else>
        <header class="uf-squad-head uf-rise" :class="{ 'uf-refreshing': refreshing }">
          <div class="uf-squad-titles">
            <span class="uf-label">Squad plan · {{ squadPlanBadgeLabel(team.plan) }}</span>
            <h1 class="uf-d2">{{ team.name }}</h1>
          </div>
          <div class="uf-squad-actions">
            <button type="button" class="uf-icon-btn" :class="{ 'is-spinning': refreshing }" aria-label="Refresh squad" @click="emit('refresh')">
              <UfIcon name="swap" :size="16" />
            </button>
            <UfButton variant="link" @click="emit('openWeb')">Manage on website</UfButton>
          </div>
        </header>

        <section class="uf-squad-brief uf-rise uf-d1s">
          <p class="uf-t1">{{ briefingHeadline }}</p>
          <p class="uf-t2">{{ briefingSubline }}</p>
        </section>

        <UfStatRow v-if="stats.length" class="uf-rise uf-d2s" :items="stats" />

        <div class="uf-squad-cols">
          <div class="uf-squad-main">
            <section>
              <div class="uf-sec-head"><span class="uf-label">Members</span><span class="uf-t4">{{ members.length }} of {{ maxSlots }}</span></div>
              <button v-for="m in members" :key="m.id" type="button" class="uf-member" :class="{ 'is-on': selectedMemberId === m.id }"
                :aria-pressed="selectedMemberId === m.id" @click="emit('select', m)">
                <span class="uf-member-mark">{{ initial(m.name) }}</span>
                <span class="uf-member-name">
                  <span class="uf-t3">{{ m.name }}</span>
                  <span class="uf-t4">{{ m.competitive_rank || m.rank || (m.riot_name ? `${m.riot_name}#${m.riot_tag ?? ''}` : 'No rank yet') }}</span>
                </span>
                <span class="uf-member-presence" :class="`is-${presenceTone(presence[m.id])}`">
                  <span class="uf-dot" :class="{ 'uf-live': presenceTone(presence[m.id]) === 'live' }" />{{ presenceLabel(presence[m.id]) }}
                </span>
              </button>
              <div v-if="selectedMemberId != null && selectedMemberStats" class="uf-member-more">
                <div v-if="selectedMemberStats.has_stats !== false" class="uf-member-detail">
                  <span><b class="uf-d4">{{ selectedMemberStats.current_rank || '—' }}</b><span class="uf-t4">Rank</span></span>
                  <span><b class="uf-d4">{{ pctLabel(selectedMemberStats.win_rate) ?? '—' }}</b><span class="uf-t4">Win rate</span></span>
                  <span><b class="uf-d4">{{ selectedMemberStats.kd_ratio != null ? Number(selectedMemberStats.kd_ratio).toFixed(2) : '—' }}</b><span class="uf-t4">K/D</span></span>
                  <span><b class="uf-d4">{{ pctLabel(selectedMemberStats.headshot_percentage) ?? '—' }}</b><span class="uf-t4">Headshots</span></span>
                </div>
                <p v-else class="uf-t4">No linked stats yet — connect Riot ID on the website.</p>
                <p v-if="selectedMemberStats.most_played_agent || selectedMember?.riot_name" class="uf-t4">
                  <template v-if="selectedMember?.riot_name">{{ selectedMember.riot_name }}#{{ selectedMember.riot_tag }}</template>
                  <template v-if="selectedMemberStats.most_played_agent && selectedMember?.riot_name"> · </template>
                  <template v-if="selectedMemberStats.most_played_agent">Most played: {{ selectedMemberStats.most_played_agent }}</template>
                </p>
              </div>
            </section>

            <section v-if="compareRows.length">
              <div class="uf-sec-head"><span class="uf-label">Member compare</span><span class="uf-t4">Win rate · analyses</span></div>
              <div v-for="r in compareRows" :key="r.userId" class="uf-cmp">
                <span class="uf-t3">{{ r.name }}</span>
                <span class="uf-cmp-bar"><span class="uf-fill" :style="{ width: `${(r.analysesCount / maxAnalyses) * 100}%` }" /></span>
                <span class="uf-t4 uf-num">{{ plural(r.analysesCount, 'analysis', 'analyses') }}</span>
                <b class="uf-d4">{{ pctLabel(r.winRate) ?? '—' }}</b>
              </div>
            </section>

            <section>
              <div class="uf-sec-head"><span class="uf-label">Squad activity</span><UfButton variant="link" @click="emit('openWeb')">View all</UfButton></div>
              <p v-if="!activity.length" class="uf-t2">No squad matches yet. They show up here after a teammate’s match is analysed.</p>
              <button v-for="a in activity" :key="a.id" type="button" class="uf-act" @click="emit('openActivity', a)">
                <span class="uf-member-mark">{{ initial(a.user_name || memberName(a.user_id)) }}</span>
                <span class="uf-member-name">
                  <span class="uf-t3">{{ activityTitle(a) }}</span>
                  <span class="uf-t4">{{ a.user_name || memberName(a.user_id) }}<template v-if="a.created_at"> · {{ squadTimeAgo(a.created_at) }}</template></span>
                </span>
                <span v-if="kda(a)" class="uf-t4 uf-num">{{ kda(a) }}</span>
                <b v-if="activityResult(a)" class="uf-d4" :style="{ color: activityResult(a)!.tone === 'win' ? 'var(--uf-win)' : 'var(--uf-loss)' }">{{ activityResult(a)!.text }}</b>
              </button>
            </section>
          </div>

          <aside class="uf-squad-side">
            <section>
              <span class="uf-label">Invite a teammate</span>
              <form class="uf-invite" @submit.prevent="sendInvite">
                <label class="uf-sr" for="uf-invite-input">Riot ID or email</label>
                <input id="uf-invite-input" v-model="inviteTarget" class="uf-input" placeholder="Riot ID or email" autocomplete="off">
                <UfButton variant="secondary" icon="team" :disabled="!inviteTarget.trim()" @click="sendInvite">Send invite</UfButton>
              </form>
              <p class="uf-t4">Invites finish on upforge.gg.</p>
              <div v-for="p in pendingInvites" :key="p.value" class="uf-pending">
                <span class="uf-t3">{{ p.value }}</span>
                <span class="uf-t4">{{ squadTimeAgo(new Date(p.createdAt).toISOString()) }}</span>
                <button type="button" class="uf-icon-btn" :aria-label="`Remove invite for ${p.value}`" @click="emit('removePending', p.value)">
                  <UfIcon name="close" :size="14" />
                </button>
              </div>
            </section>

            <section v-if="team.invite_code">
              <span class="uf-label">Squad code</span>
              <div class="uf-code">
                <code>{{ team.invite_code }}</code>
                <UfButton variant="link" @click="copyCode">{{ copied ? 'Copied' : 'Copy' }}</UfButton>
              </div>
            </section>

            <section v-if="leaderboard.length">
              <span class="uf-label">Most active this week</span>
              <div v-for="(l, i) in leaderboard" :key="l.user_id" class="uf-lb">
                <span class="uf-d4" :style="{ color: i === 0 ? 'var(--uf-gold)' : 'var(--uf-faint)' }">{{ i + 1 }}</span>
                <UfIcon v-if="i === 0" name="star" :size="14" class="uf-lb-star" />
                <span class="uf-t3">{{ l.name }}</span>
                <span class="uf-t4 uf-num">{{ l.analyses_count ?? 0 }}</span>
              </div>
            </section>
          </aside>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.uf-squad { height: 100%; overflow-y: auto; background: var(--uf-bg); }
.uf-squad-pad { max-width: 1240px; padding: 22px 40px 40px; display: flex; flex-direction: column; gap: 26px; }
.uf-squad-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
.uf-squad-titles { display: flex; flex-direction: column; gap: 10px; }
.uf-squad-titles h1 { margin: 0; }
.uf-squad-actions { display: flex; align-items: center; gap: 16px; }
.uf-squad-brief { display: flex; flex-direction: column; gap: 8px; max-width: 820px; }
.uf-squad-brief p, .uf-squad-state p { margin: 0; }
.uf-squad-state { display: flex; flex-direction: column; gap: 12px; padding: 40px 0; max-width: 720px; }
.uf-squad-skel { display: flex; flex-direction: column; gap: 26px; }
.uf-squad-skel-stats { display: flex; gap: 48px; }
.uf-squad-skel-stats > div { display: flex; flex-direction: column; gap: 8px; }
.uf-squad-skel-row { display: flex; align-items: center; gap: 14px; padding: 10px 0; border-top: 1px solid var(--uf-line); }
.uf-squad-cols { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 40px; }
.uf-squad-main { display: flex; flex-direction: column; gap: 30px; min-width: 0; }
.uf-squad-side { display: flex; flex-direction: column; gap: 28px; border-left: 1px solid var(--uf-line); padding-left: 30px; }
.uf-squad-side section { display: flex; flex-direction: column; gap: 10px; }
.uf-sec-head { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 8px; }
.uf-member, .uf-act { width: 100%; display: flex; align-items: center; gap: 14px; padding: 10px 0; background: none; border: 0; border-top: 1px solid var(--uf-line); color: inherit; cursor: pointer; text-align: left; }
.uf-member:hover, .uf-act:hover { background: var(--uf-hover); }
.uf-member.is-on { box-shadow: inset 2px 0 0 var(--uf-red); padding-left: 10px; }
.uf-member-mark { width: 34px; height: 34px; flex: none; display: flex; align-items: center; justify-content: center; background: var(--uf-raised); font: 700 26px/1 var(--uf-display); color: var(--uf-bone); }
.uf-member-name { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.uf-member-name > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uf-member-presence { display: inline-flex; align-items: center; gap: 8px; font: 400 13px/1 var(--uf-body); color: var(--uf-faint); white-space: nowrap; }
.uf-member-presence.is-live { color: var(--uf-bone); }
.uf-member-presence.is-online { color: var(--uf-muted); }
.uf-dot { width: 6px; height: 6px; border-radius: 3px; background: var(--uf-faint); }
.is-online .uf-dot { background: var(--uf-win); }
.is-live .uf-dot { background: var(--uf-red); }
.uf-member-more { display: flex; flex-direction: column; gap: 10px; padding: 14px 0 6px 48px; border-top: 1px solid var(--uf-line); }
.uf-member-more p { margin: 0; }
.uf-member-detail { display: flex; gap: 32px; }
.uf-lb-star { color: var(--uf-gold); flex: none; }
.uf-member-detail > span { display: flex; flex-direction: column; gap: 4px; }
.uf-cmp { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.4fr) 110px 70px; gap: 16px; align-items: center; padding: 10px 0; border-top: 1px solid var(--uf-line); }
.uf-cmp-bar { height: 8px; background: rgba(236, 232, 225, 0.08); }
.uf-cmp-bar > span { display: block; height: 8px; background: var(--uf-bone); opacity: 0.55; }
.uf-cmp .uf-d4 { text-align: right; }
.uf-invite { display: flex; flex-direction: column; gap: 10px; }
.uf-input { height: 40px; padding: 0 12px; background: var(--uf-chrome); border: 1px solid var(--uf-line-2); color: var(--uf-bone); font: 400 16px/1 var(--uf-body); }
.uf-input:focus { outline: none; border-color: var(--uf-red); }
.uf-pending, .uf-lb { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid var(--uf-line); }
.uf-pending .uf-t3, .uf-lb .uf-t3 { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uf-code { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--uf-line); border-bottom: 1px solid var(--uf-line); }
.uf-code code { font: 700 26px/1 var(--uf-display); letter-spacing: 0.12em; color: var(--uf-bone); }
.uf-icon-btn { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; background: none; border: 1px solid var(--uf-line-2); color: var(--uf-muted); cursor: pointer; }
.uf-icon-btn:hover { color: var(--uf-bone); background: var(--uf-hover); }
.uf-icon-btn.is-spinning { opacity: 0.5; }
.uf-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
