<script setup lang="ts">
import { useRouter } from 'vue-router'
import { capacityLabel } from '../../lib/account-usage'
import { useAccountUsage } from '../../composables/useAccountUsage'
const emit = defineEmits<{ upgrade: [] }>()
const router = useRouter()
const { usage, error, loading, load } = useAccountUsage()
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
</script>
<template>
  <div class="account-usage">
    <div class="usage-header"><p>Cloud storage and AI usage</p><button type="button" :disabled="loading" @click="load">{{ loading ? 'Loading…' : 'Refresh usage' }}</button></div>
    <p v-if="error" role="status">{{ error }}</p>
    <template v-if="usage">
      <section class="review-access"><h3>Review tools</h3>
        <template v-if="usage.review_access">
          <p>Basic replay, personal notes and next-match focus stay free.</p>
          <strong>{{ usage.review_access.comparison ? 'Comparison access included' : 'Comparison is included with Plus and Pro' }}</strong>
          <p v-if="usage.review_access.comparison_access_reason === 'existing_account'">Your existing account keeps comparison access.</p>
          <p v-else-if="usage.review_access.comparison_access_reason === 'preview'">Comparison is available during the workspace preview.</p>
          <p>Saved comparisons remain readable if your plan changes.</p>
          <button v-if="!usage.review_access.comparison" type="button" @click="emit('upgrade')">View comparison plans</button>
        </template>
        <p v-else>Review access is unavailable from this server.</p>
      </section>
      <section><h3>Cloud clips</h3><strong>{{ capacityLabel(usage.clips) }}</strong><p>Saved clips occupy space until removed. This allowance does not reset monthly.</p><button type="button" @click="router.push('/clips')">Manage clips</button></section>
      <section><h3>Cloud footage</h3><strong>{{ capacityLabel(usage.footage) }}</strong><p>{{ usage.footage.stored }} saved · {{ usage.footage.reserved }} uploads reserved</p><p v-if="usage.footage.stored_bytes !== null">{{ (usage.footage.stored_bytes / 1073741824).toFixed(2) }} GB stored</p><p v-if="usage.footage.retention_days !== null">Kept for {{ usage.footage.retention_days }} days. Local recordings do not use cloud capacity.</p><p v-if="usage.footage.next_expiry_at">Next recording expiry: {{ date(usage.footage.next_expiry_at) }}</p><button type="button" @click="router.push('/recordings')">Manage footage</button></section>
      <section><h3>AI reports</h3><strong>{{ usage.reports.limit === null ? 'Unlimited reports' : `${usage.reports.remaining} of ${usage.reports.limit} included reports left` }}</strong><p v-if="usage.reports.period === 'lifetime'">Lifetime allowance. It does not reset each month.</p><p v-else-if="usage.reports.resets_at">Resets {{ date(usage.reports.resets_at) }}</p><p v-else-if="usage.reports.reset_on_next_use">Your next report starts a new monthly allowance.</p><p>{{ usage.reports.purchased }} purchased report credits · separate from your included allowance</p></section>
      <section><h3>Ask AI coach</h3><strong>{{ usage.coach_credits }} Coach Credits</strong><p>Included questions and match limits appear in Ask AI coach. Coach Credits are separate from full-match reports.</p></section>
      <button type="button" @click="emit('upgrade')">View plans and upgrades</button>
      <p class="updated">Updated {{ new Date(usage.as_of).toLocaleTimeString() }}</p>
    </template>
  </div>
</template>
<style scoped>
.account-usage { display:grid; gap:16px; font-size:13px; color:#d1d5db; }.usage-header{display:flex;justify-content:space-between;align-items:center;gap:12px}.usage-header p,h3{font-weight:700;color:#f3f4f6}section{border-top:1px solid #ffffff18;padding-top:14px;display:grid;gap:7px}p{color:#9ca3af;line-height:1.5}button{justify-self:start;min-height:36px;padding:6px 12px;border:1px solid #ffffff30;border-radius:5px;color:#e5e7eb}button:hover{border-color:#f43f5e}button:focus-visible{outline:2px solid #f43f5e;outline-offset:3px}.updated{font-size:11px}
</style>
