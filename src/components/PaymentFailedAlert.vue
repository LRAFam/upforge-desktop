<template>
  <div class="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
    <div class="flex items-start gap-3">
      <div class="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-red-500/20">
        <svg class="h-3.5 w-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-bold text-red-300">Payment failed</p>
        <p class="mt-0.5 text-[11px] leading-relaxed text-red-400/80">
          We couldn't charge your card. Stripe will retry automatically — update your payment method to avoid losing access.
        </p>
        <button
          type="button"
          class="mt-2.5 inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white transition-colors hover:bg-red-500 disabled:opacity-60"
          :disabled="loading"
          @click="handleFix"
        >
          {{ loading ? 'Opening…' : 'Update payment method' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { openBillingPortal } from '../lib/billing'

const emit = defineEmits<{ error: [message: string] }>()
const loading = ref(false)

async function handleFix(): Promise<void> {
  loading.value = true
  try {
    const result = await openBillingPortal()
    if (!result.ok) emit('error', result.error ?? 'Could not open billing portal.')
  } finally {
    loading.value = false
  }
}
</script>
