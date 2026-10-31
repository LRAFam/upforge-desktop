<script setup lang="ts">
import { plural } from '../../lib/plural'
import UfSkeleton from '../v3/UfSkeleton.vue'
import { onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { cloudBytes } from '../../lib/cloud-storage'
import { capacityLabel } from '../../lib/account-usage'
import { useAccountUsage } from '../../composables/useAccountUsage'
import { uiV3 } from '../../lib/ui-v3'
import { momentsLine, notesLine, roundReviewsLine, type CoachAllowances } from '../../lib/coach-allowances'
// Coaching allowances (new design): daily coach notes, monthly key moments, round reviews.
const coach = ref<CoachAllowances | null>(null)
const coachLines = () => [
  ['Coach notes', notesLine(coach.value?.notes)],
  ['Key-moment reviews', momentsLine(coach.value?.key_moments)],
  ['Round reviews', roundReviewsLine(coach.value?.round_reviews)],
].filter((r): r is [string, string] => !!r[1])
if (uiV3.value) void window.api?.coachFlow?.allowances?.().then(a => { coach.value = a }).catch(() => {})
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
/** Share of an allowance used, 0–100, or null when there is no cap (no bar is drawn). */
const usedPct = (used: number, cap: number | null | undefined) => (cap ? Math.min(100, Math.max(0, (used / cap) * 100)) : null)
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
</script>
<template>
  <div v-if="uiV3" class="uf-usage">
    <div class="uf-set-row">
      <p class="uf-t3">Cloud storage and AI usage</p>
      <button type="button" class="uf-link" :disabled="loading" @click="load">{{ loading ? (usage ? 'Refreshing…' : 'Loading…') : 'Refresh usage' }}</button>
    </div>
    <p v-if="error" role="status" class="uf-note is-bad">{{ error }}</p>
    <div v-for="[label, line] in coachLines()" :key="label" class="uf-set-row">
      <div class="uf-set-row-text"><p class="uf-t3">{{ label }}</p><p class="uf-t4">{{ line }}</p></div>
    </div>
    <!-- First-ever load: placeholder rows in the shape of the usage rows (title + value, meter, note). -->
    <div v-if="!usage && !error" aria-busy="true" aria-label="Loading usage">
      <div v-for="i in 3" :key="i" class="uf-usage-row">
        <div class="uf-usage-head"><UfSkeleton :w="140" :h="15" /><UfSkeleton :w="90" :h="15" /></div>
        <UfSkeleton :h="6" />
        <UfSkeleton w="58%" :h="13" />
      </div>
    </div>
    <template v-if="usage">
      <div class="uf-usage-row">
        <div class="uf-usage-head"><p class="uf-t3">Cloud storage</p>
          <p v-if="usage.cloud_storage" class="uf-t3 uf-num">{{ cloudBytes(usage.cloud_storage.used_bytes) }}<span v-if="usage.cloud_storage.capacity_bytes !== null" class="uf-usage-of"> / {{ cloudBytes(usage.cloud_storage.capacity_bytes) }}</span></p>
        </div>
        <template v-if="usage.cloud_storage">
          <div v-if="usedPct(usage.cloud_storage.used_bytes, usage.cloud_storage.capacity_bytes) !== null" class="uf-meter" :class="{ 'is-warn': (usedPct(usage.cloud_storage.used_bytes, usage.cloud_storage.capacity_bytes) ?? 0) >= 90 }">
            <span class="uf-fill" :style="{ width: usedPct(usage.cloud_storage.used_bytes, usage.cloud_storage.capacity_bytes) + '%' }" />
          </div>
          <p class="uf-t4">Shared by clips and recordings across all games. Local files do not count.</p>
        </template>
        <p v-else class="uf-t4">Storage allowance unavailable.</p>
        <div class="uf-set-actions">
          <button type="button" class="uf-btn-secondary uf-set-btn" @click="router.push('/cloud-storage')">Manage storage and view prices</button>
        </div>
        <p class="uf-t4">Need more? Choose extra capacity in GB without changing your plan. Storage is billed monthly, separately from AI credits.</p>
      </div>

      <div class="uf-usage-row">
        <div class="uf-usage-head"><p class="uf-t3">Full-match AI reports</p>
          <p class="uf-t3 uf-num">{{ usage.reports.limit === null ? 'Unlimited reports' : `${usage.reports.remaining} of ${usage.reports.limit} left` }}</p>
        </div>
        <div v-if="usage.reports.limit" class="uf-meter" :class="{ 'is-warn': usage.reports.remaining === 0 }">
          <span class="uf-fill" :style="{ width: (usedPct(usage.reports.limit - (usage.reports.remaining ?? 0), usage.reports.limit) ?? 0) + '%' }" />
        </div>
        <p v-if="usage.reports.period === 'lifetime'" class="uf-t4">Lifetime allowance. It does not reset each month.</p>
        <p v-else-if="usage.reports.resets_at" class="uf-t4">Resets {{ date(usage.reports.resets_at) }}</p>
        <p v-else-if="usage.reports.reset_on_next_use" class="uf-t4">Your next report starts a new monthly allowance.</p>
        <p class="uf-t4">{{ plural(usage.reports.purchased, 'purchased report credit') }} · separate from your included allowance</p>
        <div class="uf-set-actions">
          <button type="button" class="uf-btn-secondary uf-set-btn" :disabled="purchasing" @click="buyReports">{{ purchasing ? 'Opening checkout…' : 'Buy 3 report credits' }}</button>
        </div>
        <p class="uf-t4">One-time purchase for full-match reports, separate from Ask AI coach questions. Review the price in Stripe before paying. Purchased reports do not expire.</p>
        <p v-if="purchaseNotice" role="status" class="uf-note">{{ purchaseNotice }}</p>
      </div>

      <div class="uf-usage-row">
        <div class="uf-usage-head"><p class="uf-t3">Ask AI coach</p><p class="uf-t3 uf-num">{{ plural(usage.coach_credits, 'Coach Credit') }}</p></div>
        <p class="uf-t4">Included questions and match limits appear in Ask AI coach. Coach Credits are separate from full-match reports.</p>
      </div>

      <div class="uf-usage-row">
        <div class="uf-usage-head"><p class="uf-t3">Review tools</p>
          <p v-if="usage.review_access" class="uf-t3">{{ usage.review_access.comparison_access_reason === 'free_trial' ? 'Your first comparison is free' : usage.review_access.comparison ? 'Comparison included' : 'Comparison on Plus or Pro' }}</p>
        </div>
        <template v-if="usage.review_access">
          <p class="uf-t4">Basic replay, personal notes and next-match focus stay free.</p>
          <p v-if="usage.review_access.comparison_access_reason === 'existing_account'" class="uf-t4">Your existing account keeps comparison access.</p>
          <p v-else-if="usage.review_access.comparison_access_reason === 'preview'" class="uf-t4">Comparison is available during the workspace preview.</p>
          <p class="uf-t4">Saved comparisons remain readable if your plan changes. Your free trial comparison stays editable.</p>
          <div v-if="!usage.review_access.comparison" class="uf-set-actions"><button type="button" class="uf-link" @click="emit('upgrade')">View comparison plans →</button></div>
        </template>
        <p v-else class="uf-t4">Review access is unavailable from this server.</p>
      </div>

      <div class="uf-set-row">
        <p class="uf-t4">Updated {{ new Date(usage.as_of).toLocaleTimeString() }}</p>
        <button type="button" class="uf-btn-secondary uf-set-btn" @click="emit('upgrade')">View plans and upgrades</button>
      </div>
    </template>
  </div>
  <div v-else class="account-usage">
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
      <section><h3>Full-match AI reports</h3><strong>{{ usage.reports.limit === null ? 'Unlimited reports' : `${usage.reports.remaining} of ${usage.reports.limit} included reports left` }}</strong><p v-if="usage.reports.period === 'lifetime'">Lifetime allowance. It does not reset each month.</p><p v-else-if="usage.reports.resets_at">Resets {{ date(usage.reports.resets_at) }}</p><p v-else-if="usage.reports.reset_on_next_use">Your next report starts a new monthly allowance.</p><p>{{ plural(usage.reports.purchased, 'purchased report credit') }} · separate from your included allowance</p><button type="button" :disabled="purchasing" @click="buyReports">{{ purchasing ? 'Opening checkout…' : 'Buy 3 report credits' }}</button><p>One-time purchase for full-match reports, separate from Ask AI coach questions. Review the price in Stripe before paying. Purchased reports do not expire.</p><p v-if="purchaseNotice" role="status">{{ purchaseNotice }}</p></section>
      <section><h3>Ask AI coach</h3><strong>{{ plural(usage.coach_credits, 'Coach Credit') }}</strong><p>Included questions and match limits appear in Ask AI coach. Coach Credits are separate from full-match reports.</p></section>
      <button type="button" @click="emit('upgrade')">View plans and upgrades</button>
      <p class="updated">Updated {{ new Date(usage.as_of).toLocaleTimeString() }}</p>
    </template>
  </div>
</template>
<style scoped>
.account-usage { display:grid; gap:16px; font-size:13px; color:#d1d5db; }.usage-header{display:flex;justify-content:space-between;align-items:center;gap:12px}.usage-header p,h3{font-weight:700;color:#f3f4f6}section{border-top:1px solid #ffffff18;padding-top:14px;display:grid;gap:7px}p{color:#9ca3af;line-height:1.5}button{justify-self:start;min-height:36px;padding:6px 12px;border:1px solid #ffffff30;border-radius:5px;color:#e5e7eb}button:hover{border-color:#f43f5e}button:focus-visible{outline:2px solid #f43f5e;outline-offset:3px}.updated{font-size:11px}
</style>
