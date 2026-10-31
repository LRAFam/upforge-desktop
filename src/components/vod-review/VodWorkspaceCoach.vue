<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { coachAccessState, coachQuestionPayload, validCoachHistory, type CoachMoment, type CoachHistory, type CoachQuestion } from '../../lib/workspace-coach'
const props = defineProps<{ moments: CoachMoment[] | null }>()
const question = ref('')
const history = ref<CoachHistory | null>(null)
const error = ref('')
const sending = ref(false)
const checkoutBusy = ref(false)
const checkoutNotice = ref('')
const pending = ref<CoachQuestion | null>(null)
let generation = 0
let timer: ReturnType<typeof setTimeout> | undefined
const analysisId = computed(() => props.moments?.[0]?.analysis_id ?? null)
const working = computed(() => history.value?.items.some(item => item.status === 'queued' || item.status === 'running'))
const remaining = computed(() => history.value ? Math.min(history.value.usage.analysis_remaining, history.value.usage.daily_remaining) : 0)
const access = computed(() => coachAccessState(history.value))
const canSubmit = computed(() => !!pending.value || access.value === 'included' || access.value === 'credit')
function viewPlans() { void window.api.app.openUrl('https://upforge.gg/pricing') }
const starters = ['What should I compare between these moments?', 'What does the evidence support here?', 'What should I focus on next match?']
function reload() { clearTimeout(timer); void refresh() }
async function refresh() {
  clearTimeout(timer)
  const id = analysisId.value, current = generation
  if (!id) return
  error.value = ''
  try {
    const result = await window.api.workspaceCoach.history(id)
    if (current !== generation) return
    if (!result.ok) { error.value = result.error; return }
    if (!validCoachHistory(result.data)) { error.value = 'The coach returned an unsupported conversation.'; return }
    history.value = result.data
    if (pending.value && result.data.items.some(item => item.id === pending.value!.id)) { pending.value = null; question.value = '' }
    if (working.value) timer = setTimeout(refresh, 3000)
  } catch { if (current === generation) error.value = 'Coach unavailable. Reopen the updated app and try again.' }
}
watch(analysisId, () => { generation++; clearTimeout(timer); pending.value = null; history.value = null; sending.value = false; void refresh() }, { immediate: true })
async function ask() {
  if (!analysisId.value || !props.moments || sending.value || working.value || !canSubmit.value) return
  const id = analysisId.value, current = generation
  pending.value ??= { id: crypto.randomUUID(), message: question.value.trim(), moments: structuredClone(props.moments.map(m => ({ ...m }))) }
  if (!pending.value.message) return
  sending.value = true; error.value = ''
  try {
    const result = await window.api.workspaceCoach.ask(id, coachQuestionPayload(pending.value))
    if (current !== generation) return
    if (!result.ok) { error.value = result.error; return }
    await refresh()
  } catch { if (current === generation) error.value = 'Request status unknown. Retry checks the same question without charging twice.' }
  finally { if (current === generation) sending.value = false }
}
async function credits(pack: string) {
  if (checkoutBusy.value) return
  checkoutBusy.value = true
  const current = generation
  try {
    const result = await window.api.workspaceCoach.credits(pack)
    if (current !== generation) return
    if (!result.ok) { error.value = result.error; return }
    const url = new URL(result.data.checkout_url)
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Unsupported checkout')
    await window.api.app.openUrl(url.toString())
    if (current === generation) checkoutNotice.value = 'Complete checkout in your browser, then return here. Your credit balance refreshes when you return. Use Refresh if payment is still processing.'
  } catch { if (current === generation) error.value = 'Could not open checkout. Check your credit balance before retrying.' }
  finally { if (current === generation) checkoutBusy.value = false }
}
const cleanups = [window.api.on('session:user-changed', clear), window.api.on('auth:session-expired', clear)]
function canClose() { return (!question.value.trim() && !pending.value) || window.confirm('Leave the coach? Your unsent draft will be lost. Submitted questions stay saved to your account.') }
onBeforeRouteLeave(canClose)
defineExpose({ canClose })
function clear() { checkoutNotice.value = ''; checkoutBusy.value = false; generation++; clearTimeout(timer); history.value = null; pending.value = null; question.value = ''; error.value = ''; sending.value = false }
onMounted(() => window.addEventListener('focus', reload))
onBeforeUnmount(() => { clear(); cleanups.forEach(fn => fn()); window.removeEventListener('focus', reload) })
function stamp(n: number) { return `${Math.floor(n / 60)}:${Math.floor(n % 60).toString().padStart(2,'0')}` }
</script>
<template>
  <section class="workspace-coach" aria-label="Ask AI coach" @keydown.stop>
    <header><h2>Ask AI coach</h2><button type="button" :disabled="sending || !analysisId" @click="reload">Refresh</button></header>
    <p v-if="!moments">Open analysed footage on both sides to ask about these moments. Self-review and notes remain available.</p>
    <template v-else>
      <p class="evidence">Uses saved review data, not a new video analysis.</p>
      <div class="anchors"><span v-for="(moment, index) in moments" :key="index">{{ index === 0 ? 'A' : 'B' }} · {{ stamp(moment.position) }} · {{ moment.round === null ? 'No round selected' : `R${moment.round + 1}` }}</span></div>
      <div v-if="history?.locked" class="access-notice">
        <p>Ask AI coach is included with Plus and Pro. Your saved answers remain available below.</p>
        <button type="button" @click="viewPlans">View coaching plans</button>
      </div>
      <template v-else>
        <p v-if="history" class="usage">{{ history.usage.unlimited ? 'Admin access' : `${remaining} included questions available · ${history.usage.chat_credits} Coach Credits` }}</p>
        <div v-if="access === 'exhausted'" class="access-notice" role="status">
          <p>{{ history?.usage.analysis_remaining === 0 ? 'You have used the included questions for this match.' : 'You have used today’s included questions.' }} Add Coach Credits to ask more. Your draft stays here.</p>
        </div>
        <p v-else-if="access === 'credit'" class="usage">Your next new question uses 1 Coach Credit.</p>
        <div class="starters"><button v-for="starter in starters" :key="starter" type="button" :disabled="sending || !!pending" @click="question = starter">{{ starter }}</button></div>
        <label>Your question<textarea v-model="question" maxlength="1000" rows="3" :disabled="sending || !!pending" placeholder="What would you like to understand?" /></label>
        <button class="primary" type="button" :disabled="sending || working || !canSubmit || !question.trim()" @click="ask">{{ sending || working ? 'Coach is working…' : pending ? 'Retry this question' : access === 'exhausted' ? 'No questions available' : access === 'credit' ? 'Ask using 1 credit' : 'Ask coach' }}</button>
        <p v-if="pending">This question keeps its original moments when retried.</p><button v-if="pending" type="button" :disabled="sending" @click="pending = null">Edit as a new question</button>
        <details v-if="history && !history.usage.unlimited"><summary class="credit-summary">Add Coach Credits</summary><p>One credit per extra question when your included allowance runs out. Confirm the price at checkout.</p><button v-for="pack in [{id:'starter',label:'50 credits'}, {id:'value',label:'150 credits'}, {id:'power',label:'500 credits'}]" :key="pack.id" type="button" :disabled="checkoutBusy" @click="credits(pack.id)">{{ pack.label }}</button></details>
      </template>
      <article v-for="item in history?.items" :key="item.id"><p class="question">{{ item.question }}</p><p class="anchors">{{ item.moments.map((m,i) => `${i === 0 ? 'A' : 'B'} ${stamp(m.position)}${m.round === null ? '' : ` · R${m.round + 1}`}`).join(' / ') }}</p><p v-if="item.status === 'complete'" class="answer">{{ item.answer }}</p><p v-else role="status">{{ item.status === 'failed' ? 'Could not answer. Your allowance was returned.' : 'Preparing your answer…' }}</p></article>
    </template>
    <p v-if="checkoutNotice" role="status">{{ checkoutNotice }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.workspace-coach { padding:14px; border:1px solid #ffffff20; border-radius:6px; background:#15181e; font-size:12px; min-width:0; }header {display:flex;align-items:center;justify-content:space-between;gap:8px;}h2 {font-size:15px;font-weight:700;}p {color:#abb5c3;margin:10px 0;line-height:1.5;}button,textarea {font:inherit;color:#e6e8ed;background:#1a1d24;border:1px solid #ffffff28;border-radius:4px;padding:8px;}button {cursor:pointer;}button:disabled {opacity:.5;cursor:default;}textarea {width:100%;resize:vertical;margin:6px 0;}label {display:block;margin-top:12px;} .primary {background:#d60838;width:100%;}.anchors {display:flex;flex-wrap:wrap;gap:8px;color:#b9c9dc;font-size:11px;}.starters {display:grid;gap:6px;}.starters button {text-align:left;}.usage,.evidence {font-size:11px;}article {border-top:1px solid #ffffff20;margin-top:14px;padding-top:8px;} .question {color:#f0f2f5;font-weight:600;}.answer {white-space:pre-wrap;overflow-wrap:anywhere;}details {margin-top:12px;}details button {margin:4px;} .error {color:#ff9cac;} :is(button,textarea,summary):focus-visible {outline:2px solid #e11d48;outline-offset:2px;}
.access-notice { border: 1px solid #ffffff24; border-radius: 5px; padding: 0 10px 10px; margin-top: 12px; } .credit-summary { cursor: pointer; min-height: 36px; padding: 8px 0; color: #f3f4f6; }
</style>
