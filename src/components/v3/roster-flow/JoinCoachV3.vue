<script setup lang="ts">
/**
 * Join a coach from the invite link they shared (`upforge.gg/coaches/123#join-roster`).
 * Lookup is read-only; joining a FREE roster asks first; paid memberships finish on the web checkout.
 */
import { computed, ref, watch } from 'vue'
import { getRankIconUrl } from '../../../lib/valorant'
import { openWebFeature } from '../../../lib/web-explore-links'
import UfButton from '../UfButton.vue'
import UfDialog from '../UfDialog.vue'
import { initial } from '../coaches/coach-format'
import { parseCoachInvite } from './roster-flow'

const emit = defineEmits<{ joined: [coachName: string] }>()
const props = defineProps<{ autofocus?: boolean; /** From an upforge:// invite: look this coach up straight away (never joins). */ inviteCoachId?: number | null }>()

type Coach = {
  id: number
  display_name: string
  avatar_url?: string | null
  current_rank?: string | null
  roster_open?: boolean
  roster_is_live?: boolean
  roster_membership_mode?: 'free' | 'paid' | string
  roster_welcome_message?: string | null
  per_student_monthly_limit?: number | null
  roster_count?: number | null
}

const input = ref('')
const looking = ref(false)
const error = ref<string | null>(null)
const coach = ref<Coach | null>(null)
const confirmOpen = ref(false)
const joining = ref(false)

const paid = computed(() => coach.value?.roster_membership_mode === 'paid')
const closed = computed(() => !!coach.value && (coach.value.roster_open === false || coach.value.roster_is_live === false))
const status = computed(() => {
  const c = coach.value
  if (!c) return ''
  if (closed.value) return 'Not accepting new members right now.'
  const parts = [paid.value ? 'Paid membership' : 'Free roster']
  if (c.per_student_monthly_limit) parts.push(`${c.per_student_monthly_limit} reviews a month included`)
  if (c.roster_count) parts.push(`${c.roster_count} ${c.roster_count === 1 ? 'member' : 'members'}`)
  return parts.join(' · ')
})

async function lookUp() {
  error.value = null
  coach.value = null
  const id = parseCoachInvite(input.value)
  if (id == null) {
    error.value = 'Paste the link your coach shared, like upforge.gg/coaches/123.'
    return
  }
  looking.value = true
  try {
    const res = await window.api.coach.getPublicHub(id)
    if (res.ok) coach.value = res.coach as unknown as Coach
    else error.value = res.error
  } catch {
    error.value = 'Could not load this coach. Try again.'
  } finally {
    looking.value = false
  }
}

async function join() {
  const c = coach.value
  if (!c) return
  joining.value = true
  error.value = null
  try {
    const res = await window.api.coach.joinRoster(c.id)
    if (res.ok) {
      confirmOpen.value = false
      emit('joined', res.coachName ?? c.display_name)
      coach.value = null
      input.value = ''
    } else {
      error.value = res.error ?? 'Could not join this roster.'
      confirmOpen.value = false
    }
  } finally {
    joining.value = false
  }
}

// An invite link fills the field and looks the coach up (read-only). Joining still needs the confirm dialog.
watch(() => props.inviteCoachId, (id) => {
  if (id == null || !Number.isSafeInteger(id) || id <= 0) return
  input.value = `upforge.gg/coaches/${id}`
  void lookUp()
}, { immediate: true })

function continueOnWeb() {
  if (coach.value) void openWebFeature(`/coaches/${coach.value.id}?membership=paid#join-roster`, true)
}
</script>

<template>
  <div class="jc3">
    <form class="jc3-row" @submit.prevent="lookUp">
      <label for="jc3-invite" class="uf-label">Have an invite link?</label>
      <div class="jc3-field">
        <input id="jc3-invite" v-model="input" :autofocus="autofocus" class="jc3-input" type="text" inputmode="url"
          placeholder="upforge.gg/coaches/123" autocomplete="off" spellcheck="false" aria-describedby="jc3-msg">
        <UfButton variant="secondary" :disabled="looking || !input.trim()" @click="lookUp">{{ looking ? 'Finding…' : 'Find coach' }}</UfButton>
      </div>
      <p v-if="error" id="jc3-msg" class="uf-t4 jc3-error" role="alert">{{ error }}</p>
    </form>

    <div v-if="coach" class="jc3-coach uf-reveal">
      <span class="jc3-avatar" aria-hidden="true">
        <img v-if="coach.avatar_url" :src="coach.avatar_url" alt="" loading="lazy">
        <span v-else>{{ initial(coach.display_name) }}</span>
      </span>
      <span class="jc3-main">
        <span class="jc3-name">
          <span class="uf-t3">{{ coach.display_name }}</span>
          <img v-if="coach.current_rank && getRankIconUrl(coach.current_rank)" :src="getRankIconUrl(coach.current_rank)!" :alt="coach.current_rank" class="jc3-rank">
        </span>
        <span class="uf-t4">{{ status }}</span>
        <span v-if="coach.roster_welcome_message" class="uf-t4 jc3-welcome">“{{ coach.roster_welcome_message }}”</span>
      </span>
      <span class="jc3-act">
        <UfButton v-if="!closed && !paid" variant="primary" icon="team" @click="confirmOpen = true">Join roster</UfButton>
        <UfButton v-else-if="!closed && paid" variant="secondary" @click="continueOnWeb">Continue on upforge.gg</UfButton>
      </span>
    </div>

    <UfDialog :open="confirmOpen" :title="coach ? `Join ${coach.display_name}` : 'Join roster'" kicker="Free roster" :persistent="joining" @close="confirmOpen = false">
      <p class="uf-t2" style="margin: 0">Your coach sees the matches you send them and replies with notes on your timeline. You can leave any time on upforge.gg/my-coaches.</p>
      <template #actions>
        <UfButton variant="link" :disabled="joining" @click="confirmOpen = false">Cancel</UfButton>
        <UfButton variant="primary" :disabled="joining" @click="join">{{ joining ? 'Joining…' : 'Join roster' }}</UfButton>
      </template>
    </UfDialog>
  </div>
</template>

<style scoped>
.jc3 { display: flex; flex-direction: column; gap: 14px; max-width: 720px; }
.jc3-row { display: flex; flex-direction: column; gap: 8px; margin: 0; }
.jc3-field { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.jc3-input { flex: 1; min-width: 220px; height: 38px; padding: 0 12px; background: var(--uf-raised); border: 1px solid var(--uf-line); border-radius: 2px; color: var(--uf-bone); font: 400 15px/1 var(--uf-body); }
.jc3-input:focus { outline: none; border-color: var(--uf-muted); }
.jc3-error { margin: 0; color: var(--uf-muted); }
.jc3-coach { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-top: 1px solid var(--uf-line); border-bottom: 1px solid var(--uf-line); }
.jc3-avatar { width: 48px; height: 48px; flex: none; display: flex; align-items: center; justify-content: center; background: var(--uf-raised); overflow: hidden; font: 700 26px/1 var(--uf-display); }
.jc3-avatar img { width: 100%; height: 100%; object-fit: cover; }
.jc3-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.jc3-name { display: flex; align-items: center; gap: 8px; }
.jc3-rank { width: 20px; height: 20px; }
.jc3-welcome { color: var(--uf-muted); }
.jc3-act { flex: none; }
</style>
