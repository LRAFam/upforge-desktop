<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getRankIconUrl } from '../../lib/valorant'
import { uiV3 } from '../../lib/ui-v3'
import UfDialog from '../v3/UfDialog.vue'
import UfButton from '../v3/UfButton.vue'
import { initial } from '../v3/coaches/coach-format'

export type SendSheetCoach = {
  coach_id: number
  display_name: string
  avatar_url: string | null
  current_rank: string | null
  can_request_review?: boolean
  can_request_code?: string | null
  can_request_reason?: string | null
}

const props = defineProps<{
  open: boolean
  matchLabel: string
  coaches: SendSheetCoach[]
  preferredCoachId?: number | null
  busy?: boolean
}>()

const emit = defineEmits<{
  close: []
  send: [payload: { coachId: number; question?: string }]
}>()

const LAST_COACH_KEY = 'upforge.rosters.lastCoachId'

const eligible = computed(() =>
  props.coaches.filter(c => c.can_request_review !== false),
)

const coachId = ref<number | null>(null)
const question = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    question.value = ''
    const stored = Number(localStorage.getItem(LAST_COACH_KEY))
    const preferred = props.preferredCoachId
    const pick =
      eligible.value.find(c => c.coach_id === preferred)?.coach_id
      ?? eligible.value.find(c => c.coach_id === stored)?.coach_id
      ?? eligible.value[0]?.coach_id
      ?? null
    coachId.value = pick
  },
)

const selected = computed(() => eligible.value.find(c => c.coach_id === coachId.value) ?? null)

const emptyEligibleMessage = computed(() => {
  const codes = props.coaches.map(c => c.can_request_code).filter(Boolean)
  if (codes.includes('student_active_limit')) {
    return 'You already have a review in progress. Wait for your coach to finish, then send another.'
  }
  if (codes.includes('student_monthly_limit')) {
    return 'You have used all roster reviews with your coach this month.'
  }
  return props.coaches.find(c => c.can_request_reason)?.can_request_reason
    || 'You cannot send a review right now.'
})

/** v3 radio rows: arrow keys move the choice (and focus), like a native radio group. */
function onRadioKey(e: KeyboardEvent, index: number) {
  const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
  if (!step || !eligible.value.length) return
  e.preventDefault()
  const next = (index + step + eligible.value.length) % eligible.value.length
  coachId.value = eligible.value[next].coach_id
  const group = (e.currentTarget as HTMLElement | null)?.parentElement
  ;(group?.children[next] as HTMLElement | undefined)?.focus()
}

function submit() {
  if (coachId.value == null || props.busy) return
  localStorage.setItem(LAST_COACH_KEY, String(coachId.value))
  emit('send', {
    coachId: coachId.value,
    question: question.value.trim() || undefined,
  })
}
</script>

<template>
  <UfDialog v-if="uiV3" :open="open" kicker="Ask my coach" :title="matchLabel" :width="480" @close="emit('close')">
    <p v-if="!eligible.length" class="uf-t2 uf-send-empty">{{ emptyEligibleMessage }}</p>
    <div v-else class="uf-send">
      <div class="uf-send-field">
        <span id="uf-send-coach-label" class="uf-label">Coach</span>
        <div role="radiogroup" aria-labelledby="uf-send-coach-label" class="uf-send-coaches">
          <button v-for="(coach, i) in eligible" :key="coach.coach_id" type="button" role="radio"
            class="uf-send-coach" :class="{ 'is-on': coachId === coach.coach_id }"
            :aria-checked="coachId === coach.coach_id" :tabindex="coachId === coach.coach_id ? 0 : -1"
            @click="coachId = coach.coach_id" @keydown="onRadioKey($event, i)">
            <span class="uf-send-avatar">
              <img v-if="coach.avatar_url" :src="coach.avatar_url" alt="">
              <span v-else>{{ initial(coach.display_name) }}</span>
            </span>
            <span class="uf-send-main">
              <span class="uf-t3">{{ coach.display_name }}</span>
              <span class="uf-send-rank">
                <img v-if="coach.current_rank && getRankIconUrl(coach.current_rank)" :src="getRankIconUrl(coach.current_rank)!" alt="">
                <span class="uf-t4">{{ coach.current_rank || 'Rank n/a' }}</span>
              </span>
            </span>
            <span class="uf-send-dot" aria-hidden="true" />
          </button>
        </div>
      </div>
      <label class="uf-send-field">
        <span class="uf-label">Note <span class="uf-send-opt">(optional)</span></span>
        <textarea v-model="question" rows="3" maxlength="500" placeholder="What should they focus on?" class="uf-send-input" />
      </label>
    </div>
    <template #actions>
      <UfButton variant="secondary" @click="emit('close')">Cancel</UfButton>
      <UfButton v-if="eligible.length" variant="primary" :disabled="!selected || busy" @click="submit">
        {{ busy ? 'Sending…' : selected ? `Send to ${selected.display_name}` : 'Send' }}
      </UfButton>
    </template>
  </UfDialog>
  <Teleport v-else to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 p-4"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-md rounded-2xl border border-white/[0.10] bg-[#141414] shadow-2xl overflow-hidden">
        <div class="px-4 py-3 border-b border-white/[0.08]">
          <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">Ask my coach</p>
          <p class="text-sm font-semibold text-white mt-0.5 truncate">{{ matchLabel }}</p>
        </div>

        <div class="px-4 py-4 space-y-4">
          <div v-if="!eligible.length" class="text-sm text-amber-200/90">
            {{ emptyEligibleMessage }}
          </div>
          <template v-else>
            <div class="space-y-1.5">
              <label class="text-[10px] font-bold uppercase tracking-wider text-gray-500">Coach</label>
              <div class="space-y-1.5">
                <button
                  v-for="coach in eligible"
                  :key="coach.coach_id"
                  type="button"
                  class="w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
                  :class="coachId === coach.coach_id
                    ? 'border-white/20 bg-white/[0.06]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]'"
                  @click="coachId = coach.coach_id"
                >
                  <div class="h-9 w-9 rounded-full overflow-hidden bg-zinc-800 border border-white/10 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    <img v-if="coach.avatar_url" :src="coach.avatar_url" alt="" class="h-full w-full object-cover" />
                    <span v-else>{{ coach.display_name.slice(0, 1) }}</span>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold text-white truncate">{{ coach.display_name }}</p>
                    <p class="text-[11px] text-gray-500 flex items-center gap-1.5 mt-0.5">
                      <img
                        v-if="coach.current_rank && getRankIconUrl(coach.current_rank)"
                        :src="getRankIconUrl(coach.current_rank)!"
                        class="h-3.5 w-3.5 object-contain"
                        alt=""
                      />
                      <span class="truncate">{{ coach.current_rank || 'Rank n/a' }}</span>
                    </p>
                  </div>
                  <span
                    class="h-4 w-4 rounded-full border flex-shrink-0"
                    :class="coachId === coach.coach_id ? 'border-red-400 bg-red-500' : 'border-white/20'"
                  />
                </button>
              </div>
            </div>

            <div class="space-y-1.5">
              <label class="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Note <span class="text-gray-600 normal-case tracking-normal font-medium">(optional)</span>
              </label>
              <textarea
                v-model="question"
                rows="3"
                maxlength="500"
                placeholder="What should they focus on?"
                class="w-full rounded-xl border border-white/[0.10] bg-black/30 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-white/20 resize-none"
              />
            </div>
          </template>
        </div>

        <div class="px-4 py-3 border-t border-white/[0.08] flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-white/[0.10] px-3 py-1.5 text-[11px] font-semibold text-gray-400 hover:text-white"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg border border-white/[0.12] bg-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/[0.12] disabled:opacity-40"
            :disabled="!selected || busy"
            @click="submit"
          >
            {{ busy ? 'Sending…' : selected ? `Send to ${selected.display_name}` : 'Send' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.uf-send { display: flex; flex-direction: column; gap: 20px; }
.uf-send-empty { margin: 0; }
.uf-send-field { display: flex; flex-direction: column; gap: 8px; }
.uf-send-opt { text-transform: none; letter-spacing: 0; font-weight: 400; }
.uf-send-coaches { display: flex; flex-direction: column; border-bottom: 1px solid var(--uf-line); }
.uf-send-coach { display: flex; align-items: center; gap: 14px; width: 100%; padding: 10px 0; background: none; border: 0; border-top: 1px solid var(--uf-line); color: inherit; cursor: pointer; text-align: left; }
.uf-send-coach:hover { background: var(--uf-hover); }
.uf-send-avatar { width: 36px; height: 36px; flex: none; display: flex; align-items: center; justify-content: center; background: var(--uf-raised); overflow: hidden; font: 700 16px/1 var(--uf-display); color: var(--uf-bone); }
.uf-send-avatar img { width: 100%; height: 100%; object-fit: cover; }
.uf-send-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.uf-send-main > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uf-send-rank { display: flex; align-items: center; gap: 6px; }
.uf-send-rank img { width: 14px; height: 14px; object-fit: contain; }
.uf-send-dot { width: 14px; height: 14px; flex: none; border: 1px solid var(--uf-line-2); }
.uf-send-coach.is-on .uf-send-dot { border-color: var(--uf-red); background: var(--uf-red); box-shadow: inset 0 0 0 3px var(--uf-bg); }
.uf-send-input { width: 100%; border-radius: 0; border: 1px solid var(--uf-line-2); background: var(--uf-chrome); color: var(--uf-bone); padding: 9px 12px; font: 400 15px/1.4 var(--uf-body); resize: none; }
.uf-send-input::placeholder { color: var(--uf-faint); }
.uf-send-input:focus { outline: none; border-color: var(--uf-red); }
</style>
