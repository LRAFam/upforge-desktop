<script setup lang="ts">
/**
 * Match report (v3): the free, data-only coaching page for one match. No video, no credit.
 * Headline (result, score, what decided it) · facts · focus check · coach notes · next steps.
 * Reads the stored report via match-report:get; never generates one.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UfHeroBand from '../../components/v3/UfHeroBand.vue'
import UfButton from '../../components/v3/UfButton.vue'
import UfSkeleton from '../../components/v3/UfSkeleton.vue'
import { formatMapLabel, getAgentImage, getMapImage } from '../../lib/valorant'
import { matchReportView, type MatchReportState } from '../../lib/match-report'
import { readCache, writeCache } from '../../lib/stale-cache'

const route = useRoute()
const router = useRouter()
const matchId = computed(() => String(route.params.matchId ?? ''))
const state = ref<MatchReportState | null>(null)

async function load(): Promise<void> {
  const id = matchId.value
  const key = `match-report:${id}`
  const cached = readCache<MatchReportState>(key)
  state.value = cached?.value ?? null
  const res = await window.api?.app?.getMatchReport?.(id).catch(() => null)
  if (id !== matchId.value) return
  if (!res) { if (!state.value) state.value = { kind: 'error' }; return }
  if (res.ok) {
    const next: MatchReportState = { kind: 'ready', view: matchReportView(res.report) }
    state.value = next
    writeCache(key, next)
  } else if (!state.value || state.value.kind !== 'ready') {
    state.value = res.error === 'not_found' ? { kind: 'not_found' } : { kind: 'error' }
  }
}
onMounted(load)
watch(matchId, load)

const view = computed(() => (state.value?.kind === 'ready' ? state.value.view : null))
const resultWord = computed(() => (view.value?.result === 'win' ? 'Victory' : view.value?.result === 'loss' ? 'Defeat' : 'Match'))
const meta = computed(() => [view.value?.map ? formatMapLabel(view.value.map) : null, view.value?.agent].filter(Boolean).join(' · '))

function practise(): void { router.push('/training').catch(() => {}) }
function back(): void { if (window.history.length > 1) router.back(); else router.push('/dashboard').catch(() => {}) }
</script>

<template>
  <div class="mr3">
    <!-- First load: skeleton in the page's shape -->
    <template v-if="!state">
      <UfSkeleton :h="220" />
      <div class="mr3-body"><UfSkeleton :w="520" :h="28" /><UfSkeleton :lines="3" :w="420" /></div>
    </template>

    <div v-else-if="state.kind !== 'ready'" class="mr3-empty uf-rise">
      <span class="uf-label">Match report</span>
      <h1 class="uf-d3">{{ state.kind === 'not_found' ? 'No report for this match yet' : 'Couldn’t load this report' }}</h1>
      <p class="uf-t2">
        {{ state.kind === 'not_found'
          ? 'Reports are made from your Riot match a minute or two after it ends. Valorant only for now.'
          : 'Check your connection and try again.' }}
      </p>
      <div class="mr3-actions">
        <UfButton v-if="state.kind === 'error'" variant="primary" @click="load">Try again</UfButton>
        <UfButton variant="secondary" @click="back">Back</UfButton>
      </div>
    </div>

    <template v-else-if="view">
      <UfHeroBand
        :art="view.map ? getMapImage(view.map) || undefined : undefined"
        :agent="view.agent ? getAgentImage(view.agent) || undefined : undefined"
        :tone="view.result ?? 'none'"
        :result="resultWord"
        :meta="meta"
        :height="220"
      >
        <span v-if="view.score" class="uf-d2">{{ view.score }}</span>
      </UfHeroBand>

      <div class="mr3-body uf-reveal">
        <button type="button" class="uf-link mr3-back" @click="back">← Back</button>

        <section class="mr3-coach">
          <span class="uf-label">What decided it</span>
          <p v-if="view.headline" class="uf-t1">{{ view.headline }}</p>
          <p v-else-if="view.notesCapped" class="uf-t2">Today’s free coach notes are used. The facts below are still yours, and notes come back tomorrow.</p>
          <p v-else class="uf-t2">No coach note for this match. The facts below come straight from your Riot match.</p>
          <p v-if="view.subline" class="uf-t2">{{ view.subline }}</p>
          <p v-if="view.isAlt" class="uf-t4">Played on an alt account: coached, not counted for your focus.</p>
        </section>

        <div class="mr3-cols">
          <section class="mr3-facts">
            <span class="uf-label">The match</span>
            <dl>
              <div v-for="row in view.facts" :key="row.label" class="mr3-row">
                <dt class="uf-t4">{{ row.label }}</dt><dd class="uf-t3 uf-num">{{ row.value }}</dd>
              </div>
            </dl>
            <p v-if="!view.facts.length" class="uf-t4">No match facts were recorded.</p>
          </section>

          <section class="mr3-side">
            <div v-if="view.focusCheck" class="mr3-focus">
              <span class="uf-label">Your focus</span>
              <p class="uf-t3">{{ view.focusCheck.label }}</p>
              <p class="uf-t4" :style="{ color: view.focusCheck.hit ? 'var(--uf-win)' : 'var(--uf-loss)' }">
                {{ view.focusCheck.hit ? 'On target this match' : 'Missed this match' }}
              </p>
            </div>
            <div v-if="view.positive" class="mr3-focus">
              <span class="uf-label">What went well</span>
              <p class="uf-t3">{{ view.positive }}</p>
            </div>
            <div v-if="view.nextSteps.length" class="mr3-next">
              <span class="uf-label">Next game</span>
              <ol>
                <li v-for="(step, i) in view.nextSteps" :key="i" class="uf-t3">{{ step.text }}</li>
              </ol>
              <UfButton v-if="view.nextSteps.some(s => s.drillMetric)" variant="secondary" icon="practice" @click="practise">Practise this</UfButton>
            </div>
            <!-- Reserved: "Review a round" (paid, visual). Hidden until round-review pricing is decided. -->
          </section>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mr3 { display: flex; flex-direction: column; min-height: 100%; }
.mr3-body { display: flex; flex-direction: column; gap: 28px; padding: 24px 40px 48px; }
.mr3-back { align-self: flex-start; }
.mr3-coach { display: flex; flex-direction: column; gap: 10px; max-width: 760px; }
.mr3-cols { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 48px; }
.mr3-facts dl { margin: 12px 0 0; }
.mr3-row { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-top: 1px solid var(--uf-line); }
.mr3-row dd { margin: 0; }
.mr3-side { display: flex; flex-direction: column; gap: 24px; }
.mr3-focus, .mr3-next { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; border-top: 1px solid var(--uf-line); }
.mr3-next ol { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
.mr3-next :deep(button) { align-self: flex-start; margin-top: 6px; }
.mr3-empty { display: flex; flex-direction: column; gap: 12px; padding: 64px 40px; max-width: 640px; }
.mr3-actions { display: flex; gap: 12px; margin-top: 8px; }
@media (max-width: 900px) { .mr3-cols { grid-template-columns: minmax(0, 1fr); } .mr3-body { padding: 20px; } }
</style>
