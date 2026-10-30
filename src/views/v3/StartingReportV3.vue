<script setup lang="ts">
/**
 * Starting report (v3): how a new player plays right now, from their last matches.
 * One per game, generated once by the API. Can start the suggested focus (Valorant, League).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UfButton from '../../components/v3/UfButton.vue'
import UfSkeleton from '../../components/v3/UfSkeleton.vue'
import { loadingLine, startingReportView, type StartingGame } from '../../lib/starting-report'
import { useStartingReport } from '../../components/v3/starting/useStartingReport'

const route = useRoute()
const router = useRouter()
const game = computed<StartingGame>(() => {
  const g = route.params.game
  return g === 'lol' || g === 'deadlock' || g === 'cs2' ? g : 'valorant'
})
const { data, loading, generating, load } = useStartingReport(game)
const view = computed(() => startingReportView(data.value))
const focusState = ref<'idle' | 'starting' | 'started' | 'failed'>('idle')

onMounted(() => { void load({ generate: true }) })
watch(game, () => { void load({ generate: true }) })

async function startFocus() {
  if (game.value !== 'valorant' && game.value !== 'lol') return
  focusState.value = 'starting'
  const res = await window.api?.app?.startStartingFocus?.(game.value).catch(() => null)
  focusState.value = res?.ok ? 'started' : 'failed'
}
function back() { if (window.history.length > 1) router.back(); else void router.push('/dashboard') }
</script>

<template>
  <div class="sr3">
    <button type="button" class="uf-link sr3-back" @click="back">← Back</button>
    <span class="uf-label">Your starting report</span>

    <template v-if="loading || generating">
      <h1 class="uf-d3">{{ loadingLine(game) }}</h1>
      <UfSkeleton :lines="4" :w="'min(640px, 100%)'" />
    </template>

    <template v-else-if="view.kind === 'ready'">
      <h1 class="uf-d3">{{ view.title }}</h1>
      <p class="uf-t4">{{ view.record }}<span v-if="view.pool.length"> · {{ view.pool.join(' · ') }}</span></p>
      <div class="sr3-summary uf-reveal">
        <p v-for="(s, i) in view.summary" :key="i" class="uf-t1">{{ s }}</p>
      </div>

      <div class="sr3-cols">
        <section class="sr3-col">
          <span class="uf-label">What's costing you games</span>
          <p v-for="(h, i) in view.habits" :key="i" class="uf-t3">{{ h }}</p>
          <span class="uf-label sr3-gap">What you do well</span>
          <p v-for="(s, i) in view.strengths" :key="i" class="uf-t3">{{ s }}</p>
        </section>
        <section class="sr3-col">
          <span class="uf-label">Your numbers</span>
          <dl>
            <div v-for="row in view.stats" :key="row.label" class="sr3-row"><dt class="uf-t4">{{ row.label }}</dt><dd class="uf-t3 uf-num">{{ row.value }}</dd></div>
          </dl>
        </section>
      </div>

      <section v-if="view.focus" class="sr3-focus">
        <span class="uf-label">Your first focus</span>
        <p class="uf-t3">{{ view.focus.label }}</p>
        <p v-if="view.focus.reason" class="uf-t2">{{ view.focus.reason }}</p>
        <p v-if="view.focus.target" class="uf-t4">{{ view.focus.target }}</p>
        <div v-if="view.focus.canStart" class="sr3-actions">
          <UfButton v-if="focusState !== 'started'" variant="primary" :disabled="focusState === 'starting'" @click="startFocus">
            {{ focusState === 'starting' ? 'Starting…' : 'Start this focus' }}
          </UfButton>
          <p v-if="focusState === 'started'" class="uf-t3" style="color: var(--uf-win)">Focus started. Your next matches are checked against it.</p>
          <p v-if="focusState === 'failed'" class="uf-t4">You already have a focus running, or it couldn't be started. Your current focus stays as it is.</p>
        </div>
      </section>

      <p class="uf-t2 sr3-next">{{ view.next }}</p>
    </template>

    <template v-else-if="view.kind === 'insufficient'">
      <h1 class="uf-d3">Not enough matches yet</h1>
      <p class="uf-t2">We found {{ view.available === 1 ? '1 match' : `${view.available} matches` }}. Play {{ view.needed - view.available === 1 ? '1 more' : `${view.needed - view.available} more` }} and your starting report is written automatically.</p>
    </template>

    <template v-else>
      <h1 class="uf-d3">Couldn't load your starting report</h1>
      <UfButton variant="secondary" @click="load({ generate: true })">Try again</UfButton>
    </template>
  </div>
</template>

<style scoped>
.sr3 { display: flex; flex-direction: column; gap: 14px; padding: 32px 40px 48px; max-width: 1080px; }
.sr3-back { align-self: flex-start; }
.sr3-summary { display: flex; flex-direction: column; gap: 10px; max-width: 820px; }
.sr3-cols { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 40px; margin-top: 16px; }
.sr3-col { display: flex; flex-direction: column; gap: 8px; }
.sr3-gap { margin-top: 14px; }
.sr3-row { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-bottom: 1px solid var(--uf-line); }
.sr3-row dd { margin: 0; }
.sr3-focus { display: flex; flex-direction: column; gap: 6px; padding-top: 18px; border-top: 1px solid var(--uf-line); margin-top: 8px; }
.sr3-actions { display: flex; align-items: center; gap: 14px; margin-top: 6px; }
.sr3-next { margin-top: 10px; }
@media (max-width: 900px) { .sr3-cols { grid-template-columns: minmax(0, 1fr); } }
</style>
