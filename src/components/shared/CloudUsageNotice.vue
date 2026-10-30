<script setup lang="ts">
import { cloudBytes } from '../../lib/cloud-storage'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAccountUsage } from '../../composables/useAccountUsage'
import { uiV3 } from '../../lib/ui-v3'
const props = defineProps<{ kind: 'clips' | 'footage' }>()
const { usage, error, loading, load } = useAccountUsage()
const router = useRouter()
const capacity = computed(() => usage.value?.[props.kind])
const detailsOpen = ref(false)
const expiry = computed(() => props.kind === 'footage' ? usage.value?.footage.next_expiry_at : null)
const usageRoute = { path: '/cloud-storage' }
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const full = computed(() => usage.value?.cloud_storage?.remaining_bytes === 0)
</script>
<template>
  <div v-if="uiV3" class="uf-banner" role="status">
    <span class="uf-banner-dot" :class="{ 'is-gold': full || error }" aria-hidden="true" />
    <p class="uf-banner-text" style="margin: 0">
      <span v-if="error" class="uf-banner-main">{{ error }}</span>
      <span v-else-if="usage?.cloud_storage"><strong class="uf-num">{{ cloudBytes(usage.cloud_storage.used_bytes) }}</strong> used<span v-if="usage.cloud_storage.capacity_bytes !== null"> of <span class="uf-num">{{ cloudBytes(usage.cloud_storage.capacity_bytes) }}</span></span> · shared cloud storage<span v-if="full"> · full</span></span>
      <span v-else>{{ loading ? 'Loading cloud storage…' : 'Cloud storage allowance loading' }}</span>
    </p>
    <div class="uf-banner-actions">
      <button v-if="error" type="button" class="uf-banner-link" @click="load">Retry</button>
      <button type="button" class="uf-banner-link" @click="router.push(usageRoute)">{{ full ? 'Add or manage storage' : 'Cloud storage' }}</button>
    </div>
  </div>
<template v-else>
  <div class="cloud-usage-wrap">
    <div class="cloud-usage" :class="{ full: usage?.cloud_storage?.remaining_bytes === 0 }">
      <p v-if="error">{{ error }} <button @click="load">Retry</button></p>
      <p v-else-if="usage?.cloud_storage"><strong>{{ cloudBytes(usage.cloud_storage.used_bytes) }}</strong> used<span v-if="usage.cloud_storage.capacity_bytes !== null"> of {{ cloudBytes(usage.cloud_storage.capacity_bytes) }}</span> · shared cloud storage</p>
      <p v-else>Cloud storage allowance loading</p>
      <button type="button" @click="router.push(usageRoute)">{{ usage?.cloud_storage?.remaining_bytes === 0 ? 'Add or manage storage' : 'Cloud storage' }}</button>
    </div>
  </div>
</template>
</template>

<style scoped>
.cloud-usage{display:flex;flex-wrap:wrap;align-items:center;gap:10px;flex-shrink:0;border-bottom:1px solid #ffffff14;padding:8px 16px;font-size:12px;color:#9ca3af}.cloud-usage p{flex:1}.cloud-usage strong{color:#d1d5db}.cloud-usage.full{color:#fbbf24}button{padding:6px 8px;min-height:32px;color:#e5e7eb;border:1px solid #ffffff24;border-radius:4px}button:focus-visible{outline:2px solid #f43f5e}
.cloud-usage-wrap{flex-shrink:0}.storage-details{padding:10px 16px;border-bottom:1px solid #ffffff14;font-size:12px;line-height:1.6;color:#aab2bf}.expiry-notice{padding:6px 16px;font-size:12px;color:#d1d5db;border-bottom:1px solid #ffffff14}.expiry-notice button{margin-left:8px}button:disabled{opacity:.5}
</style>
