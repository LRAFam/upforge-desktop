<script setup lang="ts">
/**
 * Starting report (v3): how a new player plays right now, from their last matches.
 * One per game, generated once by the API. Can start the suggested focus (Valorant, League).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UfButton from '../../components/v3/UfButton.vue'
import UfSkeleton from '../../components/v3/UfSkeleton.vue'
import { insufficientLine, loadingLine, startingReportView, type StartingGame } from '../../lib/starting-report'
import { useStartingReport } from '../../components/v3/starting/useStartingReport'
import { ofN } from '../../components/v3/coach-flow/coach-visuals'

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
      <h1 class="uf-d2">{{ view.title }}</h1>
      <p class="uf-t4">{{ view.record }}<span v-if="view.pool.length"> · {{ view.pool.join(' · ') }}</span></p>

      <div class="sr3-grid uf-reveal">
        <div class="sr3-main">
          <div class="sr3-summary">
            <!-- One coach sentence (t1) per screen; the rest support it. -->
            <p v-for="(s, i) in view.summary" :key="i" :class="i === 0 ? 'uf-t1' : 'uf-t2'">{{ s }}</p>
          </div>

          <section class="sr3-col">
            <span class="uf-label">What's costing you games</span>
            <div v-for="(h, i) in view.habits" :key="i" class="sr3-habit">
              <p class="uf-t3">{{ h }}</p>
              <!-- One pip per match read, filled where the habit showed up. -->
              <span v-if="ofN(h)" class="sr3-pips" role="img" :aria-label="`${ofN(h)!.x} of ${ofN(h)!.n} matches`">
                <i v-for="k in ofN(h)!.n" :key="k" class="uf-fill" :class="{ 'is-on': k <= ofN(h)!.x }" :style="{ animationDelay: `${k * 30}ms` }" />
              </span>
            </div>
          </section>

          <section v-if="view.strengths.length" class="sr3-col">
            <span class="uf-label">What you do well</span>
            <p v-for="(s, i) in view.strengths" :key="i" class="uf-t3 sr3-habit">{{ s }}</p>
          </section>

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
        </div>

        <aside v-if="view.stats.length" class="sr3-numbers" aria-label="Your numbers">
          <span class="uf-label">Your numbers</span>
          <p class="uf-t4">Average over these matches. The bar shows your own worst to best.</p>
          <dl>
            <div v-for="row in view.stats" :key="row.label" class="sr3-row">
              <div class="sr3-row-top"><dt class="uf-t4">{{ row.label }}</dt><dd class="uf-t3 uf-num">{{ row.value }}</dd></div>
              <span v-if="row.bar" class="sr3-bar" role="img" :aria-label="`${row.label}: average ${row.value}${row.range ? `, ${row.range}` : ''}`">
                <i class="sr3-bar-range" :style="{ left: `${row.bar.lo * 100}%`, width: `${Math.max(0.5, (row.bar.hi - row.bar.lo) * 100)}%` }" />
                <i class="sr3-bar-avg uf-fill" :style="{ width: `${row.bar.avg * 100}%` }" />
              </span>
              <span v-if="row.range" class="uf-t4 uf-num">{{ row.range }}</span>
            </div>
          </dl>
        </aside>
      </div>
    </template>

    <template v-else-if="view.kind === 'insufficient'">
      <h1 class="uf-d3">Not enough matches yet</h1>
      <p class="uf-t2" style="max-width: 760px">{{ insufficientLine(game, view.available, view.needed) }}</p>
    </template>

    <template v-else>
      <h1 class="uf-d3">Couldn't load your starting report</h1>
      <p class="uf-t2">Something went wrong fetching it. Try again in a minute.</p>
      <UfButton variant="secondary" @click="load({ generate: true, retry: true })">Try again</UfButton>
    </template>
  </div>
</template>

<style scoped>
.sr3 { display: flex; flex-direction: column; gap: 14px; padding: 32px 40px 48px; max-width: 1360px; container-type: inline-size; }
.sr3 p { margin: 0; }
.sr3-back { align-self: flex-start; }
.sr3-grid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr); gap: 56px; margin-top: 12px; align-items: start; }
.sr3-main { display: flex; flex-direction: column; gap: 32px; min-width: 0; }
.sr3-summary { display: flex; flex-direction: column; gap: 12px; }
.sr3-col { display: flex; flex-direction: column; gap: 8px; }
.sr3-habit { display: flex; flex-direction: column; gap: 6px; padding: 8px 0; border-top: 1px solid var(--uf-line); }
.sr3-pips { display: flex; gap: 3px; }
.sr3-pips i { width: 14px; height: 6px; background: var(--uf-raised); display: block; }
.sr3-pips i.is-on { background: var(--uf-loss); }
.sr3-numbers { position: sticky; top: 24px; display: flex; flex-direction: column; gap: 8px; padding-left: 32px; border-left: 1px solid var(--uf-line); }
.sr3-numbers dl { margin: 4px 0 0; }
.sr3-row { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; border-bottom: 1px solid var(--uf-line); }
.sr3-row-top { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
.sr3-row dd { margin: 0; }
.sr3-bar { position: relative; display: block; height: 6px; background: var(--uf-raised); }
.sr3-bar i { position: absolute; top: 0; bottom: 0; display: block; }
.sr3-bar-range { background: rgba(236, 232, 225, 0.18); }
.sr3-bar-avg { left: 0; height: 2px; top: 2px !important; bottom: auto !important; background: var(--uf-bone); transform-origin: left; }
.sr3-focus { display: flex; flex-direction: column; gap: 6px; padding-top: 18px; border-top: 1px solid var(--uf-line); }
.sr3-actions { display: flex; align-items: center; gap: 14px; margin-top: 6px; }
@container (max-width: 860px) {
  .sr3-grid { grid-template-columns: minmax(0, 1fr); gap: 32px; }
  .sr3-numbers { position: static; padding-left: 0; border-left: 0; }
}
</style>
