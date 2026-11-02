<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import UfButton from '../../UfButton.vue'
import UfSkeleton from '../../UfSkeleton.vue'
import { openUpgrade } from '../../../../lib/upgrade'
import { CREDIT_PACKS, LOCKED_MESSAGE, answerBlocks, exhaustedMessage, matchMoment, momentLabel, usageLine, useAskMatch } from './ask-match'

/** Ask the AI about this match. Same IPC, allowance and Coach Credits as the comparison coach. */
const props = defineProps<{ analysisId: number; position: number; round: number | null }>()

const c = useAskMatch({
  history: id => window.api.workspaceCoach.history(id),
  ask: (id, body) => window.api.workspaceCoach.ask(id, body),
  credits: pack => window.api.workspaceCoach.credits(pack),
  openUrl: url => window.api.app.openUrl(url),
  newId: () => crypto.randomUUID(),
}, () => ({ analysisId: props.analysisId, position: props.position, round: props.round }))
const { question, history, loaded, error, sending, checkoutBusy, checkoutNotice, pending, working, access, canAsk, buttonLabel } = c

/** Where the question is anchored: the current video time and the selected round, if any. */
const anchor = computed(() => { const m = matchMoment({ analysisId: props.analysisId, position: props.position, round: props.round }); return m ? momentLabel(m) : '' })
watch(() => props.analysisId, () => { c.clear(); void c.refresh() }, { immediate: true })
function reload() { void c.refresh() }
const cleanups = [window.api.on('session:user-changed', c.clear), window.api.on('auth:session-expired', c.clear)]
onMounted(() => window.addEventListener('focus', reload))
onBeforeUnmount(() => { c.clear(); cleanups.forEach(fn => fn()); window.removeEventListener('focus', reload) })
</script>

<template>
  <section class="ask3" aria-label="Ask about this match" @keydown.stop>
    <header class="ask3-head">
      <span class="uf-label">Ask about this match</span>
      <button type="button" class="ask3-refresh uf-t4" :disabled="sending" @click="reload">Refresh</button>
    </header>
    <p class="uf-t4">Answers use this match’s saved review data, not a new video analysis.</p>

    <div v-if="!loaded && !error" class="ask3-skel" aria-busy="true">
      <UfSkeleton :h="13" w="55%" />
      <UfSkeleton :h="92" />
      <UfSkeleton :h="44" />
    </div>

    <template v-else-if="history?.locked">
      <p class="uf-t2">{{ LOCKED_MESSAGE }}</p>
      <UfButton variant="primary" @click="openUpgrade('vod_coach')">View coaching plans</UfButton>
    </template>

    <template v-else-if="history">
      <p class="uf-t4">{{ usageLine(history) }}</p>
      <p v-if="access === 'exhausted'" class="ask3-notice uf-t4" role="status">{{ exhaustedMessage(history) }}</p>
      <p v-else-if="access === 'credit'" class="uf-t4">Your next new question uses 1 Coach Credit.</p>
      <label class="ask3-field">
        <span class="uf-t4">Your question · sent with {{ anchor }}</span>
        <textarea v-model="question" class="uf-input" maxlength="1000" rows="3" :disabled="sending || !!pending" placeholder="What would you like to understand about this match?" />
      </label>
      <UfButton variant="primary" :disabled="!canAsk" @click="c.ask()">{{ buttonLabel }}</UfButton>
      <template v-if="pending">
        <p class="uf-t4">This question keeps its original moment when retried.</p>
        <UfButton variant="link" :disabled="sending" @click="c.editAsNew()">Edit as a new question</UfButton>
      </template>
      <details v-if="!history.usage.unlimited" class="ask3-credits">
        <summary class="uf-t3">Add Coach Credits</summary>
        <p class="uf-t4">One credit per extra question when your included allowance runs out. Confirm the price at checkout.</p>
        <div class="ask3-packs">
          <UfButton v-for="pack in CREDIT_PACKS" :key="pack.id" :disabled="checkoutBusy" @click="c.buyCredits(pack.id)">{{ pack.label }}</UfButton>
        </div>
      </details>
    </template>

    <article v-for="item in history?.items" :key="item.id" class="ask3-qa">
      <p class="uf-t3">{{ item.question }}</p>
      <p class="uf-t4">{{ item.moments.map(momentLabel).join(' / ') }}</p>
      <div v-if="item.status === 'complete'" class="ask3-answer">
        <p v-for="(block, i) in answerBlocks(item.answer)" :key="i" :class="`ask3-${block.kind}`"><template v-for="(part, j) in block.parts" :key="j"><strong v-if="part.bold">{{ part.text }}</strong><template v-else>{{ part.text }}</template></template></p>
      </div>
      <p v-else class="uf-t4" role="status">{{ item.status === 'failed' ? 'Could not answer. Your allowance was returned.' : 'Preparing your answer…' }}</p>
    </article>
    <p v-if="working && !history?.items.length" class="uf-t4" role="status">Preparing your answer…</p>

    <p v-if="checkoutNotice" class="uf-t4" role="status">{{ checkoutNotice }}</p>
    <p v-if="error" class="ask3-error uf-t4" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.ask3 { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.ask3-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ask3-refresh { background: none; border: 0; padding: 0; cursor: pointer; }
.ask3-refresh:hover:not(:disabled) { color: var(--uf-bone); }
.ask3-refresh:disabled { cursor: default; opacity: 0.5; }
.ask3-skel { display: flex; flex-direction: column; gap: 12px; }
.ask3-notice { border-left: 2px solid var(--uf-gold); padding-left: 12px; }
.ask3-field { display: flex; flex-direction: column; gap: 6px; }
.ask3-field textarea { width: 100%; resize: vertical; min-height: 92px; font: 400 15px/1.5 var(--uf-body); }
.ask3-credits summary { cursor: pointer; }
.ask3-credits > p { margin: 8px 0; }
.ask3-packs { display: flex; flex-wrap: wrap; gap: 8px; }
.ask3-qa { display: flex; flex-direction: column; gap: 4px; padding-top: 12px; border-top: 1px solid var(--uf-line); }
.ask3-answer { display: flex; flex-direction: column; gap: 8px; color: var(--uf-bone); font: 400 15px/1.55 var(--uf-body); overflow-wrap: anywhere; }
.ask3-answer strong { font-weight: 600; }
.ask3-heading { font-weight: 600; margin-top: 4px; }
.ask3-item { padding-left: 12px; border-left: 1px solid var(--uf-line); }
.ask3 > :deep(.uf-btn-primary) { align-self: flex-start; }
.ask3-error { color: var(--uf-loss); }
.ask3 :is(button, textarea, summary):focus-visible { outline: 2px solid var(--uf-red); outline-offset: 2px; }
</style>
