<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getRankIconUrl } from '../../lib/valorant'

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
  <Teleport to="body">
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
