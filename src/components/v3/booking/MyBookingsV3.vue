<script setup lang="ts">
/**
 * Coaches › Bookings (UI v3): live 1:1 sessions booked through the coach marketplace, plus one-off paid VOD
 * reviews. Roster reviews stay on "Your coaches". Read-only: cancel, reschedule, join and rate open the web
 * session page; completed paid reviews open the match page in coach-notes mode (Valorant) or the web result.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import UfButton from '../UfButton.vue'
import UfSkeleton from '../UfSkeleton.vue'
import { useStaleLoad } from '../../../lib/stale-cache'
import { openWebFeature } from '../../../lib/web-explore-links'
import { openAnalysisVodReview } from '../../../lib/open-vod-review'
import { plural } from '../../../lib/plural'
import { groupSessions, sessionWhen, toMarketSession, toPaidReview, type MarketSession, type PaidReview } from './marketplace'

const emit = defineEmits<{ findCoach: [] }>()
const router = useRouter()

async function load(): Promise<{ sessions: MarketSession[]; reviews: PaidReview[] }> {
  const [s, r] = await Promise.all([window.api.market.mySessions(), window.api.market.myReviews()])
  if (!s.ok && !r.ok) throw new Error(s.error)
  return {
    sessions: s.ok ? s.sessions.map(x => toMarketSession(x)).filter((x): x is MarketSession => x !== null) : [],
    reviews: r.ok ? r.reviews.map(toPaidReview).filter((x): x is PaidReview => x !== null) : [],
  }
}
const state = useStaleLoad('market:bookings', load)
// Re-shape on read so "upcoming" follows the clock even when the data comes from cache.
const groups = computed(() => groupSessions((state.data.value?.sessions ?? []).map(s => ({ ...s, group: (s.status === 'pending' || s.status === 'confirmed' || s.status === 'unknown') && s.start + s.minutes * 60_000 > Date.now() ? 'upcoming' as const : 'past' as const }))))
const reviews = computed(() => state.data.value?.reviews ?? [])
const empty = computed(() => !groups.value.upcoming.length && !groups.value.past.length && !reviews.value.length)

function openSession(s: MarketSession) { void openWebFeature(`/coaching/session/${s.id}`, true) }
function openReview(r: PaidReview) {
  if (!r.analysisId) return
  const game = r.game || 'valorant'
  if (game === 'valorant') {
    void openAnalysisVodReview(router, r.analysisId, { coachNotes: true, source: 'desktop_bookings' })
      .then(ok => { if (!ok) void openWebFeature(`/${game}/results/${r.analysisId}`, true) })
      .catch(() => {})
    return
  }
  void openWebFeature(`/${game}/results/${r.analysisId}`, true)
}
const fmtDay = (t: number | null) => (t == null ? '' : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))
</script>

<template>
  <section class="mb3" aria-label="Bookings">
    <div v-if="state.refreshing.value" class="uf-refreshing" aria-hidden="true" />

    <div v-if="state.loading.value" aria-busy="true" aria-label="Loading bookings" class="mb3-sec">
      <UfSkeleton :w="110" :h="12" />
      <div v-for="i in 3" :key="i" class="mb3-row"><UfSkeleton :w="160" :h="15" /><UfSkeleton w="40%" :h="13" /><UfSkeleton :w="90" :h="13" /></div>
    </div>

    <div v-else-if="state.error.value && !state.data.value" class="mb3-state">
      <p class="uf-t3">Couldn't load your bookings.</p>
      <UfButton variant="link" @click="state.reload()">Try again</UfButton>
    </div>

    <div v-else-if="empty" class="mb3-state">
      <p class="uf-t3">No bookings yet.</p>
      <p class="uf-t4">Book a live session with a coach and it shows up here with its time, status and the coach's notes.</p>
      <UfButton variant="link" @click="emit('findCoach')">Find a coach</UfButton>
    </div>

    <template v-else>
      <div v-if="groups.upcoming.length" class="mb3-sec uf-reveal">
        <span class="uf-label">Upcoming · {{ plural(groups.upcoming.length, 'session') }}</span>
        <div v-for="s in groups.upcoming" :key="s.id" class="mb3-row">
          <span class="uf-t3 uf-num">{{ sessionWhen(s) }}</span>
          <span class="uf-t2">{{ s.coachName }}</span>
          <span class="uf-t4">{{ s.statusLabel }}</span>
          <UfButton variant="link" @click="openSession(s)">Open session</UfButton>
        </div>
      </div>

      <div v-if="reviews.length" class="mb3-sec uf-reveal">
        <span class="uf-label">Paid VOD reviews</span>
        <div v-for="r in reviews" :key="r.id" class="mb3-row">
          <span class="uf-t3">{{ r.coachName }}</span>
          <span class="uf-t4">{{ r.statusLabel }}{{ r.completedAt ? ` · ${fmtDay(r.completedAt)}` : r.requestedAt ? ` · requested ${fmtDay(r.requestedAt)}` : '' }}</span>
          <span />
          <UfButton v-if="r.status === 'completed' && r.analysisId" variant="link" @click="openReview(r)">Read notes</UfButton>
          <span v-else />
        </div>
      </div>

      <div v-if="groups.past.length" class="mb3-sec uf-reveal">
        <span class="uf-label">Past sessions</span>
        <div v-for="s in groups.past" :key="s.id" class="mb3-past">
          <div class="mb3-row">
            <span class="uf-t3 uf-num">{{ sessionWhen(s) }}</span>
            <span class="uf-t2">{{ s.coachName }}</span>
            <span class="uf-t4">{{ s.statusLabel }}</span>
            <UfButton variant="link" @click="openSession(s)">Open session</UfButton>
          </div>
          <div v-if="s.coachNotes || s.actionItems.length" class="mb3-notes">
            <p v-if="s.coachNotes" class="uf-t2" style="margin: 0">{{ s.coachNotes }}</p>
            <ul v-if="s.actionItems.length" class="mb3-items" role="list">
              <li v-for="(a, i) in s.actionItems" :key="i" class="uf-t4">{{ a }}</li>
            </ul>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.mb3 { position: relative; display: flex; flex-direction: column; gap: 28px; }
.mb3-sec { display: flex; flex-direction: column; }
.mb3-sec > .uf-label { padding-bottom: 10px; }
.mb3-row { display: grid; grid-template-columns: minmax(180px, 1.1fr) minmax(0, 1fr) minmax(0, 0.9fr) auto; gap: 16px; align-items: baseline; padding: 12px 0; border-top: 1px solid var(--uf-line); }
.mb3-past .mb3-row { border-top: 1px solid var(--uf-line); }
.mb3-notes { display: flex; flex-direction: column; gap: 6px; padding: 0 0 12px; max-width: 70ch; }
.mb3-items { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; }
.mb3-state { display: flex; flex-direction: column; gap: 10px; padding: 24px 0; max-width: 640px; }
.mb3-state p { margin: 0; }
@media (max-width: 860px) { .mb3-row { grid-template-columns: minmax(0, 1fr); gap: 4px; } }
</style>
