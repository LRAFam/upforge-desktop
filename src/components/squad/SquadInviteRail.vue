<script setup lang="ts">
import { ref } from 'vue'
import { squadTimeAgo } from '../../lib/squad-ui'

const props = defineProps<{
  pendingInvites: Array<{ value: string; createdAt: number }>
  creditsRemaining: number | null
  creditsTotal: number | null
  inviteCode: string | null
}>()

const emit = defineEmits<{
  invite: [value: string]
  removePending: [value: string]
  manage: []
}>()

const inviteTarget = ref('')
const copied = ref(false)

function submit() {
  const value = inviteTarget.value.trim()
  if (!value) return
  emit('invite', value)
  inviteTarget.value = ''
}

async function copyCode() {
  if (!props.inviteCode) return
  try {
    await navigator.clipboard.writeText(props.inviteCode)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { /* ignore */ }
}
</script>

<template>
  <div class="flex flex-col gap-3 h-full">
    <div v-if="creditsRemaining != null && creditsTotal" class="dash-panel p-4">
      <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Shared credits</p>
      <div class="flex items-end justify-between gap-2 mt-2">
        <p class="text-2xl font-black tabular-nums text-amber-300">{{ creditsRemaining }}<span class="text-sm text-gray-600"> / {{ creditsTotal }}</span></p>
        <p class="text-[10px] text-gray-600 pb-1">Squad pool</p>
      </div>
      <div class="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all"
          :style="{ width: `${Math.min(100, Math.round((creditsRemaining / creditsTotal) * 100))}%` }"
        />
      </div>
    </div>

    <div v-if="inviteCode" class="dash-panel p-4">
      <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Squad code</p>
      <div class="mt-2 flex items-center gap-2">
        <code class="flex-1 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm font-bold text-white tracking-widest">{{ inviteCode }}</code>
        <button
          type="button"
          class="px-3 py-2 rounded-lg border border-white/[0.10] text-[11px] font-semibold text-gray-400 hover:text-white"
          @click="copyCode"
        >{{ copied ? 'Copied' : 'Copy' }}</button>
      </div>
    </div>

    <div class="dash-panel p-4">
      <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Invite teammate</p>
      <p class="mt-1 text-[12px] text-gray-400 leading-snug">Send an invite — finishes on the website.</p>

      <div class="mt-3 space-y-2">
        <input
          v-model="inviteTarget"
          type="text"
          class="h-10 w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-red-500/30"
          placeholder="Username or invite code"
          @keyup.enter="submit"
        >
        <button
          type="button"
          class="w-full py-2.5 rounded-lg bg-red-500 text-[12px] font-bold text-white hover:bg-red-400 transition-colors"
          @click="submit"
        >Send invite</button>
        <button
          type="button"
          class="w-full py-2 rounded-lg border border-white/[0.10] text-[11px] font-semibold text-gray-400 hover:text-white hover:bg-white/[0.04] transition-colors"
          @click="emit('manage')"
        >Manage on website</button>
      </div>
    </div>

    <div class="dash-panel p-4 flex-1 min-h-0 flex flex-col">
      <div class="flex items-center justify-between gap-2">
        <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Pending</p>
        <span class="text-[10px] font-bold text-gray-500 tabular-nums">{{ pendingInvites.length }}</span>
      </div>

      <div v-if="pendingInvites.length" class="mt-3 space-y-2 overflow-y-auto scroll-col flex-1">
        <div
          v-for="invite in pendingInvites"
          :key="invite.value"
          class="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-2"
        >
          <div class="min-w-0">
            <p class="text-[12px] font-semibold text-white truncate">{{ invite.value }}</p>
            <p class="text-[10px] text-gray-600">{{ squadTimeAgo(new Date(invite.createdAt).toISOString()) }}</p>
          </div>
          <button
            type="button"
            class="text-[10px] font-semibold text-gray-500 hover:text-white px-2 py-1"
            @click="emit('removePending', invite.value)"
          >Clear</button>
        </div>
      </div>
      <p v-else class="mt-4 text-[11px] text-gray-600 leading-relaxed">No pending invites.</p>
    </div>
  </div>
</template>
