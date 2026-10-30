<script setup lang="ts">
/**
 * Coaches › Find a coach (UI v3): the bookable-coaching marketplace (live 1:1 sessions and one-off paid VOD
 * reviews). Not rosters, not Squad. Read-only here: "Book a session" hands off to the web booking modal
 * (/coaches/{id}?book=1) in the signed-in web shell, because payment stays on the web.
 */
import { computed, ref, watch } from 'vue'
import UfButton from '../UfButton.vue'
import UfSkeleton from '../UfSkeleton.vue'
import UfTabs from '../UfTabs.vue'
import { usePrimaryGame } from '../../../composables/usePrimaryGame'
import { useStaleLoad } from '../../../lib/stale-cache'
import { openWebFeature } from '../../../lib/web-explore-links'
import {
  filterCoaches, rateLabel, ratingLabel, sortCoaches, toMarketCoach, toMarketCoachDetail, toReviewOffer,
  type CoachSort, type MarketCoach, type MarketCoachDetail, type ReviewOffer,
} from './marketplace'

const { primaryGame, label: gameLabel } = usePrimaryGame()

async function loadCoaches(): Promise<MarketCoach[]> {
  const res = await window.api.market.listCoaches(primaryGame.value)
  if (!res.ok) throw new Error(res.error)
  return res.coaches.map(toMarketCoach).filter((c): c is MarketCoach => c !== null)
}
const list = useStaleLoad(() => `market:coaches:${primaryGame.value}`, loadCoaches)
watch(primaryGame, () => { selectedId.value = null; void list.reload() })

const sort = ref<CoachSort>('rating')
const role = ref<string>('all')
const roles = computed(() => {
  const all = new Set<string>()
  for (const c of list.data.value ?? []) c.roles.forEach(r => all.add(r))
  return [...all].sort()
})
const shown = computed(() => sortCoaches(filterCoaches(list.data.value ?? [], { role: role.value === 'all' ? null : role.value }), sort.value))

const selectedId = ref<number | null>(null)
const detail = ref<MarketCoachDetail | null>(null)
const offer = ref<ReviewOffer | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)

async function openCoach(c: MarketCoach) {
  selectedId.value = c.id
  detail.value = null
  offer.value = null
  detailError.value = null
  detailLoading.value = true
  try {
    const [res, pricing] = await Promise.all([window.api.market.getCoach(c.id), window.api.market.reviewPricing(c.id)])
    if (selectedId.value !== c.id) return
    if (res.ok) detail.value = toMarketCoachDetail(res.coach)
    else detailError.value = res.error
    offer.value = toReviewOffer(pricing)
  } catch {
    if (selectedId.value === c.id) detailError.value = 'Could not load this coach. Try again.'
  } finally {
    if (selectedId.value === c.id) detailLoading.value = false
  }
}

const selected = computed(() => (list.data.value ?? []).find(c => c.id === selectedId.value) ?? null)
const profile = computed<MarketCoach | MarketCoachDetail | null>(() => detail.value ?? selected.value)

function book(c: MarketCoach) { void openWebFeature(`/coaches/${c.id}?book=1`, true) }
function openWebProfile(c: MarketCoach) { void openWebFeature(`/coaches/${c.id}`, true) }

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?'
const fmtSlot = (s: { start: number; end: number }) => {
  const d = new Date(s.start)
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}
const fmtDay = (t: number | null) => (t == null ? '' : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))
</script>

<template>
  <section class="fc3" aria-label="Find a coach">
    <div class="fc3-bar">
      <p class="uf-t2" style="margin: 0">Book a live 1:1 session with a {{ gameLabel }} coach. Booking and payment open on upforge.gg.</p>
      <div class="fc3-filters">
        <UfTabs size="filter" label="Sort coaches" :model-value="sort"
          :items="[{ key: 'rating', label: 'Top rated' }, { key: 'price', label: 'Price' }, { key: 'sessions', label: 'Most sessions' }]"
          @update:model-value="sort = $event as CoachSort" />
        <UfTabs v-if="roles.length > 1" size="filter" label="Role" :model-value="role"
          :items="[{ key: 'all', label: 'All roles' }, ...roles.map(r => ({ key: r, label: r }))]"
          @update:model-value="role = $event" />
      </div>
    </div>
    <div v-if="list.refreshing.value" class="uf-refreshing" aria-hidden="true" />

    <div v-if="list.loading.value" aria-busy="true" aria-label="Loading coaches" class="fc3-skel">
      <div v-for="i in 4" :key="i" class="fc3-row is-skel"><UfSkeleton :w="44" :h="44" /><span class="fc3-skel-lines"><UfSkeleton w="28%" :h="15" /><UfSkeleton w="44%" :h="13" /></span><UfSkeleton :w="90" :h="15" /></div>
    </div>

    <div v-else-if="list.error.value && !list.data.value" class="fc3-state">
      <p class="uf-t3">Couldn't load coaches.</p>
      <UfButton variant="link" @click="list.reload()">Try again</UfButton>
    </div>

    <div v-else-if="!shown.length" class="fc3-state">
      <p class="uf-t3">No {{ gameLabel }} coaches are taking bookings yet.</p>
      <p class="uf-t4">New coaches are approved regularly. You can also browse every game on the web.</p>
      <UfButton variant="link" @click="openWebFeature('/coaches', true)">Browse all coaches on upforge.gg</UfButton>
    </div>

    <div v-else class="fc3-body">
      <ul class="fc3-list" role="list">
        <li v-for="c in shown" :key="c.id">
          <button type="button" class="fc3-row uf-reveal" :class="{ 'is-on': selectedId === c.id }" :aria-pressed="selectedId === c.id" @click="openCoach(c)">
            <img v-if="c.avatarUrl" :src="c.avatarUrl" alt="" class="fc3-av">
            <span v-else class="fc3-av fc3-av--init" aria-hidden="true">{{ initial(c.name) }}</span>
            <span class="fc3-who">
              <span class="uf-t3">{{ c.name }}</span>
              <span class="uf-t4">{{ [c.currentRank, c.roles.join(' · '), c.languages.join(', ')].filter(Boolean).join('  ·  ') || 'Coach' }}</span>
            </span>
            <span class="fc3-meta">
              <span class="uf-t3 uf-num">{{ rateLabel(c) ?? 'Price on profile' }}</span>
              <span class="uf-t4">{{ ratingLabel(c) }}</span>
            </span>
          </button>
        </li>
      </ul>

      <aside v-if="profile" class="fc3-profile uf-reveal" :aria-label="`${profile.name} profile`">
        <header class="fc3-ph">
          <img v-if="profile.avatarUrl" :src="profile.avatarUrl" alt="" class="fc3-av fc3-av--lg">
          <span v-else class="fc3-av fc3-av--lg fc3-av--init" aria-hidden="true">{{ initial(profile.name) }}</span>
          <div class="fc3-ph-t">
            <h2 class="uf-d4" style="margin: 0; text-transform: uppercase">{{ profile.name }}</h2>
            <span class="uf-t4">{{ [profile.currentRank && `Rank ${profile.currentRank}`, profile.peakRank && `Peak ${profile.peakRank}`].filter(Boolean).join(' · ') }}</span>
          </div>
        </header>

        <dl class="fc3-facts">
          <div><dt class="uf-label">Rate</dt><dd class="uf-t3 uf-num">{{ rateLabel(profile) ?? 'See profile' }}</dd></div>
          <div><dt class="uf-label">Rating</dt><dd class="uf-t3">{{ ratingLabel(profile) }}</dd></div>
          <div><dt class="uf-label">Sessions</dt><dd class="uf-t3 uf-num">{{ profile.sessionCount }}</dd></div>
          <div v-if="detail?.nextSlot"><dt class="uf-label">Next open slot</dt><dd class="uf-t3">{{ fmtSlot(detail.nextSlot) }}</dd></div>
        </dl>

        <div v-if="detailLoading" aria-busy="true" class="fc3-skel-lines"><UfSkeleton w="90%" :h="13" /><UfSkeleton w="70%" :h="13" /></div>
        <p v-else-if="detailError" class="uf-t4">{{ detailError }}</p>
        <template v-else>
          <p v-if="profile.bio" class="uf-t2 fc3-bio">{{ profile.bio }}</p>
          <p v-if="profile.specialties.length" class="uf-t4">Focus: {{ profile.specialties.join(' · ') }}</p>
          <p v-if="detail?.acceptingStudents === false" class="uf-t4">Not taking new bookings right now.</p>
        </template>

        <div class="fc3-actions">
          <UfButton variant="primary" icon="play" :disabled="detail?.acceptingStudents === false" @click="book(profile)">Book a session</UfButton>
          <UfButton variant="link" @click="openWebProfile(profile)">Full profile</UfButton>
        </div>
        <p class="uf-t4" style="margin: 0">Opens the booking page on upforge.gg. Your booking appears under Bookings once it's confirmed.</p>

        <section v-if="offer" class="fc3-sec">
          <span class="uf-label">Paid VOD review</span>
          <p class="uf-t4" style="margin: 0">{{ offer.priceLabel }} per match{{ offer.turnaround ? ` · back within ${offer.turnaround}` : '' }}. Request it from a match's result on upforge.gg.</p>
        </section>

        <section v-if="detail?.reviews.length" class="fc3-sec">
          <span class="uf-label">Recent reviews</span>
          <ul class="fc3-reviews" role="list">
            <li v-for="r in detail.reviews.slice(0, 3)" :key="r.id">
              <span class="uf-t4">{{ r.author }}{{ r.rating != null ? ` · ${r.rating} / 5` : '' }}{{ r.at ? ` · ${fmtDay(r.at)}` : '' }}</span>
              <p v-if="r.text" class="uf-t2" style="margin: 0">{{ r.text }}</p>
            </li>
          </ul>
        </section>
      </aside>
      <aside v-else class="fc3-profile fc3-profile--empty">
        <p class="uf-t4" style="margin: 0">Pick a coach to see their rate, next open slot and reviews.</p>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.fc3 { position: relative; display: flex; flex-direction: column; gap: 18px; }
.fc3-bar { display: flex; justify-content: space-between; align-items: flex-end; gap: 18px; flex-wrap: wrap; }
.fc3-filters { display: flex; gap: 18px; flex-wrap: wrap; }
.fc3-body { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 36px; align-items: start; }
.fc3-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--uf-line); }
.fc3-row { width: 100%; display: flex; align-items: center; gap: 14px; padding: 12px 10px; background: none; border: 0; border-bottom: 1px solid var(--uf-line); color: inherit; text-align: left; cursor: pointer; font: inherit; }
.fc3-row:hover { background: var(--uf-hover); }
.fc3-row.is-on { background: var(--uf-raised); box-shadow: inset 2px 0 0 var(--uf-red); }
.fc3-row.is-skel { cursor: default; }
.fc3-row:focus-visible { outline: 2px solid var(--uf-red); outline-offset: -2px; }
.fc3-av { width: 44px; height: 44px; object-fit: cover; flex: none; background: var(--uf-raised); }
.fc3-av--lg { width: 64px; height: 64px; }
.fc3-av--init { display: inline-flex; align-items: center; justify-content: center; font: 700 16px/1 var(--uf-display); color: var(--uf-muted); }
.fc3-who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.fc3-who .uf-t4 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fc3-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex: none; }
.fc3-profile { position: sticky; top: 0; display: flex; flex-direction: column; gap: 16px; padding-left: 28px; border-left: 1px solid var(--uf-line); }
.fc3-profile--empty { min-height: 120px; justify-content: center; }
.fc3-ph { display: flex; gap: 14px; align-items: center; }
.fc3-ph-t { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.fc3-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; margin: 0; }
.fc3-facts div { display: flex; flex-direction: column; gap: 6px; }
.fc3-facts dd { margin: 0; }
.fc3-bio { margin: 0; max-width: 62ch; }
.fc3-actions { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
.fc3-sec { display: flex; flex-direction: column; gap: 8px; padding-top: 14px; border-top: 1px solid var(--uf-line); }
.fc3-reviews { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.fc3-reviews li { display: flex; flex-direction: column; gap: 4px; }
.fc3-state { display: flex; flex-direction: column; gap: 10px; padding: 24px 0; max-width: 640px; }
.fc3-state p { margin: 0; }
.fc3-skel { display: flex; flex-direction: column; }
.fc3-skel-lines { display: flex; flex-direction: column; gap: 8px; flex: 1; }
@media (max-width: 980px) { .fc3-body { grid-template-columns: minmax(0, 1fr); } .fc3-profile { position: static; padding-left: 0; border-left: 0; border-top: 1px solid var(--uf-line); padding-top: 18px; } }
</style>
