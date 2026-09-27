<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAccountUsage } from '../../composables/useAccountUsage'
const props = defineProps<{ kind: 'clips' | 'footage' }>()
const { usage, error, loading, load } = useAccountUsage()
const router = useRouter()
const capacity = computed(() => usage.value?.[props.kind])
const detailsOpen = ref(false)
const expiry = computed(() => props.kind === 'footage' ? usage.value?.footage.next_expiry_at : null)
const usageRoute = { path: '/settings', query: { tab: 'account', section: 'usage' } }
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
</script>
<template>
  <div class="cloud-usage-wrap">
    <div class="cloud-usage" :class="{ full: capacity?.remaining === 0 }">
      <p v-if="capacity"><strong>Cloud {{ kind }}</strong> · {{ capacity.limit === null ? `${capacity.used} saved · unlimited` : `${capacity.used} / ${capacity.limit} spaces used` }}<span v-if="capacity.remaining === 0"> · Full. Local files remain available.</span></p>
      <p v-else>{{ loading ? 'Checking cloud capacity…' : 'Cloud usage unavailable' }}</p>
      <button v-if="error" type="button" :disabled="loading" @click="load">Retry</button>
      <button v-if="capacity" type="button" :aria-expanded="detailsOpen" @click="detailsOpen = !detailsOpen">{{ detailsOpen ? 'Hide details' : 'Storage details' }}</button>
      <button type="button" @click="router.push(usageRoute)">{{ capacity?.remaining === 0 ? 'Manage capacity and plans' : 'Usage and plans' }}</button>
    </div>
    <div v-if="capacity && detailsOpen" class="storage-details">
      <p>Cloud spaces are occupied until items are removed. They do not reset each month. Local files do not use this allowance.</p>
      <template v-if="kind === 'footage' && usage">
        <p>{{ usage.footage.stored }} recordings saved · {{ usage.footage.reserved }} upload spaces reserved</p>
        <p v-if="usage.footage.retention_days !== null">Cloud recordings are kept for {{ usage.footage.retention_days }} days.</p>
      </template>
      <p v-if="capacity.remaining === 0">Remove cloud copies you no longer need, or review your plan for more capacity.</p>
    </div>
    <p v-if="expiry" class="expiry-notice">Next cloud recording expires {{ date(expiry) }}. <button type="button" @click="router.push(usageRoute)">Review storage</button></p>
  </div>
</template>
<style scoped>
.cloud-usage{display:flex;flex-wrap:wrap;align-items:center;gap:10px;flex-shrink:0;border-bottom:1px solid #ffffff14;padding:8px 16px;font-size:12px;color:#9ca3af}.cloud-usage p{flex:1}.cloud-usage strong{color:#d1d5db}.cloud-usage.full{color:#fbbf24}button{padding:6px 8px;min-height:32px;color:#e5e7eb;border:1px solid #ffffff24;border-radius:4px}button:focus-visible{outline:2px solid #f43f5e}
.cloud-usage-wrap{flex-shrink:0}.storage-details{padding:10px 16px;border-bottom:1px solid #ffffff14;font-size:12px;line-height:1.6;color:#aab2bf}.expiry-notice{padding:6px 16px;font-size:12px;color:#d1d5db;border-bottom:1px solid #ffffff14}.expiry-notice button{margin-left:8px}button:disabled{opacity:.5}
</style>
