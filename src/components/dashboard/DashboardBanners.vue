<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '../../composables/useDashboard'
import { scoreGrade, scoreGradeBadgeClass } from '../../lib/analysis-scoring'
import { isPaidTier } from '../../lib/web-explore-links'

const {
  paymentPastDue,
  billingPortalLoading,
  openBillingPortal,
  warning,
  warningAction,
  upgradeNeeded,
  goWarningAction,
  openPpa,
  openUpgrade,
  openBundles,
  analysisCompleteToast,
  analysisFailure,
  activityToast,
  backgroundWorkBanner,
  quotaLowWarning,
  archiveRetentionNudge,
  dismissArchiveRetentionNudge,
  openAnalysis,
  showMacPreviewBanner,
  dismissMacPreviewBanner,
  profile,
} = useDashboard()

const userIsPaid = computed(() => isPaidTier(profile.value?.user?.tier))

function dismissBackgroundBanner() {
  backgroundWorkBanner.value = false
}

function dismissWarning() {
  warning.value = null
  warningAction.value = null
  upgradeNeeded.value = false
  analysisFailure.value = null
}
</script>

<template>
  <div class="flex-shrink-0 flex flex-col items-center gap-2 px-4 pt-3 pointer-events-none">
    <Transition name="banner-slide">
      <div
        v-if="backgroundWorkBanner"
        class="banner-chip pointer-events-auto flex items-center gap-2.5 border-blue-500/20 bg-blue-500/[0.07]"
      >
        <div class="w-4 h-4 rounded-full bg-blue-500/15 flex items-center justify-center flex-shrink-0">
          <svg class="w-2.5 h-2.5 text-blue-400 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>
        </div>
        <span class="text-xs text-blue-300/90">Upload continues in the background — track progress in Recent Analyses below.</span>
        <button class="w-5 h-5 flex items-center justify-center text-blue-500/50 hover:text-blue-300 transition-colors rounded flex-shrink-0" @click="dismissBackgroundBanner">
          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
      </div>
    </Transition>

    <Transition name="banner-slide">
      <div
        v-if="activityToast"
        class="banner-chip pointer-events-auto flex items-center gap-2.5 border-white/[0.10] bg-white/[0.03]"
      >
        <div class="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
        <span class="text-xs text-gray-300">{{ activityToast }}</span>
        <button class="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-gray-400 transition-colors rounded flex-shrink-0" @click="activityToast = null">
          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
      </div>
    </Transition>

    <Transition name="banner-slide">
      <div
        v-if="quotaLowWarning && !warning"
        class="banner-chip pointer-events-auto flex items-center gap-2.5 border-orange-500/20 bg-orange-500/[0.07]"
      >
        <span class="text-xs text-orange-300/90">{{ quotaLowWarning }}</span>
        <button class="flex-shrink-0 text-xs font-semibold text-orange-300 hover:text-orange-100 border border-orange-500/30 rounded-lg px-2 py-1" @click="userIsPaid ? openBundles() : openPpa()">{{ userIsPaid ? 'Buy extras' : 'Buy one' }}</button>
        <button v-if="!userIsPaid" class="flex-shrink-0 text-xs font-semibold text-orange-300 hover:text-orange-100 border border-orange-500/30 rounded-lg px-2 py-1" @click="openUpgrade">Upgrade</button>
      </div>
    </Transition>

    <Transition name="banner-slide">
      <div
        v-if="archiveRetentionNudge && !warning && !quotaLowWarning"
        class="banner-chip pointer-events-auto flex items-center gap-2.5 border-emerald-500/20 bg-emerald-500/[0.07]"
      >
        <span class="text-xs text-emerald-300/90">{{ archiveRetentionNudge }}</span>
        <button class="flex-shrink-0 text-xs font-semibold text-emerald-300 hover:text-emerald-100 border border-emerald-500/30 rounded-lg px-2 py-1" @click="openUpgrade">Upgrade</button>
        <button class="w-5 h-5 flex items-center justify-center text-emerald-500/50 hover:text-emerald-300 transition-colors rounded flex-shrink-0" @click="dismissArchiveRetentionNudge">
          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
      </div>
    </Transition>

    <Transition name="banner-slide">
      <div
        v-if="paymentPastDue"
        class="banner-chip pointer-events-auto relative flex items-center gap-2.5 pl-3.5 pr-2.5 border-red-500/25 bg-red-500/[0.08]"
      >
        <div class="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-red-400 to-red-600 rounded-l-xl" />
        <div class="w-4 h-4 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
          <svg class="w-2.5 h-2.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
        </div>
        <span class="text-xs text-red-300/90 leading-snug">
          Your last payment failed — update your card to keep your subscription active.
        </span>
        <button
          class="flex-shrink-0 text-xs font-semibold text-red-200 hover:text-white transition-colors border border-red-500/30 rounded-lg px-2 py-1 disabled:opacity-60"
          :disabled="billingPortalLoading"
          @click="openBillingPortal"
        >
          {{ billingPortalLoading ? 'Opening…' : 'Fix payment' }}
        </button>
      </div>
    </Transition>

    <Transition name="banner-slide">
      <div
        v-if="warning"
        class="banner-chip pointer-events-auto relative flex items-start gap-2.5 pl-3.5 pr-2.5"
        :class="analysisFailure?.creditRefunded
          ? 'border-amber-500/20 bg-amber-500/[0.07]'
          : 'border-orange-500/20 bg-orange-500/[0.07]'"
      >
        <div
          class="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
          :class="analysisFailure?.creditRefunded
            ? 'bg-gradient-to-b from-amber-400 to-amber-600'
            : 'bg-gradient-to-b from-orange-400 to-orange-600'"
        />
        <div
          class="w-4 h-4 mt-0.5 rounded-full flex items-center justify-center flex-shrink-0"
          :class="analysisFailure?.creditRefunded ? 'bg-amber-500/15' : 'bg-orange-500/15'"
        >
          <svg
            class="w-2.5 h-2.5"
            :class="analysisFailure?.creditRefunded ? 'text-amber-400' : 'text-orange-400'"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
        </div>
        <div class="min-w-0 flex-1">
          <p v-if="analysisFailure?.title" class="text-[11px] font-semibold text-amber-200/90 mb-0.5">{{ analysisFailure.title }}</p>
          <p class="text-xs leading-snug" :class="analysisFailure?.creditRefunded ? 'text-amber-300/90' : 'text-orange-300/90'">{{ warning }}</p>
          <p v-if="analysisFailure?.hint" class="text-[10px] text-gray-500 mt-1 leading-snug">{{ analysisFailure.hint }}</p>
          <p v-if="analysisFailure?.creditRefunded" class="text-[10px] font-semibold text-emerald-400/90 mt-1">Coaching credit refunded — try Analyse again when ready.</p>
        </div>
        <button v-if="warningAction" class="flex-shrink-0 text-xs font-semibold text-orange-300 hover:text-orange-100 transition-colors border border-orange-500/30 rounded-lg px-2 py-1" @click="goWarningAction">{{ warningAction.label }}</button>
        <button v-if="upgradeNeeded" class="flex-shrink-0 text-xs font-semibold text-orange-300 hover:text-orange-100 transition-colors border border-orange-500/30 rounded-lg px-2 py-1" @click="userIsPaid ? openBundles() : openPpa()">{{ userIsPaid ? 'Buy extras' : 'Buy one' }}</button>
        <button v-if="upgradeNeeded && !userIsPaid" class="flex-shrink-0 text-xs font-semibold text-orange-300 hover:text-orange-100 transition-colors border border-orange-500/30 rounded-lg px-2 py-1" @click="openUpgrade">Upgrade</button>
        <button class="w-5 h-5 flex items-center justify-center text-orange-500/50 hover:text-orange-300/70 transition-colors rounded flex-shrink-0" :class="{ 'ml-auto': !upgradeNeeded && !warningAction }" @click="dismissWarning">
          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
      </div>
    </Transition>

    <Transition name="banner-slide">
      <div
        v-if="analysisCompleteToast"
        class="banner-chip pointer-events-auto flex items-center gap-2.5 border-green-500/25 bg-green-500/[0.08]"
      >
        <div class="w-4 h-4 rounded-full bg-green-500/15 flex items-center justify-center flex-shrink-0">
          <svg class="w-2.5 h-2.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <span class="text-xs text-green-300/90">
          Analysis complete — scored
          <span class="font-bold">{{ analysisCompleteToast.score * 10 }}</span>
          <span class="font-bold px-1.5 py-px rounded-full text-[10px] ml-1" :class="scoreGradeBadgeClass(analysisCompleteToast.score)">{{ scoreGrade(analysisCompleteToast.score) }}</span>
          <span v-if="analysisCompleteToast.agent"> · {{ analysisCompleteToast.agent }}</span>
          <span v-if="analysisCompleteToast.remaining != null && analysisCompleteToast.limit != null" class="text-green-400/70">
            · {{ analysisCompleteToast.remaining }} left
          </span>
        </span>
        <button
          v-if="analysisCompleteToast.analysisId"
          class="flex-shrink-0 text-xs font-semibold text-green-300 hover:text-green-100 border border-green-500/30 rounded-lg px-2 py-1"
          @click="openAnalysis(analysisCompleteToast.analysisId!)"
        >View results</button>
        <button class="w-5 h-5 flex items-center justify-center text-green-600/50 hover:text-green-400 transition-colors rounded flex-shrink-0" @click="analysisCompleteToast = null">
          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
      </div>
    </Transition>

    <Transition name="banner-slide">
      <div
        v-if="showMacPreviewBanner"
        class="banner-chip pointer-events-auto flex items-center gap-2.5 border-blue-500/25 bg-blue-500/[0.07] max-w-xl"
      >
        <div class="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
          <svg class="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div class="min-w-0">
          <p class="text-xs font-semibold text-blue-200">macOS preview mode</p>
          <p class="text-[11px] text-blue-300/70 mt-0.5">Match recording and game detection require Windows. You can still review analyses, clips, and training on Mac.</p>
        </div>
        <button class="flex-shrink-0 text-[11px] font-medium text-blue-300/80 hover:text-blue-200 transition-colors px-2 py-1 rounded-lg hover:bg-blue-500/10" @click="dismissMacPreviewBanner">Dismiss</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.banner-chip {
  width: fit-content;
  max-width: min(100%, 42rem);
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  border-width: 1px;
}

.banner-slide-enter-active {
  transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.banner-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.banner-slide-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
.banner-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
