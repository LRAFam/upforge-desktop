<script setup lang="ts">
/**
 * Deadlock replay review body (shared by the review dialog and the match page): the coach's notes, where you stood against your lane, the
 * enemy team and the lobby, the souls curve, item and ability timings, Mid Boss and deaths.
 * Data: GET /api/deadlock/demo/{jobId} via `deadlock:get-analysis-detail` (read-only).
 */
import { computed, ref, watch } from 'vue'
import UfSkeleton from '../UfSkeleton.vue'
import { abilityRows, deathRows, fightFacts, itemRows, lobbyLines, midBossRows, soulsCurve, type DeadlockReviewDetail } from './deadlock-review'

const props = defineProps<{ active: boolean; jobId: string | null; hero?: string | null }>()
const emit = defineEmits<{ title: [string] }>()

type DetailResult = { ok: true; detail: DeadlockReviewDetail | null } | { ok: false; error: string }
/** Added by the lead to preload (see notes-game-deadlock.md); older builds lack it, so we fall back to the web. */
const detailApi = () => (window.api.deadlock as { getAnalysisDetail?: (jobId: string) => Promise<DetailResult> }).getAnalysisDetail

const detail = ref<DeadlockReviewDetail | null>(null)
const state = ref<'idle' | 'loading' | 'ready' | 'not_ready' | 'error' | 'unsupported'>('idle')

async function load() {
  if (!props.active || !props.jobId) return
  const api = detailApi()
  if (!api) { state.value = 'unsupported'; return }
  state.value = 'loading'
  const res = await api(props.jobId).catch(() => ({ ok: false as const, error: 'fetch_failed' }))
  if (!res.ok) { state.value = res.error === 'not_ready' ? 'not_ready' : 'error'; return }
  detail.value = res.detail
  state.value = 'ready'
}
watch(() => [props.active, props.jobId], () => { detail.value = null; void load() }, { immediate: true })

const W = 760
const H = 150
const curve = computed(() => soulsCurve(detail.value, W, H))
const lobby = computed(() => lobbyLines(detail.value))
const fights = computed(() => fightFacts(detail.value))
const items = computed(() => itemRows(detail.value))
const abilities = computed(() => abilityRows(detail.value))
const midBoss = computed(() => midBossRows(detail.value))
const deaths = computed(() => deathRows(detail.value))
const coaching = computed(() => detail.value?.coaching ?? null)
const ps = computed(() => detail.value?.match_stats?.player_stats ?? null)
const result = computed(() => {
  const r = (detail.value?.match_result ?? '').toLowerCase()
  return r === 'win' ? 'Won' : r === 'loss' ? 'Lost' : ''
})
const title = computed(() => [detail.value?.hero ?? props.hero ?? 'Deadlock match', result.value].filter(Boolean).join(' · '))
watch(title, t => emit('title', t), { immediate: true })

function openWeb() {
  if (props.jobId) void window.api.deadlock.openResults(props.jobId)
}
defineExpose({ openWeb })
</script>

<template>
  <div class="dlr-root">
    <div v-if="state === 'loading'" class="dlr" role="status" aria-label="Loading the replay review">
      <UfSkeleton :lines="2" />
      <UfSkeleton :h="H" />
      <div class="dlr-cols"><UfSkeleton :lines="6" /><UfSkeleton :lines="6" /></div>
    </div>

    <p v-else-if="state === 'not_ready'" class="uf-t2">This review is still being written. It usually takes a few minutes after the replay uploads.</p>
    <p v-else-if="state === 'error'" class="uf-t2">Couldn't load this review. <button type="button" class="uf-link" @click="load">Try again →</button></p>
    <p v-else-if="state === 'unsupported'" class="uf-t2">This version of the app opens reviews on the web. <button type="button" class="uf-link" @click="openWeb">Open review →</button></p>

    <div v-else-if="state === 'ready' && detail" class="dlr uf-reveal">
      <section v-if="coaching?.priority_focus || coaching?.overall_summary" class="dlr-block">
        <p v-if="coaching?.priority_focus" class="uf-t1">{{ coaching.priority_focus }}</p>
        <p v-if="coaching?.overall_summary" class="uf-t2">{{ coaching.overall_summary }}</p>
        <span v-if="ps" class="uf-t4 uf-num">{{ ps.kills }}/{{ ps.deaths }}/{{ ps.assists }}<template v-if="ps.damage_dealt"> · {{ ps.damage_dealt.toLocaleString('en-GB') }} hero damage</template></span>
      </section>

      <section v-if="lobby.length" class="dlr-block">
        <span class="uf-label">Souls against the lobby</span>
        <div v-for="row in lobby" :key="row.label" class="dlr-lobby">
          <span class="uf-t3">{{ row.label }}</span>
          <span class="uf-d4">{{ row.you }}</span>
          <span class="dlr-vs">
            <span v-for="v in row.versus" :key="v.label" class="uf-t4">{{ v.label }} {{ v.value }}
              <b :style="{ color: v.tone === 'win' ? 'var(--uf-win)' : v.tone === 'loss' ? 'var(--uf-loss)' : 'var(--uf-muted)' }">{{ v.diff }}</b></span>
          </span>
          <span class="uf-t4">{{ row.rank }}</span>
        </div>
        <span class="uf-t4">Measured from the replay for every player in the match.</span>
      </section>

      <section v-if="curve" class="dlr-block">
        <span class="uf-label">Souls over the match</span>
        <svg class="dlr-curve" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img"
          :aria-label="`Your souls rose to ${curve.end} by minute ${curve.minutes}`">
          <polyline :points="curve.points.map(p => `${p.x},${p.y}`).join(' ')" fill="none" stroke="var(--uf-bone)" stroke-width="2" vector-effect="non-scaling-stroke" />
          <g v-for="m in curve.lobby" :key="m.x">
            <title>{{ m.label }}</title>
            <rect :x="m.x - 4" :y="m.y - 4" width="8" height="8" fill="var(--uf-muted)" />
          </g>
        </svg>
        <span class="uf-t4">Line: your souls. Squares: lobby average at that minute. {{ curve.end }} at the end.</span>
      </section>

      <div class="dlr-cols">
        <section class="dlr-block">
          <span class="uf-label">Items · when you bought them</span>
          <div v-for="(i, n) in items" :key="n" class="dlr-row">
            <span class="uf-t4 uf-num">{{ i.at }}</span>
            <span class="uf-t3 dlr-grow">{{ i.name }}<span v-if="i.upgrade" class="uf-t4"> · upgrade</span></span>
            <span class="uf-t4">{{ i.cost }}</span>
          </div>
          <p v-if="!items.length" class="uf-t2">No item purchases were in this replay.</p>
        </section>
        <section class="dlr-block">
          <span class="uf-label">Ability order</span>
          <div v-for="(a, n) in abilities" :key="n" class="dlr-row">
            <span class="uf-t4 uf-num">{{ a.at }}</span>
            <span class="uf-t3 dlr-grow">{{ a.name }}</span>
            <span class="uf-t4">Level {{ a.level }}</span>
          </div>
          <p v-if="!abilities.length" class="uf-t2">No ability upgrades were in this replay.</p>

          <span class="uf-label" style="margin-top: 18px">Mid Boss</span>
          <div v-for="(m, n) in midBoss" :key="`mb${n}`" class="dlr-row">
            <span class="uf-t4 uf-num">{{ m.at }}</span>
            <span class="uf-t3 dlr-grow" :style="{ color: m.ours ? 'var(--uf-win)' : undefined }">{{ m.who }}</span>
          </div>
          <p v-if="!midBoss.length" class="uf-t4">Not taken in this match.</p>

          <template v-if="deaths.length">
            <span class="uf-label" style="margin-top: 18px">Your deaths</span>
            <div v-for="(d, n) in deaths" :key="`d${n}`" class="dlr-row">
              <span class="uf-t4 uf-num">{{ d.at }}</span>
              <span class="dlr-grow">
                <span class="uf-t3" style="display: block">{{ d.by ? `Killed by ${d.by}` : 'Died' }}</span>
                <span v-if="d.context" class="uf-t4">{{ d.context }}</span>
              </span>
            </div>
          </template>
        </section>
      </div>

      <section v-if="fights.length" class="dlr-block">
        <span class="uf-label">Fights · measured from the replay</span>
        <div v-for="f in fights" :key="f.label" class="dlr-row">
          <span class="uf-t3 dlr-grow">{{ f.label }}</span>
          <span class="uf-t3 uf-num">{{ f.value }}</span>
        </div>
        <span class="uf-t4">Nearby means within fighting distance of you when you died. Map side is measured against where each team started.</span>
      </section>

      <section v-if="coaching?.key_issues?.length" class="dlr-block">
        <span class="uf-label">What to work on</span>
        <div v-for="(i, n) in coaching.key_issues" :key="n" class="dlr-issue">
          <span class="uf-t4">{{ i.category }}</span>
          <span class="uf-t3">{{ i.issue }}</span>
          <span class="uf-t4">{{ i.evidence }}</span>
          <span class="uf-t2">{{ i.fix }}</span>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dlr { display: flex; flex-direction: column; gap: 24px; }
.dlr p { margin: 0; }
.dlr-block { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.dlr-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
.dlr-lobby { display: grid; grid-template-columns: 110px 70px 1fr auto; gap: 14px; align-items: baseline; padding: 8px 0; border-top: 1px solid var(--uf-line); }
.dlr-vs { display: flex; gap: 16px; flex-wrap: wrap; }
.dlr-vs b { font-weight: 600; margin-left: 4px; }
.dlr-curve { width: 100%; height: 150px; display: block; border-bottom: 1px solid var(--uf-line); }
.dlr-row { display: flex; gap: 14px; align-items: baseline; padding: 6px 0; border-top: 1px solid var(--uf-line); }
.dlr-row .uf-num { width: 44px; flex: none; }
.dlr-grow { flex: 1; min-width: 0; }
.dlr-issue { display: flex; flex-direction: column; gap: 4px; padding: 12px 0; border-top: 1px solid var(--uf-line); }
@media (max-width: 760px) { .dlr-cols { grid-template-columns: 1fr; } .dlr-lobby { grid-template-columns: 1fr 1fr; } }
</style>
