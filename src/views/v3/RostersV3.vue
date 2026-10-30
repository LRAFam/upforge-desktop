<script setup lang="ts">
/**
 * Coaches (UI v3): coach rosters — a student joins a coach's free or paid roster and sends matches
 * for review; a coach runs their roster here. Not Squad (the paid team plan, /squad). Pure view: RostersView keeps loading, sending and coach-mode logic;
 * this renders the student side to the rulebook (docs/design/ui-v3.md · board 24) and hosts the
 * coach panel in the #coach slot.
 */
import UfTabs from '../../components/v3/UfTabs.vue'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import JoinCoachV3 from '../../components/v3/roster-flow/JoinCoachV3.vue'
import FindCoachV3 from '../../components/v3/booking/FindCoachV3.vue'
import MyBookingsV3 from '../../components/v3/booking/MyBookingsV3.vue'
import UfButton from '../../components/v3/UfButton.vue'
import UfSkeleton from '../../components/v3/UfSkeleton.vue'
import UfStatRow from '../../components/v3/UfStatRow.vue'
import RosterMatchRowV3 from '../../components/v3/coaches/RosterMatchRowV3.vue'
import { initial, limitPct } from '../../components/v3/coaches/coach-format'
import type { RosterMatchVisual } from '../../lib/roster-match-display'
import { getRankIconUrl } from '../../lib/valorant'

type Mode = 'student' | 'coach'

interface Coach {
  coach_id: number
  display_name: string
  avatar_url: string | null
  current_rank: string | null
  specialties: string[]
  roster_is_live?: boolean
  can_request_reason?: string | null
  open_review_count?: number
  completed_review_count?: number
  review_limits?: { active_reviews: number; active_reviews_limit: number; reviews_this_month: number; reviews_month_limit: number }
}

interface Review { id: number; status: string; analysis?: (RosterMatchVisual & { id: number }) | null }
type Match = RosterMatchVisual & { id: number }

const props = defineProps<{
  mode: Mode
  showModeSwitch: boolean
  coachPending: number
  studentPending: number
  loading: boolean
  refreshing?: boolean
  error: string | null
  isEmpty: boolean
  discoveryOpened: boolean
  coaches: Coach[]
  pendingReviews: Review[]
  completedReviews: Review[]
  actionable: Match[]
  stats: { coaches_count: number; pending_reviews: number; completed_reviews: number; actionable_matches: number }
  sendError: string | null
  sendBlockMessage: string | null
  canSendAnyReview: boolean
  sendingId: number | null
  toast: string | null
  webHost: string
  coachBlock: (coach: Coach) => { label: string | null }
  membershipLabel: (coach: Coach) => string
  reviewSubtitle: (review: Review) => string
  completedSubtitle: (review: Review) => string
}>()

const emit = defineEmits<{
  setMode: [mode: Mode]
  refresh: []
  retry: []
  discovery: []
  myCoaches: []
  openCoach: [coachId: number]
  openNotes: [review: Review]
  openAnalysis: [match: Match]
  send: [match: Match]
  /** Roster flow: joined a free roster from an invite link. */
  joined: [coachName: string]
}>()

const route = useRoute()
// Home's "Join your coach" opens Coaches with ?join=1; an upforge:// invite adds &invite=<coach id>.
const joinOpen = ref(route.query.join === '1')
const inviteCoachId = computed(() => {
  const raw = route.query.invite
  return typeof raw === 'string' && /^[1-9]\d{0,8}$/.test(raw) ? Number(raw) : null
})
watch(inviteCoachId, (id) => { if (id != null) joinOpen.value = true })
// Student side has three parts: roster coaches, the bookable-coach marketplace, and marketplace bookings.
type StudentView = 'roster' | 'find' | 'bookings'
const studentView = ref<StudentView>(route.query.view === 'find' || route.query.view === 'bookings' ? route.query.view : 'roster')
watch(joinOpen, (open) => { if (open) studentView.value = 'roster' })

function onJoined(name: string) {
  joinOpen.value = false
  emit('joined', name)
}

const statItems = computed(() => [
  { value: String(props.stats.coaches_count), caption: 'Coaches', sub: 'You’re on their roster' },
  { value: String(props.stats.pending_reviews), caption: 'With your coach', sub: 'Waiting for notes' },
  { value: String(props.stats.completed_reviews), caption: 'Notes ready', sub: 'Reviewed matches', tone: props.stats.completed_reviews > 0 ? 'win' as const : undefined },
  { value: String(props.stats.actionable_matches), caption: 'Ready to send', sub: 'Analysed matches' },
])

function statusText(status: string): string {
  if (status === 'in_progress') return 'In progress'
  if (status === 'completed') return 'Done'
  return 'Waiting'
}
</script>

<template>
  <div class="uf-roster">
    <div class="uf-roster-pad">
      <header class="uf-roster-head uf-rise">
        <div class="uf-roster-titles">
          <span class="uf-label">Coaches</span>
          <h1 class="uf-d2">{{ mode === 'coach' ? 'Your roster' : 'Your coaches' }}</h1>
          <p class="uf-t2">{{ mode === 'coach' ? 'Clear the queue, then grow membership.' : 'Send a match with its round story, then read the notes when they land.' }}</p>
        </div>
        <div class="uf-roster-actions">
          <UfTabs v-if="showModeSwitch" size="filter" label="Roster mode" :model-value="mode"
            :items="[{ key: 'coach', label: 'Coach', count: coachPending || null }, { key: 'student', label: 'Student', count: studentPending || null }]"
            @update:model-value="emit('setMode', $event as 'coach' | 'student')" />
          <UfButton variant="secondary" @click="emit('refresh')">Refresh</UfButton>
        </div>
      </header>

      <div v-show="mode === 'coach'" class="uf-roster-coach"><slot name="coach" /></div>

      <UfTabs v-if="mode === 'student'" size="page" label="Coaches sections" :model-value="studentView"
        :items="[{ key: 'roster', label: 'Your coaches' }, { key: 'find', label: 'Find a coach' }, { key: 'bookings', label: 'Bookings' }]"
        @update:model-value="studentView = $event as StudentView" />

      <FindCoachV3 v-if="mode === 'student' && studentView === 'find'" />
      <MyBookingsV3 v-if="mode === 'student' && studentView === 'bookings'" @find-coach="studentView = 'find'" />

      <template v-if="mode === 'student' && studentView === 'roster'">
        <!-- First-ever load: placeholders in the shape of the student side (stat row, coach rows, match rows). -->
        <div v-if="loading" aria-busy="true" aria-label="Loading your coaches" class="uf-roster-skel">
          <div class="uf-roster-skel-stats">
            <div v-for="i in 4" :key="i"><UfSkeleton :w="56" :h="36" /><UfSkeleton :w="110" :h="13" /></div>
          </div>
          <div>
            <UfSkeleton :w="110" :h="12" />
            <div v-for="i in 2" :key="i" class="uf-roster-skel-row"><UfSkeleton :w="44" :h="44" /><span class="uf-roster-skel-lines"><UfSkeleton w="30%" :h="15" /><UfSkeleton w="46%" :h="13" /></span></div>
          </div>
          <div>
            <UfSkeleton :w="110" :h="12" />
            <div v-for="i in 3" :key="i" class="uf-roster-skel-row"><UfSkeleton :w="64" :h="36" /><span class="uf-roster-skel-lines"><UfSkeleton w="34%" :h="15" /><UfSkeleton w="22%" :h="13" /></span></div>
          </div>
        </div>

        <div v-else-if="error" class="uf-roster-state">
          <p class="uf-t1">Couldn’t load your coaches.</p>
          <p class="uf-t2">{{ error }}</p>
          <div><UfButton variant="primary" @click="emit('retry')">Try again</UfButton></div>
        </div>

        <div v-else-if="isEmpty" class="uf-roster-state">
          <span class="uf-label">No coach yet</span>
          <p class="uf-t1">Join a coach community and send them a match.</p>
          <p class="uf-t2">Got a link from your coach? Paste it below. Once you’ve joined, send matches from here or straight from the match page, and read the notes when they land.</p>
          <JoinCoachV3 :invite-coach-id="inviteCoachId" @joined="onJoined" />
          <div class="uf-roster-actions">
            <UfButton variant="link" @click="studentView = 'find'">Find a coach</UfButton>
            <UfButton variant="link" @click="emit('discovery')">{{ discoveryOpened ? 'Browse coaches on upforge.gg again' : 'Browse coaches on upforge.gg' }}</UfButton>
          </div>
        </div>

        <template v-else>
          <UfStatRow class="uf-rise uf-d1s" :class="{ 'uf-refreshing': refreshing }" :items="statItems" />

          <section>
            <div class="uf-sec-head"><span class="uf-label">Your coaches</span>
              <span class="uf-roster-actions">
                <UfButton variant="link" @click="joinOpen = !joinOpen">{{ joinOpen ? 'Close' : 'Join with invite link' }}</UfButton>
                <UfButton variant="link" @click="studentView = 'find'">Find another</UfButton>
              </span>
            </div>
            <JoinCoachV3 v-if="joinOpen || inviteCoachId != null" autofocus :invite-coach-id="inviteCoachId" style="padding-bottom: 14px" @joined="onJoined" />
            <button v-for="c in coaches" :key="c.coach_id" type="button" class="uf-coach" @click="emit('openCoach', c.coach_id)">
              <span class="uf-coach-avatar">
                <img v-if="c.avatar_url" :src="c.avatar_url" alt="" loading="lazy" decoding="async">
                <span v-else>{{ initial(c.display_name) }}</span>
              </span>
              <span class="uf-coach-main">
                <span class="uf-coach-name">
                  <span class="uf-t3">{{ c.display_name }}</span>
                  <span class="uf-tag">{{ membershipLabel(c) }}</span>
                  <span v-if="coachBlock(c).label" class="uf-tag" :title="c.can_request_reason || undefined">{{ coachBlock(c).label }}</span>
                  <span v-if="c.roster_is_live === false" class="uf-tag">Not live</span>
                </span>
                <span class="uf-coach-meta">
                  <img v-if="c.current_rank && getRankIconUrl(c.current_rank)" :src="getRankIconUrl(c.current_rank)!" :alt="c.current_rank" class="uf-rank">
                  <span class="uf-t4">{{ c.current_rank || 'Rank n/a' }} · {{ c.open_review_count ?? 0 }} open · {{ c.completed_review_count ?? 0 }} done</span>
                  <span v-if="c.specialties?.length" class="uf-t4">· {{ c.specialties.slice(0, 4).join(' · ') }}</span>
                </span>
              </span>
              <span v-if="c.review_limits" class="uf-coach-limits">
                <span class="uf-limit">
                  <span class="uf-t4">Open with coach</span>
                  <span class="uf-limit-bar"><span class="uf-fill" :style="{ width: `${limitPct(c.review_limits.active_reviews, c.review_limits.active_reviews_limit)}%` }" /></span>
                  <span class="uf-t4 uf-num">{{ c.review_limits.active_reviews }}/{{ c.review_limits.active_reviews_limit }}</span>
                </span>
                <span class="uf-limit">
                  <span class="uf-t4">This month</span>
                  <span class="uf-limit-bar"><span class="uf-fill" :style="{ width: `${limitPct(c.review_limits.reviews_this_month, c.review_limits.reviews_month_limit)}%` }" /></span>
                  <span class="uf-t4 uf-num">{{ c.review_limits.reviews_this_month }}/{{ c.review_limits.reviews_month_limit }}</span>
                </span>
              </span>
            </button>
          </section>

          <section v-if="actionable.length">
            <div class="uf-sec-head"><span class="uf-label">Send a match</span><span class="uf-t4 uf-num">{{ actionable.length }} ready</span></div>
            <p v-if="sendError" class="uf-msg uf-msg--bad">{{ sendError }}</p>
            <p v-else-if="sendBlockMessage" class="uf-msg">{{ sendBlockMessage }}</p>
            <RosterMatchRowV3 v-for="m in actionable" :key="m.id" :match="m" @open="emit('openAnalysis', m)">
              <template #action>
                <UfButton variant="secondary" icon="chat" :disabled="!canSendAnyReview || sendingId === m.id"
                  :title="canSendAnyReview ? 'Send this match for coach notes' : (sendBlockMessage || 'Cannot send right now')" @click="emit('send', m)">
                  {{ sendingId === m.id ? 'Sending…' : 'Ask my coach' }}
                </UfButton>
              </template>
            </RosterMatchRowV3>
          </section>

          <section v-if="pendingReviews.length">
            <div class="uf-sec-head"><span class="uf-label">With your coach</span></div>
            <RosterMatchRowV3 v-for="r in pendingReviews" :key="r.id" :match="r.analysis ?? {}" :subtitle="reviewSubtitle(r)" :status="statusText(r.status)" @open="emit('openNotes', r)" />
          </section>

          <section v-if="completedReviews.length">
            <div class="uf-sec-head"><span class="uf-label">Recent notes</span></div>
            <RosterMatchRowV3 v-for="r in completedReviews" :key="r.id" :match="r.analysis ?? {}" :subtitle="completedSubtitle(r)" status="Notes ready" status-tone="win" @open="emit('openNotes', r)" />
          </section>

          <p class="uf-t4">Manage membership on <button type="button" class="uf-inline-link" @click="emit('myCoaches')">{{ webHost }}/my-coaches</button></p>
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
.uf-roster-pad { max-width: 1240px; padding: 22px 40px 40px; display: flex; flex-direction: column; gap: 28px; }
.uf-roster-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.uf-roster-titles { display: flex; flex-direction: column; gap: 10px; }
.uf-roster-titles h1, .uf-roster-titles p, .uf-roster-state p { margin: 0; }
.uf-roster-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.uf-roster-state { display: flex; flex-direction: column; gap: 12px; padding: 30px 0; max-width: 720px; }
.uf-roster-skel { display: flex; flex-direction: column; gap: 8px; }
.uf-roster-skel-stats { display: flex; gap: 48px; }
.uf-roster-skel-stats > div, .uf-roster-skel-lines { display: flex; flex-direction: column; gap: 8px; }
.uf-roster-skel-lines { flex: 1; }
.uf-roster-skel-row { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--uf-line); margin-top: 10px; }
.uf-sec-head { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 8px; }
.uf-coach { width: 100%; display: flex; align-items: center; gap: 16px; padding: 14px 0; background: none; border: 0; border-top: 1px solid var(--uf-line); color: inherit; cursor: pointer; text-align: left; }
.uf-coach:hover { background: var(--uf-hover); }
.uf-coach-avatar { width: 48px; height: 48px; flex: none; display: flex; align-items: center; justify-content: center; background: var(--uf-raised); overflow: hidden; font: 700 26px/1 var(--uf-display); }
.uf-coach-avatar img { width: 100%; height: 100%; object-fit: cover; }
.uf-coach-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.uf-coach-name, .uf-coach-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.uf-tag { font: 600 12px/1.2 var(--uf-body); letter-spacing: 0.12em; text-transform: uppercase; color: var(--uf-muted); }
.uf-rank { width: 18px; height: 18px; object-fit: contain; }
.uf-coach-limits { width: 300px; flex: none; display: flex; flex-direction: column; gap: 8px; }
.uf-limit { display: grid; grid-template-columns: 110px 1fr 40px; gap: 10px; align-items: center; }
.uf-limit .uf-num { text-align: right; }
.uf-limit-bar { height: 6px; background: rgba(236, 232, 225, 0.08); }
.uf-limit-bar > span { display: block; height: 6px; background: var(--uf-bone); opacity: 0.55; }
.uf-msg { margin: 0 0 8px; font: 400 13px/1.5 var(--uf-body); color: var(--uf-muted); }
.uf-msg--bad { color: var(--uf-loss); }
.uf-inline-link { background: none; border: 0; padding: 0; color: var(--uf-muted); text-decoration: underline; cursor: pointer; font: inherit; }
.uf-toast { position: fixed; right: 24px; bottom: 24px; z-index: 90; display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--uf-raised); border-left: 2px solid var(--uf-win); color: var(--uf-bone); font: 600 15px/1 var(--uf-body); pointer-events: none; }
.uf-dot { width: 6px; height: 6px; border-radius: 3px; background: var(--uf-win); }
.uf-toast-enter-active, .uf-toast-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.uf-toast-enter-from, .uf-toast-leave-to { opacity: 0; transform: translateY(8px); }
@media (prefers-reduced-motion: reduce) { .uf-toast-enter-active, .uf-toast-leave-active { transition: none; } }
</style>
