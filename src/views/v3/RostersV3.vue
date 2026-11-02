<script setup lang="ts">
/**
 * Coaches (UI v3): getting coached by a person — everyone sees this. Your coaches by name, what's
 * waiting, notes ready, send a match, booked sessions (only if any) and Find a coach (Join / Book).
 * Coaching others lives on Students (/students, coach profiles only); there is no Coach/Student
 * toggle. Not Squad. Pure view: RostersView keeps loading and sending (coaches-flow-proposal.md, Option A).
 */
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import UfTabs from '../../components/v3/UfTabs.vue'
import JoinCoachV3 from '../../components/v3/roster-flow/JoinCoachV3.vue'
import FindCoachV3 from '../../components/v3/booking/FindCoachV3.vue'
import MyBookingsV3 from '../../components/v3/booking/MyBookingsV3.vue'
import UfButton from '../../components/v3/UfButton.vue'
import UfSkeleton from '../../components/v3/UfSkeleton.vue'
import RosterMatchRowV3 from '../../components/v3/coaches/RosterMatchRowV3.vue'
import {
  allowanceLine, blockedLine, coachesHeadline, sendBlockedText, planLabel, roundScore, waitingPhrase, type CoachLimits,
} from '../../components/v3/coaches/coach-format'
import { sendLabel } from '../../components/v3/roster-flow/roster-flow'
import { rosterFormatDate, rosterMapLabel, type RosterMatchVisual } from '../../lib/roster-match-display'
import { playerIdentity } from '../../lib/player-identity'
import PlayerAvatar from '../../components/v3/identity/PlayerAvatar.vue'
import RankIcon from '../../components/v3/identity/RankIcon.vue'

interface Coach {
  coach_id: number
  display_name: string
  avatar_url: string | null
  /** Coach's Valorant player card (avatar fallback when no photo is uploaded). */
  player_card_id?: string | null
  main_agents?: string[] | null
  current_rank: string | null
  specialties: string[]
  roster_is_live?: boolean
  can_request_review?: boolean
  can_request_code?: string | null
  can_request_reason?: string | null
  membership_is_paid?: boolean
  roster_membership_mode?: 'free' | 'paid'
  review_limits?: CoachLimits
}

interface Review {
  id: number
  status: string
  requested_at?: string | null
  completed_at?: string | null
  coach?: { id: number; display_name: string } | null
  analysis?: (RosterMatchVisual & { id: number }) | null
}
type Match = RosterMatchVisual & { id: number; available_coach_ids?: number[] }

/** Send list shows the last few analysed matches, not every one. */
const SEND_LIMIT = 5

const props = defineProps<{
  loading: boolean
  refreshing?: boolean
  error: string | null
  isEmpty: boolean
  coaches: Coach[]
  pendingReviews: Review[]
  completedReviews: Review[]
  actionable: Match[]
  /** Review ids of notes you haven't opened yet (drives the H1 and the "New" mark). */
  unseenIds: ReadonlySet<number>
  /** Has a coach profile: Find a coach drops the "Apply" line. */
  isCoach: boolean
  sendError: string | null
  sendingId: number | null
  toast: string | null
  coachBlockCode: (coach: Coach) => string | null
}>()

const emit = defineEmits<{
  retry: []
  myCoaches: []
  openCoach: [coachId: number]
  openNotes: [review: Review]
  openAnalysis: [match: Match]
  send: [match: Match]
  joined: [coachName: string]
}>()

const route = useRoute()
// Home's "Paste invite link" opens Coaches with ?join=1; an upforge:// invite adds &invite=<coach id>.
const joinOpen = ref(route.query.join === '1')
const routeInviteId = computed(() => {
  const raw = route.query.invite
  return typeof raw === 'string' && /^[1-9]\d{0,8}$/.test(raw) ? Number(raw) : null
})
/** "Join {name}" in Find a coach looks that coach up in the invite row (joining still asks first). */
const pickedJoinId = ref<number | null>(null)
const inviteCoachId = computed(() => pickedJoinId.value ?? routeInviteId.value)
watch(routeInviteId, (id) => { if (id != null) { joinOpen.value = true; view.value = 'mine' } })

// Two views when you have coaches; old ?view=bookings links land on Your coaches (Sessions live there).
type View = 'mine' | 'find'
const view = ref<View>(route.query.view === 'find' ? 'find' : 'mine')
watch(joinOpen, (open) => { if (open) view.value = 'mine' })

const page = ref<HTMLElement | null>(null)
function joinFromFind(coachId: number) {
  pickedJoinId.value = coachId
  joinOpen.value = true
  view.value = 'mine'
  page.value?.scrollTo({ top: 0, behavior: 'smooth' })
}
function onJoined(name: string) {
  joinOpen.value = false
  pickedJoinId.value = null
  emit('joined', name)
}

const coachName = (r: Review) => r.coach?.display_name || 'your coach'
const eligible = computed(() => props.coaches.filter(c => c.can_request_review !== false))
const canSend = computed(() => eligible.value.length > 0)
const myCoachIds = computed(() => props.coaches.map(c => c.coach_id))

/** Coaches this match can go to (API narrows some matches to particular coaches). */
function eligibleFor(m: Match): Coach[] {
  const ids = m.available_coach_ids
  return ids?.length ? eligible.value.filter(c => ids.includes(c.coach_id)) : eligible.value
}

const unseenNotes = computed(() => props.completedReviews.filter(r => props.unseenIds.has(r.id)).map(r => ({ coachName: coachName(r) })))
const waiting = computed(() => props.pendingReviews.map(r => waitingPhrase(coachName(r), rosterMapLabel(r.analysis ?? {}), r.status)))
const head = computed(() => coachesHeadline({
  coachCount: props.coaches.length,
  unseenNotes: unseenNotes.value,
  waiting: waiting.value,
  canSend: canSend.value && props.actionable.length > 0,
  sendTo: eligible.value.length === 1 ? eligible.value[0].display_name : null,
}))

/** Map of the match a coach still has (for "You can send again when astar finishes Summit."). */
function waitingMapFor(coachId: number): string | null {
  const r = props.pendingReviews.find(p => p.coach?.id === coachId)
  return r ? rosterMapLabel(r.analysis ?? {}) : null
}

/** One line per coach under their name: allowance, or why they can't take a match. */
function coachLine(c: Coach): string | null {
  const code = props.coachBlockCode(c)
  if (c.can_request_review === false && code && code !== 'student_active_limit') {
    return blockedLine(c.display_name, code, c.can_request_reason)
  }
  return allowanceLine(c.display_name, c.review_limits)
}

/** When nobody can take a match: one honest line instead of a list of dead buttons. */
const blockedText = computed(() => {
  if (canSend.value || !props.coaches.length) return null
  return sendBlockedText(props.coaches.map(c => ({
    name: c.display_name, code: props.coachBlockCode(c), reason: c.can_request_reason, waitingMap: waitingMapFor(c.coach_id),
  })))
})

const sendList = computed(() => props.actionable.slice(0, SEND_LIMIT))

/** Photo → player card → main agent → letter, and the rank icon, same as everywhere else. */
const coachIdentities = computed(() => new Map(props.coaches.map(c => [c.coach_id, playerIdentity({
  name: c.display_name, avatarUrl: c.avatar_url, playerCardId: c.player_card_id, agents: c.main_agents, rank: c.current_rank,
})])))

function waitingSubtitle(r: Review): string {
  const parts = [roundScore(r.analysis?.rounds_won, r.analysis?.rounds_lost), r.requested_at ? `sent ${rosterFormatDate(r.requested_at)}` : null]
  return parts.filter(Boolean).join(' · ')
}
function notesSubtitle(r: Review): string {
  const parts = [roundScore(r.analysis?.rounds_won, r.analysis?.rounds_lost), coachName(r), r.completed_at ? rosterFormatDate(r.completed_at) : null]
  return parts.filter(Boolean).join(' · ')
}
</script>

<template>
  <div ref="page" class="uf-roster">
    <div class="uf-roster-pad">
      <!-- First-ever load: placeholders in the shape of the header, coach rows and match rows. -->
      <div v-if="loading" aria-busy="true" aria-label="Loading your coaches" class="uf-roster-skel">
        <UfSkeleton :w="90" :h="12" />
        <UfSkeleton w="40%" :h="40" />
        <UfSkeleton w="52%" :h="15" />
        <div style="margin-top: 18px">
          <UfSkeleton :w="110" :h="12" />
          <div v-for="i in 2" :key="i" class="uf-roster-skel-row"><UfSkeleton :w="44" :h="44" /><span class="uf-roster-skel-lines"><UfSkeleton w="30%" :h="15" /><UfSkeleton w="46%" :h="13" /></span></div>
        </div>
        <div>
          <UfSkeleton :w="110" :h="12" />
          <div v-for="i in 3" :key="i" class="uf-roster-skel-row"><UfSkeleton :w="64" :h="36" /><span class="uf-roster-skel-lines"><UfSkeleton w="34%" :h="15" /><UfSkeleton w="22%" :h="13" /></span></div>
        </div>
      </div>

      <div v-else-if="error" class="uf-roster-state">
        <span class="uf-label">Coaches</span>
        <p class="uf-t1">Couldn’t load your coaches.</p>
        <p class="uf-t2">{{ error }}</p>
        <div><UfButton variant="primary" @click="emit('retry')">Try again</UfButton></div>
      </div>

      <template v-else>
        <header class="uf-roster-titles uf-rise" :class="{ 'uf-refreshing': refreshing }">
          <span class="uf-label">Coaches</span>
          <h1 class="uf-d2">{{ head.title }}</h1>
          <p v-if="head.sub" class="uf-t2">{{ head.sub }}</p>
        </header>

        <!-- (a) No coach yet: the invite row, then one in-app list of coaches. -->
        <template v-if="isEmpty">
          <JoinCoachV3 :invite-coach-id="inviteCoachId" :autofocus="joinOpen" @joined="onJoined" />
          <section>
            <div class="uf-sec-head"><span class="uf-label">Find a coach</span></div>
            <FindCoachV3 :my-coach-ids="myCoachIds" :is-coach="isCoach" @join="joinFromFind" />
          </section>
          <MyBookingsV3 only-if-any />
        </template>

        <!-- (b) Student with coaches -->
        <template v-else>
          <UfTabs size="page" label="Coaches sections" :model-value="view"
            :items="[{ key: 'mine', label: 'Your coaches' }, { key: 'find', label: 'Find a coach' }]"
            @update:model-value="view = $event as View" />

          <FindCoachV3 v-if="view === 'find'" :my-coach-ids="myCoachIds" :is-coach="isCoach" @join="joinFromFind" />

          <template v-else>
            <section>
              <div class="uf-sec-head"><span class="uf-label">Your coaches</span>
                <span class="uf-roster-actions">
                  <UfButton variant="link" @click="joinOpen = !joinOpen; pickedJoinId = null">{{ joinOpen ? 'Close' : 'Join another coach' }}</UfButton>
                  <UfButton variant="link" @click="view = 'find'">Find a coach</UfButton>
                </span>
              </div>
              <JoinCoachV3 v-if="joinOpen || inviteCoachId != null" autofocus :invite-coach-id="inviteCoachId" style="padding-bottom: 14px" @joined="onJoined" />
              <button v-for="c in coaches" :key="c.coach_id" type="button" class="uf-coach" :title="`${c.display_name} on upforge.gg`" @click="emit('openCoach', c.coach_id)">
                <PlayerAvatar :identity="coachIdentities.get(c.coach_id)!" :size="48" />
                <span class="uf-coach-main">
                  <span class="uf-coach-name">
                    <span class="uf-t3">{{ c.display_name }}</span>
                    <RankIcon :src="coachIdentities.get(c.coach_id)!.rankIcon" :label="coachIdentities.get(c.coach_id)!.rankLabel" :size="18" />
                    <span class="uf-t4">{{ planLabel(c) }}</span>
                  </span>
                  <span v-if="coachLine(c)" class="uf-t4">{{ coachLine(c) }}</span>
                </span>
              </button>
            </section>

            <section v-if="completedReviews.length">
              <div class="uf-sec-head"><span class="uf-label">Notes ready</span></div>
              <RosterMatchRowV3 v-for="r in completedReviews" :key="r.id" :match="r.analysis ?? {}" :subtitle="notesSubtitle(r)"
                :status="unseenIds.has(r.id) ? 'New notes' : 'Open notes'" :status-tone="unseenIds.has(r.id) ? 'win' : 'muted'" @open="emit('openNotes', r)" />
            </section>

            <section v-if="pendingReviews.length">
              <div class="uf-sec-head"><span class="uf-label">Waiting for notes</span></div>
              <RosterMatchRowV3 v-for="r in pendingReviews" :key="r.id" :match="r.analysis ?? {}" :subtitle="waitingSubtitle(r)"
                :status="r.status === 'in_progress' ? `${coachName(r)} is reviewing` : `Waiting for ${coachName(r)}`" @open="emit('openNotes', r)" />
            </section>

            <section v-if="actionable.length">
              <div class="uf-sec-head"><span class="uf-label">Send a match</span></div>
              <p v-if="sendError" class="uf-msg uf-msg--bad">{{ sendError }}</p>
              <!-- Nobody can take a match: one line, no greyed-out buttons. -->
              <p v-if="blockedText" class="uf-t3 uf-roster-blocked">{{ blockedText }}</p>
              <template v-else>
                <RosterMatchRowV3 v-for="m in sendList" :key="m.id" :match="m" @open="emit('openAnalysis', m)">
                  <template v-if="eligibleFor(m).length" #action>
                    <UfButton variant="secondary" icon="chat" :disabled="sendingId === m.id" @click="emit('send', m)">
                      {{ sendingId === m.id ? 'Sending…' : sendLabel(eligibleFor(m)) }}
                    </UfButton>
                  </template>
                </RosterMatchRowV3>
              </template>
            </section>

            <MyBookingsV3 only-if-any @find-coach="view = 'find'" />

            <p class="uf-t4"><UfButton variant="link" @click="emit('myCoaches')">Leave or change a plan on upforge.gg</UfButton></p>
          </template>
        </template>
      </template>
    </div>

    <Transition name="uf-toast">
      <div v-if="toast" class="uf-toast" role="status"><span class="uf-dot" />{{ toast }}</div>
    </Transition>
    <slot name="overlays" />
  </div>
</template>

<style scoped>
.uf-roster { position: relative; height: 100%; overflow-y: auto; background: var(--uf-bg); }
.uf-roster-pad { padding: 22px 40px 40px; display: flex; flex-direction: column; gap: 28px; }
.uf-roster-titles { display: flex; flex-direction: column; gap: 10px; max-width: 820px; }
.uf-roster-titles h1, .uf-roster-titles p, .uf-roster-state p { margin: 0; }
.uf-roster-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.uf-roster-state { display: flex; flex-direction: column; gap: 12px; padding: 30px 0; max-width: 720px; }
.uf-roster-skel { display: flex; flex-direction: column; gap: 10px; }
.uf-roster-skel-lines { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.uf-roster-skel-row { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--uf-line); margin-top: 10px; }
.uf-sec-head { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 8px; }
.uf-coach { width: 100%; display: flex; align-items: center; gap: 16px; padding: 14px 0; background: none; border: 0; border-top: 1px solid var(--uf-line); color: inherit; cursor: pointer; text-align: left; }
.uf-coach:hover { background: var(--uf-hover); }
.uf-coach-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.uf-coach-name { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
/* The section label already separates; no hairline straight under it. */
.uf-sec-head + .uf-coach { border-top: 0; }
.uf-roster-blocked { margin: 0; padding: 4px 0 0; color: var(--uf-muted); }
.uf-msg { margin: 0 0 8px; font: 400 13px/1.5 var(--uf-body); color: var(--uf-muted); }
.uf-msg--bad { color: var(--uf-loss); }
.uf-toast { position: fixed; right: 24px; bottom: 24px; z-index: 90; display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--uf-raised); border-left: 2px solid var(--uf-win); color: var(--uf-bone); font: 600 15px/1 var(--uf-body); pointer-events: none; }
.uf-dot { width: 6px; height: 6px; border-radius: 3px; background: var(--uf-win); }
.uf-toast-enter-active, .uf-toast-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.uf-toast-enter-from, .uf-toast-leave-to { opacity: 0; transform: translateY(8px); }
@media (prefers-reduced-motion: reduce) { .uf-toast-enter-active, .uf-toast-leave-active { transition: none; } }
</style>
