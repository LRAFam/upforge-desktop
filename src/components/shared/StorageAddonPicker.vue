<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { cloudBytes } from '../../lib/cloud-storage'
import { storagePaymentConfirmed, type StorageAddonSnapshot, type StorageAddonRequest } from '../../lib/storage-addon'
const emit = defineEmits<{ changed: []; loaded: [StorageAddonSnapshot] }>()
const snapshot = ref<StorageAddonSnapshot | null>(null), error = ref(''), notice = ref(''), busy = ref(false)
const unavailable = ref(false), loading = ref(false)
const retryRequest = ref<StorageAddonRequest | null>(null)
let paymentGeneration = 0
let lastLoaded = 0
const step = ref(0), confirmingCancel = ref(false)
let generation = 0
let loadSequence = 0
let paymentTimer: ReturnType<typeof setTimeout> | undefined
const pendingGb = ref<number | null>(null)
let paymentChecks = 0
const checking = ref(false)
function stopChecking() { paymentGeneration++; clearTimeout(paymentTimer); checking.value = false }
function closeCheckout() { stopChecking(); pendingGb.value = null; retryRequest.value = null; error.value = ''; notice.value = 'Checkout dismissed. Any completed payment will still be applied.'; void load() }
async function checkPayment() {
  if (pendingGb.value === null || checking.value) return
  clearTimeout(paymentTimer)
  const account = generation
  const payment = paymentGeneration
  const target = pendingGb.value
  checking.value = true
  try {
    const result = await window.api.storageAddon.request({ action: 'sync' })
    if (account !== generation || payment !== paymentGeneration) return
    if (!result.ok || !result.data) { error.value = result.ok ? 'Payment status is unavailable.' : result.error; return }
    snapshot.value = result.data
    emit('loaded', result.data)
    error.value = ''
    if (storagePaymentConfirmed(result.data, target)) {
      notice.value = `${target} GB of extra storage is ready. You can retry your upload now.`
      pendingGb.value = null
      emit('changed')
    } else {
      notice.value = ['past_due', 'unpaid', 'incomplete'].includes(result.data.usage.status)
        ? 'Payment is unfinished. Complete it in Stripe, then check again.'
        : 'Waiting for payment confirmation. Your allowance has not changed yet.'
    }
  } catch { if (account === generation && payment === paymentGeneration) error.value = 'Could not confirm payment. Your allowance has not been changed here.' }
  finally {
    if (account === generation && payment === paymentGeneration) {
      checking.value = false
      paymentChecks++
      if (pendingGb.value !== null && paymentChecks < 12) paymentTimer = setTimeout(() => { void checkPayment() }, 10000)
    }
  }
}
const selected = computed(() => snapshot.value?.packs[step.value])
const price = computed(() => selected.value ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(selected.value.cents/100) : '')
const usage = computed(() => snapshot.value?.usage)
const hasSubscription = computed(() => usage.value && !['none','canceled','incomplete_expired'].includes(usage.value.status))
const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : 'Not available'
async function load(sync = false) {
  if (loading.value) return
  loading.value = true
  const request = ++loadSequence
  const account = generation
  try {
    const result = await window.api.storageAddon.request({ action: sync ? 'sync' : 'show' })
    if (request !== loadSequence || account !== generation) return
    if (result.ok && result.data) { if (!snapshot.value) step.value = Math.max(0,result.data.packs.findIndex(p => p.gb * 1e9 === result.data!.usage.capacity_bytes)); snapshot.value = result.data; lastLoaded = Date.now(); unavailable.value = false; error.value = ''; emit('loaded', result.data) }
    else if (!result.ok) { unavailable.value = result.unavailable === true; error.value = result.error }
  } catch { if (request === loadSequence && account === generation) error.value = 'Storage options could not be loaded.' }
  finally { if (account === generation) loading.value = false }
}
async function act(request: StorageAddonRequest) {
  if (busy.value) return
  stopChecking()
  retryRequest.value = request
  busy.value = true; error.value = ''; notice.value = ''
  const account = generation
  try {
    const result = await window.api.storageAddon.request(request)
    if (account !== generation) return
    if (!result.ok) { error.value = result.error; return }
    notice.value = request.action === 'cancel' ? 'Storage renewal updated.' : 'Finish in Stripe, then return here. Your allowance updates after payment is confirmed.'
    confirmingCancel.value = false
    if (request.action === 'checkout' || request.action === 'change' || request.action === 'payment') {
      pendingGb.value = 'gb' in request ? request.gb : (usage.value!.capacity_bytes / 1e9)
      paymentChecks = 0
      paymentTimer = setTimeout(() => { void checkPayment() }, 10000)
    } else { emit('changed'); await load() }
  } catch { if (account === generation) error.value = 'Storage could not be updated. Please retry.' }
  finally { if (account === generation) busy.value = false }
}
function reset() { generation++; stopChecking(); pendingGb.value = null; busy.value = false; loading.value = false; retryRequest.value = null; snapshot.value = null; unavailable.value = false; error.value = 'Sign in to manage storage.'; notice.value = ''; confirmingCancel.value = false }
function refresh() { if (!busy.value) { if (pendingGb.value !== null) void checkPayment(); else if (Date.now() - lastLoaded > 30000) void load() } }
const cleanups = ['session:user-changed','auth:session-expired'].map(event => window.api.on(event, reset))
onMounted(() => { void load(); window.addEventListener('focus', refresh) })
onBeforeUnmount(() => { generation++; stopChecking(); cleanups.forEach(fn => fn()); window.removeEventListener('focus', refresh) })
</script>
<template>
  <section class="storage-picker" aria-labelledby="storage-picker-title">
    <h2 id="storage-picker-title">{{ unavailable ? 'Extra storage is coming soon' : hasSubscription ? 'Your extra storage' : 'Get more storage' }}</h2>
    <p class="intro">One GB allowance for clips and recordings. Your main plan and AI allowance stay separate.</p>
    <div v-if="error" :role="unavailable ? 'status' : 'alert'"><p class="price-note">{{ error }}</p><button v-if="!unavailable" :disabled="busy || loading" @click="retryRequest ? act(retryRequest) : load()">Retry</button></div>
    <p v-if="loading && !snapshot" class="price-note" role="status">Loading storage options…</p>
    <template v-if="snapshot && selected">
      <p v-if="usage && usage.capacity_bytes" class="retention">{{ cloudBytes(usage.used_bytes) }} used of {{ cloudBytes(usage.capacity_bytes) }}. {{ cloudBytes(usage.reserved_bytes) }} uploading.</p>
      <p v-if="usage?.paid_until" class="price-note">{{ usage.cancel_at_period_end ? 'Paid access ends' : 'Current paid period ends' }} {{ date(usage.paid_until) }}. Download grace until {{ date(usage.grace_until) }} if not renewed.</p>
      <div class="selection"><div><strong>{{ selected.gb }} <span>GB</span></strong><p>Total extra capacity</p></div><div class="price"><strong>{{ price }}</strong><p>USD / month</p></div></div>
      <label class="slider-label" for="storage-addon-size">Extra capacity</label>
      <input id="storage-addon-size" v-model.number="step" type="range" min="0" :max="snapshot.packs.length-1" step="1" :disabled="busy || pendingGb !== null" :aria-valuetext="`${selected.gb} GB, ${price} per month`" />
      <div class="stops"><button v-for="(pack,index) in snapshot.packs" :key="pack.gb" :disabled="busy || pendingGb !== null" :aria-pressed="index===step" :class="{chosen:index===step}" @click="step=index">{{ pack.gb }} GB</button></div>
      <p class="retention">New uploads use paid space when your plan allowance is full. Use Keep in paid storage for footage you want to retain longer. Files in paid storage stay while you keep paying. After paid access ends, you have {{ snapshot.grace_days }} days to download them before removal.</p>
      <button class="purchase" :disabled="busy || pendingGb !== null || !selected.available || (usage?.capacity_bytes === selected.gb * 1e9 && hasSubscription)" @click="act({action:hasSubscription ? 'change' : 'checkout',gb:selected.gb})">{{ busy ? 'Please wait…' : hasSubscription ? 'Review capacity change' : `Continue · ${price}/month` }}</button>
      <p class="price-note">{{ selected.available ? 'Review the total and any prorated charge in Stripe before confirming. GB means 1 billion bytes.' : 'Purchases are not available yet. Your current allowance is unchanged.' }}</p>
      <div v-if="hasSubscription" class="management-actions"><button v-if="usage && ['incomplete','past_due','unpaid'].includes(usage.status)" :disabled="busy || pendingGb !== null" @click="act({action:'payment'})">Resolve storage payment</button>
        <button v-if="usage?.cancel_at_period_end" :disabled="busy || pendingGb !== null" @click="act({action:'cancel',cancel:false})">Keep storage renewing</button>
        <button v-else :disabled="busy || pendingGb !== null" @click="confirmingCancel=true">Stop storage renewal</button>
        <div v-if="confirmingCancel" class="cancel-confirmation"><p class="price-note">Stop future storage renewals? Keep paid access until {{ date(usage?.paid_until ?? null) }}, then download your files by {{ date(usage?.grace_until ?? null) }}. Your main plan stays unchanged.</p><button :disabled="busy || pendingGb !== null" @click="act({action:'cancel',cancel:true})">Confirm stop renewal</button><button @click="confirmingCancel=false">Go back</button></div>
      </div>
      <p v-if="notice" role="status" class="price-note">{{ notice }}</p>
      <div v-if="pendingGb !== null" class="checkout-actions">
        <button :disabled="busy || checking" @click="checkPayment">{{ checking ? 'Checking payment…' : 'Check payment status' }}</button>
        <button :disabled="busy" @click="closeCheckout">I closed checkout</button>
      </div>
      <button v-else class="refresh-allowance" :disabled="busy || loading" @click="load(true)">{{ loading ? 'Refreshing…' : 'Refresh allowance' }}</button>
    </template>
  </section>
</template>
<style scoped>
.storage-picker{padding:20px;background:#121820;border:1px solid #ffffff15;border-top:2px solid #ed164a;border-radius:10px;color:#e7ebf0;min-width:0}.preview-label{font-size:10px;font-weight:650;letter-spacing:.5px;color:#d9b781;margin:0 0 12px}h2{font-size:20px;font-weight:700;line-height:1.25;margin:0 0 9px}.intro,.retention{font-size:12px;line-height:1.6;color:#a4b0bf;margin:0}.selection{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:24px 0 20px}.selection strong{font-size:25px;font-weight:750;font-variant-numeric:tabular-nums;letter-spacing:-.7px}.selection strong span{font-size:15px;letter-spacing:0}.selection p{font-size:10px;color:#94a0af;margin:5px 0 0}.price{text-align:right}.price strong{font-size:21px}.slider-label{display:block;font-size:11px;color:#b2becc;margin-bottom:8px}input{display:block;width:100%;margin:0;height:24px;accent-color:#ed164a;cursor:pointer}.stops{display:flex;justify-content:space-between;gap:3px;margin-top:7px}.stops button{padding:6px 3px;min-height:32px;font-size:10px;background:transparent;border:1px solid transparent;border-radius:4px;color:#9daabd;cursor:pointer;white-space:nowrap}.stops button.chosen{border-color:#ed164a66;background:#ed164a14;color:#fff}.stops button:hover{color:#fff}input:focus-visible,button:focus-visible{outline:2px solid #ff3561;outline-offset:3px}.summary{border-top:1px solid #ffffff14;border-bottom:1px solid #ffffff14;padding:13px 0;margin:19px 0 14px;font-size:11px}.summary div{display:flex;justify-content:space-between;gap:12px;padding:4px 0}.summary dt{color:#94a0af}.summary dd{margin:0;text-align:right;font-weight:600}.purchase{width:100%;min-height:42px;margin-top:18px;padding:10px 8px;background:#9b2541;color:#ecd3d9;border:1px solid #ae3552;border-radius:5px;font-size:12px;font-weight:650;cursor:pointer}.price-note{font-size:10px;line-height:1.6;color:#94a0af;margin:10px 0 0}

.storage-picker{background:#161e27;border-radius:8px;padding:23px;border-top:3px solid #ed164a}.preview-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px}h2{font-size:23px;letter-spacing:-.5px}.selection{padding:20px 0;margin:12px 0 7px;border-bottom:1px solid #ffffff12}.selection strong{font-size:36px}.price strong{font-size:25px}.stops button{min-height:36px;padding:6px;font-size:11px}.summary{margin-top:17px}.purchase{min-height:46px}.price-note{color:#a2adba}
</style>

<style scoped>
button:disabled{opacity:.5;cursor:not-allowed}.management-actions,.checkout-actions{display:flex;flex-direction:column;gap:10px;margin-top:18px;padding-top:16px;border-top:1px solid #ffffff18}.storage-picker button:not(.purchase):not(.stops button){min-height:40px;padding:10px 12px;background:#202b37;border:1px solid #ffffff25;border-radius:6px;color:#dce4ed;font-size:12px;line-height:1.4;text-align:center;text-decoration:none;cursor:pointer}.storage-picker button:not(:disabled):hover{filter:brightness(1.15)}.refresh-allowance{display:block;width:100%;margin-top:12px}.cancel-confirmation{display:grid;gap:10px;padding:12px;border:1px solid #e8b86a55;border-radius:6px;background:#e8b86a08}.cancel-confirmation p{margin:0 0 4px}.purchase{background:#ed164a;border-color:#ed164a;color:#fff}
</style>
