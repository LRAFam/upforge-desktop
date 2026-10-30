<script setup lang="ts">
/**
 * UI v3 post-game pop-up (board 2). Presentation only: PostGameView owns all state and behaviour
 * and passes the same values it gives the compact status, plus real match summary/art.
 * The window is compact (≈400 × 336), so the score uses D2 and the coach line T3.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Focus } from '../../lib/focus'
import UfButton from '../../components/v3/UfButton.vue'
import UfIcon from '../../components/v3/UfIcon.vue'
import SessionCoachV3 from '../../components/v3/ideas/SessionCoachV3.vue'
import {
  agentPortraitUrl, kdaText, metaLine, postGameFocusStrip, progressWidth, resultTone, resultWord, scoreText, toneColor,
  type PostGameSummary, type PostGameTone,
} from '../../components/v3/postgame/post-game-v3'

const props = defineProps<{
  ready: boolean
  tone: PostGameTone
  eyebrow: string
  title: string
  body: string
  progress: number | null
  status: string | null
  timing: string | null
  primaryLabel: string
  secondaryLabel?: string | null
  showExpectations: boolean
  score?: string | null
  showFeedback?: boolean
  feedbackRating?: 'thumbs_up' | 'thumbs_down' | null
  feedbackText?: string
  feedbackSubmitting?: boolean
  feedbackSubmitted?: boolean
  feedbackError?: string | null
  summary?: PostGameSummary | null
  matchName?: string | null
  mapName?: string | null
  mapArt?: string | null
  agentArt?: string | null
  coachLine?: string | null
  coachSub?: string | null
  clipCount?: number
  /** Roster flow: coach to offer "Send to …" for (only when this match can be sent). */
  sendCoachName?: string | null
  /** On-screen number of the round worth reviewing (your first opening death in a lost round). */
  reviewRound?: number | null
}>()

defineEmits<{
  primary: []
  secondary: []
  close: []
  feedbackPositive: []
  feedbackNegative: []
  feedbackCancel: []
  feedbackSubmit: []
  'update:feedbackText': [value: string]
  sendToCoach: []
  reviewRound: []
}>()

const portrait = computed(() => agentPortraitUrl(props.agentArt))
const portraitFailed = ref(false)
watch(portrait, () => { portraitFailed.value = false })
const isFullPortrait = computed(() => !!portrait.value && portrait.value.endsWith('fullportrait.png'))
const word = computed(() => resultWord(props.summary ?? null))
const wash = computed(() => resultTone(props.summary ?? null))
const scoreLine = computed(() => scoreText(props.summary ?? null))
const meta = computed(() => metaLine([props.matchName, props.mapName, kdaText(props.summary ?? null)]))
const bar = computed(() => progressWidth(props.progress))
const dot = computed(() => toneColor(props.tone))
// Focus pips: read the saved focus (no network) and follow live updates from the main window.
const focus = ref<Focus | null>(null)
const focusStrip = computed(() => postGameFocusStrip(focus.value))
let offFocus: (() => void) | null = null
onMounted(async () => {
  const api = window.api?.app
  try { focus.value = (await api?.getFocus?.())?.focus ?? null } catch { focus.value = null }
  offFocus = api?.onFocusUpdated?.((u: unknown) => {
    const next = (u as { focus?: Focus | null } | null)?.focus
    if (next !== undefined) focus.value = next ?? null
  }) ?? null
})
onBeforeUnmount(() => offFocus?.())

const clipsLine = computed(() => {
  const n = props.clipCount ?? 0
  return metaLine([n > 0 ? `${n} clip${n === 1 ? '' : 's'} from your recording` : null, props.score])
})
</script>

<template>
  <section class="pg3" aria-live="polite">
    <!-- Hero: art, result wash, score. Close lives here (the pop-up owns its header). -->
    <header class="pg3-hero" :class="{ 'is-ready': ready }">
      <img v-if="mapArt" :src="mapArt" alt="" class="pg3-art">
      <div class="pg3-scrim" />
      <div v-if="ready && wash !== 'none'" class="pg3-wash" :class="`pg3-wash--${wash}`" />
      <img v-if="ready && portrait && !portraitFailed" :src="portrait" alt="" class="pg3-agent" :class="{ 'is-full': isFullPortrait }" @error="portraitFailed = true">
      <button type="button" class="pg3-close" aria-label="Close" @click="$emit('close')"><UfIcon name="close" :size="16" /></button>
      <div class="pg3-hero-body uf-rise">
        <template v-if="ready">
          <div class="pg3-result-row">
            <span v-if="word" class="uf-d4" :style="{ color: wash === 'win' ? 'var(--uf-win)' : wash === 'loss' ? 'var(--uf-loss)' : 'var(--uf-muted)' }">{{ word }}</span>
            <span v-if="scoreLine" class="uf-d2 uf-num">{{ scoreLine }}</span>
          </div>
          <span v-if="meta" class="uf-t4" style="color: var(--uf-muted)">{{ meta }}</span>
        </template>
        <template v-else>
          <span class="pg3-eyebrow uf-label"><span class="pg3-dot" :class="{ 'uf-live': tone === 'active' }" :style="{ background: dot }" />{{ eyebrow }}</span>
          <span class="uf-d4">{{ title }}</span>
        </template>
      </div>
    </header>

    <div class="pg3-body">
      <!-- Ready: the coach speaks once, then the evidence line -->
      <template v-if="ready">
        <div class="uf-rise uf-d1s pg3-coach">
          <span class="uf-label">Your coach</span>
          <p class="uf-t3 pg3-clamp">{{ coachLine || body }}</p>
          <p v-if="coachSub" class="uf-t4">{{ coachSub }}</p>
          <button v-if="sendCoachName" type="button" class="uf-link pg3-send" @click="$emit('sendToCoach')">Send to {{ sendCoachName }} →</button>
          <button v-if="reviewRound" type="button" class="uf-link pg3-send" :title="`You died first in round ${reviewRound} and lost it`" @click="$emit('reviewRound')">Review round {{ reviewRound }} →</button>
        </div>
        <p v-if="clipsLine" class="uf-t4 uf-rise uf-d2s">{{ clipsLine }}</p>
        <div v-if="focusStrip" class="pg3-focus uf-rise uf-d2s" :title="focusStrip.line">
          <span class="uf-label">Focus</span>
          <span class="uf-t4 pg3-focus-label">{{ focusStrip.label }}</span>
          <span class="pg3-pips" role="img" :aria-label="focusStrip.line">
            <span v-for="(p, i) in focusStrip.pips" :key="i" class="pg3-pip" :class="`is-${p}`" />
          </span>
        </div>
        <!-- Session coach (P6): only after 2+ ranked losses in a row this session (Valorant ranked log). -->
        <SessionCoachV3 compact class="uf-rise uf-d2s" />
      </template>

      <!-- In progress / saved / error -->
      <template v-else>
        <p class="uf-t4 pg3-body-text">{{ body }}</p>
        <div v-if="bar != null" class="pg3-progress">
          <div class="pg3-track"><div class="pg3-fill" :style="{ width: `${bar}%`, background: dot }" /></div>
          <div class="pg3-progress-meta uf-t4">
            <span>{{ status }}</span>
            <span class="uf-num">{{ progress }}%<template v-if="timing"> · {{ timing }}</template></span>
          </div>
        </div>
        <p v-if="showExpectations" class="uf-t4 pg3-expect">
          Analysis usually takes 20–30 minutes; we’ll email you when it’s ready. Uploads pause during matches to protect your FPS.
        </p>
      </template>

      <div class="pg3-actions uf-rise uf-d3s">
        <UfButton variant="primary" :icon="ready ? 'spark' : undefined" @click="$emit('primary')">{{ primaryLabel }}</UfButton>
        <UfButton v-if="secondaryLabel" variant="secondary" @click="$emit('secondary')">{{ secondaryLabel }}</UfButton>
        <button type="button" class="uf-link" @click="$emit('close')">Dismiss</button>
      </div>

      <div v-if="showFeedback" class="pg3-feedback">
        <p v-if="feedbackSubmitted" class="uf-t4" style="color: var(--uf-win)">Feedback saved. Thanks for helping the coach improve.</p>
        <template v-else>
          <div class="pg3-feedback-row">
            <span class="uf-t4">Was this coaching useful?</span>
            <div class="pg3-feedback-btns">
              <button type="button" class="uf-link" :class="{ 'is-on': feedbackRating === 'thumbs_up' }" :disabled="feedbackSubmitting" @click="$emit('feedbackPositive')">Yes</button>
              <button type="button" class="uf-link" :class="{ 'is-on': feedbackRating === 'thumbs_down' }" :disabled="feedbackSubmitting" @click="$emit('feedbackNegative')">Not really</button>
            </div>
          </div>
          <div v-if="feedbackRating === 'thumbs_down'" class="pg3-feedback-form">
            <textarea
              :value="feedbackText" rows="2" maxlength="500" class="pg3-textarea" aria-label="What felt wrong or unhelpful?"
              placeholder="What felt wrong or unhelpful? (optional)"
              @input="$emit('update:feedbackText', ($event.target as HTMLTextAreaElement).value)"
            />
            <div class="pg3-feedback-row" style="justify-content: flex-end; gap: 16px">
              <button type="button" class="uf-link" :disabled="feedbackSubmitting" @click="$emit('feedbackCancel')">Cancel</button>
              <UfButton variant="secondary" :disabled="feedbackSubmitting" @click="$emit('feedbackSubmit')">{{ feedbackSubmitting ? 'Sending…' : 'Send feedback' }}</UfButton>
            </div>
          </div>
          <p v-if="feedbackError" class="uf-t4" style="color: var(--uf-loss)">{{ feedbackError }}</p>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pg3 { position: relative; width: 100%; background: var(--uf-bg); color: var(--uf-bone); text-align: left; }
.pg3-hero { position: relative; height: 76px; overflow: hidden; border-bottom: 1px solid var(--uf-line); }
.pg3-hero.is-ready { height: 98px; }
.pg3-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 40%; filter: saturate(0.6) brightness(0.9); }
.pg3-scrim { position: absolute; inset: 0; background:
  linear-gradient(90deg, var(--uf-bg) 0%, rgba(14,17,22,0.9) 45%, rgba(14,17,22,0.55) 100%),
  linear-gradient(180deg, transparent 40%, var(--uf-bg)); }
.pg3-wash { position: absolute; inset: 0; }
.pg3-wash--win { background: radial-gradient(320px 140px at 0% 120%, rgba(34,169,155,0.28), transparent 70%); }
.pg3-wash--loss { background: radial-gradient(320px 140px at 0% 120%, rgba(232,80,91,0.28), transparent 70%); }
.pg3-agent { position: absolute; right: 40px; bottom: 6px; height: 72px; width: auto; pointer-events: none; }
.pg3-agent.is-full { right: 24px; top: -12px; bottom: auto; height: 250px; }
.pg3-close { position: absolute; top: 6px; right: 6px; z-index: 2; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: none; border: 0; color: var(--uf-muted); cursor: pointer; }
.pg3-close:hover { color: var(--uf-bone); background: var(--uf-hover); }
.pg3-hero-body { position: relative; height: 100%; box-sizing: border-box; padding: 0 16px 12px; display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; }
.pg3-result-row { display: flex; align-items: baseline; gap: 12px; }
.pg3-eyebrow { display: inline-flex; align-items: center; gap: 8px; }
.pg3-dot { width: 7px; height: 7px; border-radius: 4px; }
.pg3-body { padding: 12px 16px 14px; display: flex; flex-direction: column; gap: 12px; }
.pg3-coach { display: flex; flex-direction: column; gap: 6px; }
.pg3-coach p { margin: 0; }
.pg3-clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.pg3-body-text, .pg3-expect { margin: 0; }
.pg3-expect { padding-top: 10px; border-top: 1px solid var(--uf-line); }
.pg3-progress { display: flex; flex-direction: column; gap: 6px; }
.pg3-track { height: 3px; background: var(--uf-line-2); }
.pg3-fill { height: 3px; transition: width 0.3s ease; }
.pg3-progress-meta { display: flex; justify-content: space-between; gap: 12px; }
.pg3-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.pg3-feedback { padding-top: 10px; border-top: 1px solid var(--uf-line); display: flex; flex-direction: column; gap: 8px; }
.pg3-feedback p { margin: 0; }
.pg3-feedback-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.pg3-feedback-btns { display: flex; gap: 16px; }
.pg3-feedback-btns .is-on { color: var(--uf-bone); text-decoration: underline; text-underline-offset: 4px; }
.pg3-feedback-form { display: flex; flex-direction: column; gap: 8px; }
.pg3-textarea { width: 100%; box-sizing: border-box; resize: none; background: var(--uf-raised); border: 1px solid var(--uf-line-2); color: var(--uf-bone); font: 400 13px/1.45 var(--uf-body); padding: 8px 10px; outline: none; }
.pg3-textarea:focus { border-color: var(--uf-muted); }
.pg3-focus { display: flex; align-items: center; gap: 10px; min-width: 0; padding-top: 10px; border-top: 1px solid var(--uf-line); }
.pg3-focus-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pg3-pips { display: flex; gap: 4px; flex: none; }
.pg3-pip { width: 10px; height: 4px; background: var(--uf-line-2); }
.pg3-pip.is-hit { background: var(--uf-win); }
.pg3-pip.is-miss { background: var(--uf-loss); }
.pg3-send { align-self: flex-start; }
</style>
