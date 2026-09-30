<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LibraryPageHeader from '../components/shared/LibraryPageHeader.vue'
import RecordingsView from './RecordingsView.vue'
import CoachingHistoryView from './CoachingHistoryView.vue'
const route = useRoute()
const router = useRouter()
function openFolder() { void window.api.storage.openFolder() }
const coaching = computed(() => route.query.view === 'coaching')
function select(view: 'recordings' | 'coaching') {
  // Selection belongs to its own view; do not carry stale analysis/recording IDs across tabs.
  void router.push({ path: '/recordings', query: { view } })
}
</script>
<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden text-white">
    <LibraryPageHeader title="Footage" description="Watch your matches, review moments and revisit coaching.">
      <button v-if="!coaching" class="px-3 py-1 text-xs text-gray-300 hover:text-white" @click="openFolder">Open folder</button>
      <button class="rounded-md border border-white/15 px-3 py-1 text-xs text-gray-300 hover:text-white" @click="router.push('/cloud-storage')">Manage storage</button>
    </LibraryPageHeader>
    <nav aria-label="Footage views" class="flex shrink-0 gap-5 border-b border-white/10 px-4">
      <button class="border-b-2 px-1 py-3 text-sm font-medium" :class="!coaching ? 'border-rose-500 text-white' : 'border-transparent text-gray-400 hover:text-white'" :aria-pressed="!coaching" @click="select('recordings')">Recordings</button>
      <button class="border-b-2 px-1 py-3 text-sm font-medium" :class="coaching ? 'border-rose-500 text-white' : 'border-transparent text-gray-400 hover:text-white'" :aria-pressed="coaching" @click="select('coaching')">Coaching reviews</button>
    </nav>
    <CoachingHistoryView v-if="coaching" embedded />
    <RecordingsView v-else embedded class="min-h-0 flex-1" />
  </div>
</template>
