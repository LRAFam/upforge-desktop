<script setup lang="ts">
/**
 * "AI reviews your round" on the v3 match page (Valorant, analysed matches only).
 * Review the round you're on → confirm (uses 1 round review) → progress → story + fixes with
 * jump-to-time. Hidden unless the desktop flag is on AND the API says the feature is enabled.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useVodReview } from '../../../composables/useVodReview'
import {
  allowanceLine, clockLabel, isDone, jumpSeconds, pollRoundReview, roundReviewEnabled,
  type RoundReview, type RoundReviewAllowance,
} from '../../../lib/round-review'
import UfButton from '../UfButton.vue'
import UfDialog from '../UfDialog.vue'

/** autoRound: 1-based round to offer straight away (post-game "Review round N"). */
const props = defineProps<{ autoRound?: number | null }>()
const { timeline, activeRoundNumber, seekToTime } = useVodReview()
// The review uses on-screen numbering (R1 = round 1); the player's round state is 0-based.
const shownRound = computed(() => (activeRoundNumber.value == null ? null : activeRoundNumber.value + 1))

const jobId = computed(() => (timeline.value?.game === 'valorant' ? timeline.value?.jobId ?? null : null))
const flagOn = roundReviewEnabled()
const allowance = ref<RoundReviewAllowance | null>(null)
const reviews = ref<RoundReview[]>([])
const confirmRound = ref<number | null>(null)
const busy = ref(false)
const message = ref('')
const available = computed(() => flagOn && !!jobId.value && !!allowance.value?.enabled)

const reviewFor = (round: number | null) => reviews.value.find(r => r.round_number === round) ?? null
const current = computed(() => reviewFor(shownRound.value))
const shown = computed(() => [...reviews.value].sort((a, b) => a.round_number - b.round_number))

function upsert(r: RoundReview) {
  reviews.value = [...reviews.value.filter(x => x.round_number !== r.round_number), r]
}

async function load() {
  if (!flagOn || !jobId.value) return
  const res = await window.api?.roundReview?.list(jobId.value)
  if (res?.ok) {
    reviews.value = res.reviews
    allowance.value = res.allowance
    for (const r of res.reviews) if (!isDone(r)) void follow(r.round_number)
  }
  if (props.autoRound != null && available.value && !reviewFor(props.autoRound)) confirmRound.value = props.autoRound
}
onMounted(load)
watch(jobId, load)

async function follow(round: number) {
  const id = jobId.value
  if (!id) return
  const done = await pollRoundReview(async () => {
    const res = await window.api?.roundReview?.get(id, round)
    return res?.ok ? res.review : null
  }, { onUpdate: upsert })
  if (done?.status === 'failed') message.value = done.error ?? 'We couldn\'t review this round. Your round review was returned.'
  const a = await window.api?.roundReview?.allowance()
  if (a?.ok) allowance.value = a.allowance
}

async function confirm() {
  const round = confirmRound.value
  if (round == null || !jobId.value || busy.value) return
  busy.value = true
  message.value = ''
  const res = await window.api?.roundReview?.request(jobId.value, round)
  busy.value = false
  confirmRound.value = null
  if (!res?.ok) {
    message.value = res?.error ?? 'Round review is unavailable right now.'
    if (res && 'allowance' in res && res.allowance) allowance.value = res.allowance
    return
  }
  allowance.value = res.allowance
  upsert(res.review)
  if (!isDone(res.review)) void follow(round)
}

const canAsk = computed(() => available.value && shownRound.value != null && !current.value && (allowance.value?.remaining ?? 0) > 0)
</script>

<template>
  <section v-if="available" class="rr3" aria-label="AI round review">
    <div class="rr3-head">
      <span class="uf-label">AI round review</span>
      <span class="uf-t4">{{ allowanceLine(allowance) }}</span>
    </div>
    <div class="rr3-ask">
      <p v-if="shownRound == null" class="uf-t4">Pick a round on the strip above to review it.</p>
      <template v-else-if="current">
        <p class="uf-t4">Round {{ shownRound }} has a review below.</p>
      </template>
      <template v-else>
        <UfButton variant="secondary" :disabled="!canAsk" @click="confirmRound = shownRound">Review round {{ shownRound }}</UfButton>
        <p v-if="(allowance?.remaining ?? 0) === 0" class="uf-t4">You've used all your round reviews this month.</p>
      </template>
    </div>
    <p v-if="message" class="uf-t4 rr3-msg">{{ message }}</p>

    <article v-for="r in shown" :key="r.round_number" class="rr3-review uf-reveal">
      <div class="rr3-review-head">
        <span class="uf-t3">Round {{ r.round_number }}</span>
        <span v-if="!isDone(r)" class="uf-t4 uf-live">Reviewing this round…</span>
        <span v-else-if="r.status === 'failed'" class="uf-t4">Couldn't review · round review returned</span>
      </div>
      <template v-if="r.status === 'completed'">
        <p class="uf-t2 rr3-story">{{ r.story }}</p>
        <ol class="rr3-fixes">
          <li v-for="(f, i) in r.fixes" :key="i" class="rr3-fix">
            <div>
              <p class="uf-t3">{{ f.title }}</p>
              <p class="uf-t4">{{ f.detail }}</p>
            </div>
            <span class="rr3-jumps">
              <button v-for="ms in f.evidence_ms" :key="ms" type="button" class="uf-link" @click="seekToTime(jumpSeconds(ms))">Watch {{ clockLabel(ms) }}</button>
            </span>
          </li>
        </ol>
      </template>
    </article>

    <UfDialog :open="confirmRound != null" title="Review this round?" @close="confirmRound = null">
      <p class="uf-t2">The coach watches round {{ confirmRound }} and tells you what happened and what to change.</p>
      <p class="uf-t4">This uses 1 round review. {{ allowanceLine(allowance) }}. If the review fails, you get it back.</p>
      <template #actions>
        <UfButton variant="link" @click="confirmRound = null">Cancel</UfButton>
        <UfButton variant="primary" :disabled="busy" @click="confirm">{{ busy ? 'Starting…' : 'Review round' }}</UfButton>
      </template>
    </UfDialog>
  </section>
</template>

<style scoped>
.rr3 { display: flex; flex-direction: column; gap: 10px; padding: 16px 0; border-top: 1px solid var(--uf-line); }
.rr3-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.rr3-ask { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.rr3-msg { color: var(--uf-muted); }
.rr3-review { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; border-top: 1px solid var(--uf-line); }
.rr3-review-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.rr3-story { margin: 0; max-width: 72ch; }
.rr3-fixes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.rr3-fix { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: start; padding: 10px 0; border-bottom: 1px solid var(--uf-line); }
.rr3-fix p { margin: 0; }
.rr3-jumps { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
</style>
