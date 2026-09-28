<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useRoute } from 'vue-router'
import { provideVodReview } from '../composables/useVodReview'
import VodReviewCommandBar from '../components/vod-review/VodReviewCommandBar.vue'
import VodReviewStates from '../components/vod-review/VodReviewStates.vue'
import VodReviewBody from '../components/vod-review/VodReviewBody.vue'
import VodComparisonAccess from '../components/vod-review/VodComparisonAccess.vue'
import VodReviewComparison from '../components/vod-review/VodReviewComparison.vue'
import VodReviewShortcuts from '../components/vod-review/VodReviewShortcuts.vue'
import TrimRangeModal from '../components/shared/TrimRangeModal.vue'

const {
  comparisonActive,
  videoEl,
  videoSrc,
  updateVideoFrameSize,
  roundLogCollapsed,
  theaterMode,
  toggleTheaterMode,
  setSidePanelTab,
  timelineLoading,
  timelineError,
  trimModalOpen,
  trimStartSec,
  trimEndSec,
  trimLoading,
  trimError,
  trimHint,
  duration,
  confirmVodTrim,
} = provideVodReview()
const route = useRoute()
const savedComparisonId = computed(() => typeof route.query.comparisonId === 'string' && /^[0-9a-f-]{36}$/i.test(route.query.comparisonId) ? route.query.comparisonId : undefined)
let openedComparison: string | undefined
watch([timelineLoading, savedComparisonId], () => {
  if (!timelineLoading.value && !timelineError.value && savedComparisonId.value && openedComparison !== savedComparisonId.value) {
    openedComparison = savedComparisonId.value; openComparison()
  }
})
const accessOpen = ref(false)
const workspace = ref(false)
const roundsWidth = ref(20)
const detailsWidth = ref(32)
const layoutKey = 'upforge-review-workspace-v1'
try {
  const saved = JSON.parse(localStorage.getItem(layoutKey) || 'null')
  if (saved && saved.version === 1) {
    workspace.value = saved.enabled === true
    if (typeof saved.rounds === 'number' && Number.isFinite(saved.rounds)) roundsWidth.value = Math.max(16, Math.min(28, saved.rounds))
    if (typeof saved.details === 'number' && Number.isFinite(saved.details)) detailsWidth.value = Math.max(24, Math.min(40, saved.details))
  }
} catch { /* Invalid or unavailable preferences leave the default layout intact. */ }
watch([workspace, roundsWidth, detailsWidth], () => {
  try {
    localStorage.setItem(layoutKey, JSON.stringify({ version: 1, enabled: workspace.value, rounds: roundsWidth.value, details: detailsWidth.value }))
  } catch { /* Layout remains usable without storage. */ }
})
function openComparison() {
  videoEl.value?.pause()
  accessOpen.value = true
}
const activeComparisonId = ref<string>()
const trialComparison = ref(false)
function allowComparison(id?: string, trial = false) { activeComparisonId.value = id; trialComparison.value = trial; accessOpen.value = false; comparisonActive.value = true }
async function closeComparison() {
  comparisonActive.value = false
  await nextTick()
  updateVideoFrameSize()
}
function resetWorkspace() {
  roundsWidth.value = 20
  detailsWidth.value = 32
  roundLogCollapsed.value = false
  setSidePanelTab('notes')
  if (theaterMode.value) toggleTheaterMode()
}
</script>

<template>
  <div class="vod-review flex flex-col h-full text-white overflow-hidden">
    <VodReviewCommandBar v-show="!comparisonActive && !accessOpen" :can-compare="workspace && !!videoSrc && !timelineLoading && !timelineError" @compare="openComparison" :workspace="workspace" @toggle-workspace="workspace = !workspace" @reset-layout="resetWorkspace" />

    <VodReviewStates v-if="timelineLoading || timelineError" />

    <VodReviewBody v-else v-show="!comparisonActive && !accessOpen" :workspace="workspace" v-model:rounds-width="roundsWidth" v-model:details-width="detailsWidth" />

    <VodComparisonAccess v-if="accessOpen" :comparison-id="savedComparisonId" @allowed="allowComparison" @close="accessOpen = false" />
    <VodReviewComparison v-if="comparisonActive" :initial-comparison-id="activeComparisonId" :trial="trialComparison" @close="closeComparison" />

    <VodReviewShortcuts v-if="!comparisonActive && !accessOpen" />

    <TrimRangeModal
      :show="trimModalOpen"
      title="Trim VOD"
      confirm-label="Trim VOD"
      :duration="duration"
      :start-sec="trimStartSec"
      :end-sec="trimEndSec"
      :loading="trimLoading"
      :error="trimError"
      :hint="trimHint"
      @close="trimModalOpen = false"
      @confirm="confirmVodTrim"
      @update:start-sec="trimStartSec = $event"
      @update:end-sec="trimEndSec = $event"
    />
  </div>
</template>

<style scoped>
@import '../components/vod-review/vod-review.css';
.vod-review { container-type: inline-size; container-name: review-workspace; }
</style>
