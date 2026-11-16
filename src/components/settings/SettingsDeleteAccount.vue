<script setup lang="ts">
/**
 * Settings → Account: "Download my data" and "Delete account".
 * Talks to the API through window.api.account (electron/main/account-deletion.ts). The deletion
 * runs on the server after a grace period and can be cancelled here until then.
 */
import { computed, onMounted, ref } from 'vue'
import SettingsSection from './SettingsSection.vue'
import SettingsRow from './SettingsRow.vue'
import { uiV3 } from '../../lib/ui-v3'
import type {
  AccountDeletionPending,
  AccountDeletionSummary,
  AccountExportState,
} from '../../../electron/main/account-deletion'

const props = defineProps<{ email: string }>()

const summary = ref<AccountDeletionSummary | null>(null)
const pending = ref<AccountDeletionPending | null>(null)
const exp = ref<AccountExportState | null>(null)
const open = ref(false)
const password = ref('')
const confirmEmail = ref('')
const busy = ref(false)
const msg = ref('')
const err = ref(false)
const exportBusy = ref(false)
const exportMsg = ref('')
const exportErr = ref(false)

const graceDays = computed(() => summary.value?.grace_days ?? 7)
const blockers = computed(() => summary.value?.blockers ?? [])
const counts = computed(() => summary.value?.counts ?? { analyses: 0, recordings: 0, clips: 0, replays: 0, training_items: 0 })
const canSubmit = computed(() => !!password.value && confirmEmail.value.trim().toLowerCase() === props.email.toLowerCase())

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' }) : 'soon'

const exportLine = computed(() => {
  const e = exp.value
  if (!e) return 'A zip of your account data as JSON files. We email you when it is ready.'
  if (e.status === 'pending') return 'Preparing. We email you when it is ready.'
  if (e.status === 'ready' && e.download_url) return `Ready. The link works until ${when(e.expires_at)}.`
  if (e.status === 'failed') return 'The last one failed. Try again.'
  return 'The last link expired. Request a new one.'
})

onMounted(async () => {
  const [state, current] = await Promise.all([
    window.api?.account?.deletion().catch(() => null),
    window.api?.account?.dataExport().catch(() => null),
  ])
  if (state) {
    pending.value = state.pending
    summary.value = state.summary
  }
  exp.value = current ?? null
})

async function requestDeletion() {
  if (!canSubmit.value || busy.value) return
  busy.value = true
  msg.value = ''
  err.value = false
  const res = await window.api.account.requestDeletion(password.value, confirmEmail.value)
    .catch(() => ({ ok: false as const, error: 'Could not schedule the deletion. Try again.' }))
  busy.value = false
  if (!res.ok) {
    err.value = true
    msg.value = res.error
    return
  }
  pending.value = res.pending
  password.value = ''
  confirmEmail.value = ''
  open.value = false
  msg.value = 'Deletion scheduled. We have emailed you the date.'
}

async function cancelDeletion() {
  if (busy.value) return
  busy.value = true
  msg.value = ''
  err.value = false
  const res = await window.api.account.cancelDeletion()
    .catch(() => ({ ok: false as const, error: 'Could not cancel. Try again.' }))
  busy.value = false
  if (!res.ok) {
    err.value = true
    msg.value = res.error
    return
  }
  pending.value = null
  msg.value = 'Cancelled. Your account stays.'
}

async function requestExport() {
  if (exportBusy.value) return
  exportBusy.value = true
  exportMsg.value = ''
  exportErr.value = false
  const res = await window.api.account.requestDataExport()
    .catch(() => ({ ok: false as const, error: 'Could not request your data. Try again.' }))
  exportBusy.value = false
  if (!res.ok) {
    exportErr.value = true
    exportMsg.value = res.error
    return
  }
  exp.value = res.export
  exportMsg.value = 'Requested. We will email you when it is ready.'
}

async function downloadExport() {
  const res = await window.api.account.openDataExport().catch(() => ({ ok: false, error: 'Could not open the link.' }))
  if (!res.ok) {
    exportErr.value = true
    exportMsg.value = res.error ?? 'Could not open the link.'
  }
}

const btn = computed(() => (uiV3.value ? 'uf-btn-secondary uf-set-btn' : 'btn-secondary'))
const note = (bad: boolean) => (uiV3.value ? ['uf-note', bad ? 'is-bad' : ''] : ['text-xs', bad ? 'text-red-400' : 'text-gray-400'])
</script>

<template>
  <SettingsSection id="your-data" title="Your data" :hint="uiV3 ? undefined : 'Download a copy, or delete your account'">
    <SettingsRow label="Download my data" :hint="exportLine">
      <button v-if="exp?.status === 'ready' && exp.download_url" type="button" :class="btn" @click="downloadExport">Download</button>
      <button v-else type="button" :class="btn" :disabled="exportBusy || exp?.status === 'pending'" @click="requestExport">
        {{ exportBusy ? 'Requesting…' : 'Request download' }}
      </button>
    </SettingsRow>
    <p v-if="exportMsg" :class="note(exportErr)" role="status">{{ exportMsg }}</p>

    <SettingsRow
      v-if="pending"
      :label="`Deletion scheduled for ${when(pending.scheduled_for)}`"
      hint="Your account works as normal until then. You can cancel any time before."
    >
      <button v-if="pending.can_cancel" type="button" :class="btn" :disabled="busy" @click="cancelDeletion">
        {{ busy ? 'Cancelling…' : 'Cancel deletion' }}
      </button>
    </SettingsRow>

    <template v-else>
      <SettingsRow
        label="Delete account"
        :hint="`Deletes your account and data ${graceDays} day${graceDays === 1 ? '' : 's'} after you confirm. You can cancel until then.`"
      >
        <button type="button" :class="uiV3 ? 'uf-link uf-profile-signout' : 'btn-danger'" :aria-expanded="open" @click="open = !open">
          {{ open ? 'Close' : 'Delete account' }}
        </button>
      </SettingsRow>

      <div v-if="open" class="space-y-3">
        <p :class="uiV3 ? 'uf-t3' : 'text-sm text-gray-200'">What gets deleted</p>
        <ul :class="uiV3 ? 'uf-t4' : 'text-xs text-gray-400'" class="list-disc space-y-1 pl-5">
          <li>{{ counts.analyses }} analyses, {{ counts.recordings }} saved recordings, {{ counts.clips }} clips and {{ counts.replays }} replays</li>
          <li>Demos, match history, drills, notes and settings</li>
          <li>Copies used for AI training ({{ counts.training_items }})</li>
          <li v-if="summary?.subscriptions">Your subscription is cancelled straight away. No refund for the time left.</li>
          <li v-if="summary?.owns_squad">Your Squad "{{ summary.owns_squad.name }}" and its plan are closed</li>
          <li v-if="summary?.is_coach">Your coach profile is closed</li>
          <li>Recordings saved on this PC are not touched. Delete them from Recordings if you want.</li>
        </ul>
        <p v-if="summary?.kept_records?.length" :class="note(false)">
          Kept: payment records with other people (coaching payments and payouts), without your name or contact details. We need them for accounting.
        </p>
        <p v-for="b in blockers" :key="b.code" :class="note(true)" role="alert">{{ b.message }}</p>

        <form v-if="!blockers.length" class="space-y-3" @submit.prevent="requestDeletion">
          <label :class="uiV3 ? 'uf-field' : 'block space-y-1'">
            <span :class="uiV3 ? 'uf-t4' : 'text-xs text-gray-400'">Password</span>
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              :class="uiV3 ? 'uf-input' : 'w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white'"
            >
          </label>
          <label :class="uiV3 ? 'uf-field' : 'block space-y-1'">
            <span :class="uiV3 ? 'uf-t4' : 'text-xs text-gray-400'">Type your email to confirm</span>
            <input
              v-model="confirmEmail"
              type="email"
              autocomplete="off"
              :placeholder="email"
              :class="uiV3 ? 'uf-input' : 'w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white'"
            >
          </label>
          <button type="submit" :class="uiV3 ? 'uf-btn-secondary uf-set-btn' : 'btn-danger'" :disabled="busy || !canSubmit">
            {{ busy ? 'Scheduling…' : 'Delete my account' }}
          </button>
        </form>
      </div>
    </template>
    <p v-if="msg" :class="note(err)" role="status">{{ msg }}</p>
  </SettingsSection>
</template>
