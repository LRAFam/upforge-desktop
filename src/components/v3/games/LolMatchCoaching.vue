<script setup lang="ts">
/**
 * League Riot-stats coaching (path A) inside the desktop: shown on the match page next to the
 * scoreboard and in Coaching reviews. Uses the analysis the API already has for this Riot match,
 * or asks before spending one analysis to create it. Real data only.
 *
 * `lol:get-analysis` and `lol:analyze-match` are lead-added IPC (see notes-game-league.md);
 * without them the panel links to the web report instead.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import UfButton from '../UfButton.vue'
import UfSkeleton from '../UfSkeleton.vue'
import UfTabs from '../UfTabs.vue'
import { analysisForMatch, lolCoachingView, type LolCoachingView } from '../../../lib/lol-coaching'
import { lolDeepTabs, type LolDeepTabs } from '../../../lib/lol-deep-tabs'

const props = defineProps<{ matchId: string | null }>()

type LolApiExtras = {
  getAnalysis?: (id: number) => Promise<unknown>
  analyzeMatch?: (matchId: string) => Promise<{ ok?: boolean; analysis_id?: number; error?: string } | null>
}
const extras = () => window.api.lol as typeof window.api.lol & LolApiExtras

const loading = ref(true)
const analysisId = ref<number | null>(null)
const view = ref<LolCoachingView | null>(null)
// Board 19b deep tabs, from the same analysis payload (no extra request).
const deep = ref<LolDeepTabs | null>(null)
const tab = ref('coaching')
const tabs = computed(() => {
  const d = deep.value
  const items = [{ key: 'coaching', label: 'Coaching' }]
  if (!d) return items
  if (d.lane.length) items.push({ key: 'lane', label: 'Lane' })
  if (d.deaths.length) items.push({ key: 'deaths', label: `Deaths · ${d.deaths.length}` })
  if (d.objectives.length) items.push({ key: 'objectives', label: 'Objectives' })
  if (d.vision.length) items.push({ key: 'vision', label: 'Vision' })
  return items
})
const deepRows = computed(() => (deep.value && tab.value !== 'coaching' ? deep.value[tab.value as keyof LolDeepTabs] ?? [] : []))
const confirming = ref(false)
const requesting = ref(false)
const requestError = ref<string | null>(null)
let poll: ReturnType<typeof setTimeout> | null = null
let polls = 0
const MAX_POLLS = 36 // 3 minutes at 5 s

// Starting new coaching needs the full Match-V5 id (region prefix); a numeric-only id can still link existing coaching.
const canRequest = computed(() => typeof extras().analyzeMatch === 'function' && /^[A-Z0-9]+_\d+$/i.test(props.matchId ?? ''))

async function loadDetail(id: number) {
  const getAnalysis = extras().getAnalysis
  if (!getAnalysis) return
  const detail = await getAnalysis(id).catch(() => null)
  view.value = lolCoachingView(detail)
  const d = detail as { match_data?: unknown; partial_result?: { match_data?: unknown } } | null
  deep.value = lolDeepTabs(d?.match_data ?? d?.partial_result?.match_data ?? null)
  if (view.value?.status === 'working' && polls < MAX_POLLS) {
    polls++
    poll = setTimeout(() => void loadDetail(id), 5000)
  }
}

async function load() {
  if (poll) clearTimeout(poll)
  polls = 0
  loading.value = true
  view.value = null
  deep.value = null
  tab.value = 'coaching'
  analysisId.value = null
  try {
    if (!props.matchId) return
    const rows = await window.api.lol.getAnalyses(50).catch(() => [])
    const row = analysisForMatch(rows, props.matchId)
    if (!row) return
    analysisId.value = row.id
    await loadDetail(row.id)
  } finally {
    loading.value = false
  }
}

async function requestCoaching() {
  const analyzeMatch = extras().analyzeMatch
  if (!analyzeMatch || !props.matchId) return
  requesting.value = true
  requestError.value = null
  try {
    const res = await analyzeMatch(props.matchId)
    if (res?.analysis_id) {
      confirming.value = false
      analysisId.value = res.analysis_id
      view.value = { status: 'working', summary: null, focus: null, rankLabel: null, improvements: [], strengths: [], moments: [], drills: [], lane: [], error: null }
      polls = 0
      poll = setTimeout(() => void loadDetail(res.analysis_id!), 5000)
    } else {
      requestError.value = res?.error ?? 'Coaching could not be started. Try again in a minute.'
    }
  } finally {
    requesting.value = false
  }
}

function openWeb() { void window.api.lol.openAnalyze() }

watch(() => props.matchId, () => void load(), { immediate: true })
onBeforeUnmount(() => { if (poll) clearTimeout(poll) })
</script>

<template>
  <section class="lolc" aria-label="League stats coaching">
    <span class="uf-label">Riot stats coaching</span>

    <div v-if="loading" class="lolc-col" aria-busy="true">
      <UfSkeleton :w="'70%'" :h="22" />
      <UfSkeleton :lines="3" />
    </div>

    <p v-else-if="!matchId" class="uf-t4">This recording has no Riot match id, so stats coaching can't be linked to it.</p>

    <template v-else-if="view?.status === 'ready'">
      <UfTabs v-if="tabs.length > 1" v-model="tab" :items="tabs" size="filter" label="Match detail" />

      <div v-if="tab !== 'coaching'" class="lolc-col uf-reveal">
        <div v-for="(r, i) in deepRows" :key="i" class="lolc-row">
          <span class="uf-t4 lolc-k uf-num">{{ r.k }}</span>
          <span class="lolc-col lolc-tight"><span class="uf-t3">{{ r.text }}</span><span v-if="r.sub" class="uf-t4">{{ r.sub }}</span></span>
        </div>
      </div>

      <template v-else>
      <div class="lolc-col uf-reveal">
        <p v-if="view.focus" class="uf-t1">{{ view.focus }}</p>
        <p v-if="view.summary" class="uf-t2">{{ view.summary }}</p>
        <span v-if="view.rankLabel" class="uf-t4">Coached at {{ view.rankLabel }}</span>
      </div>

      <div v-if="view.lane.length" class="lolc-col">
        <span class="uf-label">Lane</span>
        <div v-for="l in view.lane" :key="l.minute" class="lolc-row"><span class="uf-t4 lolc-k">{{ l.minute }}</span><span class="uf-t3">{{ l.text }}</span></div>
      </div>

      <div v-if="view.improvements.length" class="lolc-col">
        <span class="uf-label">Fix next</span>
        <div v-for="(imp, i) in view.improvements" :key="i" class="lolc-row">
          <span class="uf-t4 lolc-k">{{ imp.theme }}</span>
          <span class="lolc-col lolc-tight"><span class="uf-t3">{{ imp.issue }}</span><span class="uf-t2">{{ imp.fix }}</span></span>
        </div>
      </div>

      <div v-if="view.moments.length" class="lolc-col">
        <span class="uf-label">Moments</span>
        <div v-for="(m, i) in view.moments" :key="i" class="lolc-row">
          <span class="uf-t4 lolc-k uf-num">{{ m.timestamp }}</span>
          <span class="lolc-col lolc-tight"><span class="uf-t3">{{ m.title }}</span><span class="uf-t2">{{ m.note }}</span></span>
        </div>
      </div>

      <div v-if="view.drills.length" class="lolc-col">
        <span class="uf-label">Practice</span>
        <div v-for="(d, i) in view.drills" :key="i" class="lolc-row">
          <span class="uf-t4 lolc-k">{{ d.frequency ?? '' }}</span>
          <span class="lolc-col lolc-tight"><span class="uf-t3">{{ d.title }}</span><span class="uf-t2">{{ d.description }}</span></span>
        </div>
      </div>
      </template>
    </template>

    <p v-else-if="view?.status === 'working'" class="uf-t2 uf-refreshing">Riot stats coaching is being written. It usually takes under a minute after Riot publishes the match.</p>

    <div v-else-if="view?.status === 'failed'" class="lolc-col">
      <p class="uf-t2">{{ view.error ?? 'Coaching could not be generated for this match.' }}</p>
    </div>

    <div v-else class="lolc-col">
      <p class="uf-t2">No stats coaching for this match yet. It reads your Riot match data: lane CS and gold against your opponent, deaths, objectives and vision.</p>
      <template v-if="canRequest">
        <UfButton v-if="!confirming" variant="secondary" @click="confirming = true">Get stats coaching</UfButton>
        <div v-else class="lolc-row lolc-confirm">
          <span class="uf-t3 lolc-grow">This uses 1 analysis from your plan.</span>
          <UfButton variant="primary" :disabled="requesting" @click="requestCoaching()">{{ requesting ? 'Starting…' : 'Use 1 analysis' }}</UfButton>
          <UfButton variant="link" @click="confirming = false">Cancel</UfButton>
        </div>
        <p v-if="requestError" class="uf-t4" role="alert">{{ requestError }}</p>
      </template>
      <UfButton v-else variant="link" @click="openWeb()">Open stats coaching on upforge.gg</UfButton>
    </div>
  </section>
</template>

<style scoped>
.lolc { display: flex; flex-direction: column; gap: 18px; padding: 20px 24px; border-top: 1px solid var(--uf-line); }
.lolc-col { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.lolc-tight { gap: 2px; }
.lolc-row { display: flex; gap: 16px; align-items: baseline; padding: 10px 0; border-top: 1px solid var(--uf-line); }
.lolc-k { width: 72px; flex: none; text-transform: uppercase; letter-spacing: 0.08em; }
.lolc-grow { flex: 1; }
.lolc-confirm { align-items: center; }
</style>
