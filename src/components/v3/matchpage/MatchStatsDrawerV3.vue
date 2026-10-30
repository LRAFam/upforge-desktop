<script setup lang="ts">
/**
 * Game-specific match stats on the v3 match page, as a collapsible row under the header.
 * CS2: deep tabs from the parsed demo (match_stats v1 + rounds). Valorant: Rounds · Duels · Economy
 * from the recording timeline (board 18b). Deadlock: the replay review (souls, items, abilities,
 * fights) when this recording has one. Other games render nothing.
 */
import { computed, ref, watch } from 'vue'
import { useVodReview } from '../../../composables/useVodReview'
import Cs2MatchTabsV3 from './cs2/Cs2MatchTabsV3.vue'
import { buildCs2MatchView, type Cs2StatsV1 } from './cs2/cs2-match-view'
import DeadlockReviewContentV3 from '../games/DeadlockReviewContentV3.vue'
import ValorantMatchTabsV3 from './valorant/ValorantMatchTabsV3.vue'
import { buildValorantMatchView, type ValorantTimelineLike } from './valorant/valorant-match-view'

const { timeline, recordingId, roundGroups, seekToRound } = useVodReview()
const game = computed(() => timeline.value?.game ?? null)

const cs2View = computed(() => {
  if (game.value !== 'cs2' || !timeline.value) return null
  const t = timeline.value as typeof timeline.value & { match_stats?: Cs2StatsV1 | null }
  return buildCs2MatchView(t.match_stats ?? null, { roundSummaries: t.roundSummaries, kills: t.kills, deaths: t.deaths })
})

const valorantView = computed(() => (game.value === 'valorant' && timeline.value ? buildValorantMatchView(timeline.value as unknown as ValorantTimelineLike) : null))
function jumpToRound(round: number) {
  const g = roundGroups.value.find(r => r.roundNumber === round)
  if (g) seekToRound(g)
}

// Deadlock: the review job lives on the recording, not the timeline.
const deadlockJobId = ref<string | null>(null)
watch([game, recordingId], async ([g, id]) => {
  deadlockJobId.value = null
  if (g !== 'deadlock' || !id) return
  const rows = await window.api.recordings.listAll().catch(() => []) as Array<{ id: string; deadlockReviewJobId?: string | null }>
  deadlockJobId.value = rows.find(r => r.id === id)?.deadlockReviewJobId ?? null
}, { immediate: true })

const visible = computed(() => !!cs2View.value || !!valorantView.value || !!deadlockJobId.value)
const KEY = 'uf.matchStatsOpen'
const open = ref((() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })())
watch(open, v => { try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* per-viewer convenience only */ } })

const summary = computed(() => {
  if (cs2View.value) {
    const adr = cs2View.value.headline.find(h => h.label === 'ADR')?.value
    return [cs2View.value.score ? `Score ${cs2View.value.score.replace('-', '–')}` : null, adr && adr !== 'Not measured' ? `ADR ${adr}` : null].filter(Boolean).join(' · ')
  }
  if (valorantView.value) {
    const h = valorantView.value.headline
    const rounds = h.find(x => x.label === 'Rounds won')?.value
    const adr = h.find(x => x.label === 'ADR')?.value
    return [rounds && rounds !== 'Not measured' ? `Rounds ${rounds}` : null, adr && adr !== 'Not measured' ? `ADR ${adr}` : null].filter(Boolean).join(' · ')
  }
  return 'Souls, items, abilities and fights from your replay review'
})
</script>

<template>
  <section v-if="visible" class="msd" :aria-label="game === 'cs2' ? 'CS2 match stats' : game === 'valorant' ? 'Valorant match stats' : 'Deadlock replay review'">
    <button type="button" class="msd-toggle" :aria-expanded="open" @click="open = !open">
      <span class="uf-label">{{ game === 'deadlock' ? 'Replay review' : 'Match stats' }}</span>
      <span class="uf-t4">{{ summary }}</span>
      <span class="uf-t4 msd-chev" aria-hidden="true">{{ open ? 'Hide' : 'Show' }}</span>
    </button>
    <div v-if="open" class="msd-body uf-reveal">
      <Cs2MatchTabsV3 v-if="cs2View" :view="cs2View" />
      <ValorantMatchTabsV3 v-else-if="valorantView" :view="valorantView" @select-round="jumpToRound" />
      <DeadlockReviewContentV3 v-else-if="deadlockJobId" :active="open" :job-id="deadlockJobId" />
    </div>
  </section>
</template>

<style scoped>
.msd { border-bottom: 1px solid var(--uf-line); }
.msd-toggle { display: flex; align-items: baseline; gap: 16px; width: 100%; padding: 10px 40px; background: none; border: 0; color: var(--uf-bone); cursor: pointer; text-align: left; }
.msd-toggle:hover .msd-chev { color: var(--uf-bone); }
.msd-chev { margin-left: auto; }
.msd-body { max-height: 46vh; overflow: auto; padding: 4px 40px 20px; }
</style>
