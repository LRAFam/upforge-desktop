<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { cloudBytes } from '../../lib/cloud-storage'
import { capacityLabel } from '../../lib/account-usage'
import { useAccountUsage } from '../../composables/useAccountUsage'
const emit = defineEmits<{ upgrade: [] }>()
const router = useRouter()
const { usage, error, loading, load } = useAccountUsage()
const purchasing = ref(false), purchaseNotice = ref('')
let purchaseGeneration = 0
const purchaseCleanups = ['session:user-changed', 'auth:session-expired'].map(event => window.api.on(event, () => {
  purchaseGeneration++; purchasing.value = false; purchaseNotice.value = ''
}))
onBeforeUnmount(() => { purchaseGeneration++; purchaseCleanups.forEach(cleanup => cleanup()) })
async function buyReports() {
  if (purchasing.value) return
  const generation = purchaseGeneration
  purchasing.value = true; purchaseNotice.value = ''
  try {
    const result = await window.api.accountUsage.buyReports()
    if (generation !== purchaseGeneration) return
    if (!result.ok) { purchaseNotice.value = result.error; return }
    const url = new URL(result.data.checkout_url)
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Invalid checkout')
    await window.api.app.openUrl(url.toString())
    if (generation === purchaseGeneration) purchaseNotice.value = 'Complete checkout in your browser, then return here. Refresh usage if your credits have not arrived yet.'
  } catch { if (generation === purchaseGeneration) purchaseNotice.value = 'Could not open checkout. Check your balance before retrying.' }
  finally { if (generation === purchaseGeneration) purchasing.value = false }
}
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
          <strong>{{ usage.review_access.comparison_access_reason === 'free_trial' ? 'Your first comparison is free' : usage.review_access.comparison ? 'Comparison access included' : 'Create more comparisons with Plus or Pro' }}</strong>
          <p v-if="usage.review_access.comparison_access_reason === 'existing_account'">Your existing account keeps comparison access.</p>
          <p v-else-if="usage.review_access.comparison_access_reason === 'preview'">Comparison is available during the workspace preview.</p>
          <p>Saved comparisons remain readable if your plan changes. Your free trial comparison stays editable.</p>
          <button v-if="!usage.review_access.comparison" type="button" @click="emit('upgrade')">View comparison plans</button>
        </template>
        <p v-else>Review access is unavailable from this server.</p>
      </section>
      <section class="storage-entry">
        <h3>Need more cloud storage?</h3>
        <p>Choose extra capacity in GB without changing your plan. Storage is billed monthly, separately from AI credits.</p>
        <button type="button" @click="router.push('/cloud-storage')">Manage storage and view prices</button>
      </section>
      <section><h3>Cloud storage</h3><template v-if="usage.cloud_storage"><strong>{{ cloudBytes(usage.cloud_storage.used_bytes) }} used<span v-if="usage.cloud_storage.capacity_bytes !== null"> / {{ cloudBytes(usage.cloud_storage.capacity_bytes) }}</span></strong><p>Shared by clips and recordings across all games. Local files do not count.</p></template><p v-else>Storage allowance unavailable.</p><button type="button" @click="router.push('/cloud-storage')">Manage storage</button></section>
      <section><h3>Full-match AI reports</h3><strong>{{ usage.reports.limit === null ? 'Unlimited reports' : `${usage.reports.remaining} of ${usage.reports.limit} included reports left` }}</strong><p v-if="usage.reports.period === 'lifetime'">Lifetime allowance. It does not reset each month.</p><p v-else-if="usage.reports.resets_at">Resets {{ date(usage.reports.resets_at) }}</p><p v-else-if="usage.reports.reset_on_next_use">Your next report starts a new monthly allowance.</p><p>{{ usage.reports.purchased }} purchased report credits · separate from your included allowance</p><button type="button" :disabled="purchasing" @click="buyReports">{{ purchasing ? 'Opening checkout…' : 'Buy 3 report credits' }}</button><p>One-time purchase for full-match reports, separate from Ask AI coach questions. Review the price in Stripe before paying. Purchased reports do not expire.</p><p v-if="purchaseNotice" role="status">{{ purchaseNotice }}</p></section>
      <section><h3>Ask AI coach</h3><strong>{{ usage.coach_credits }} Coach Credits</strong><p>Included questions and match limits appear in Ask AI coach. Coach Credits are separate from full-match reports.</p></section>
      <button type="button" @click="emit('upgrade')">View plans and upgrades</button>
      <p class="updated">Updated {{ new Date(usage.as_of).toLocaleTimeString() }}</p>
    </template>
  </div>
</template>
<style scoped>
.account-usage { display:grid; gap:16px; font-size:13px; color:#d1d5db; }.usage-header{display:flex;justify-content:space-between;align-items:center;gap:12px}.usage-header p,h3{font-weight:700;color:#f3f4f6}section{border-top:1px solid #ffffff18;padding-top:14px;display:grid;gap:7px}p{color:#9ca3af;line-height:1.5}button{justify-self:start;min-height:36px;padding:6px 12px;border:1px solid #ffffff30;border-radius:5px;color:#e5e7eb}button:hover{border-color:#f43f5e}button:focus-visible{outline:2px solid #f43f5e;outline-offset:3px}.updated{font-size:11px}
</style>
