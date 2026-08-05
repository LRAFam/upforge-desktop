<script setup lang="ts">
import { computed } from 'vue'
import { useSettings } from '../../composables/useSettings'
import { useGameTheme } from '../../composables/useGameTheme'
import { analysesUsedLabel, sharedAnalysesPoolHint } from '../../lib/quota-display'
import PaymentFailedAlert from '../../components/PaymentFailedAlert.vue'
import SettingsAccountLinks from './SettingsAccountLinks.vue'
import SettingsSection from './SettingsSection.vue'

const { theme } = useGameTheme()

const {
  accountCs2Hint,
  accountInitial,
  accountLinkFocus,
  accountRiotId,
  accountSteamLinked,
  accountSteamStatus,
  archiveUsagePercent,
  getSubscriptionIconUrl,
  getTierBadgeClass,
  getTierBadgeLabel,
  billingMessage,
  billingMessageError,
  billingPortalLoading,
  handleLogout,
  highlightSection,
  openBilling,
  openHelp,
  openSite,
  openUpgrade,
  paymentPastDue,
  settings,
  showBillingError,
  toggleTrainingConsent,
  usagePercent,
  user,
} = useSettings()

const analysesPoolHint = computed(() =>
  sharedAnalysesPoolHint(user.value?.analyses_used, user.value?.analyses_limit),
)

const analysesUsageLabel = computed(() => {
  const used = Math.max(0, user.value?.analyses_used ?? 0)
  const limit = user.value?.analyses_limit
  if (limit == null) return `${used} used · unlimited`
  return analysesUsedLabel(used, limit)
})
</script>

<template>
  <div class="space-y-4">
    <SettingsAccountLinks :focus="accountLinkFocus" />

    <SettingsSection
      title="Account"
      hint="Profile, plan, and linked game accounts"
    >
      <div v-if="paymentPastDue">
        <PaymentFailedAlert @error="showBillingError" />
      </div>

      <div
        v-if="user"
        class="rounded-2xl border border-white/[0.10] bg-gradient-to-br from-red-500/12 via-orange-500/6 to-transparent p-4"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex min-w-0 items-center gap-3">
            <div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#1a1a1a] text-sm font-bold text-red-400">
              {{ accountInitial }}
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="truncate text-sm font-semibold text-white">{{ user.name }}</p>
                <span
                  class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  :class="getTierBadgeClass(user.tier)"
                >
                  <img
                    v-if="getSubscriptionIconUrl(user.tier)"
                    :src="getSubscriptionIconUrl(user.tier)!"
                    :alt="getTierBadgeLabel(user.tier)"
                    class="h-4 w-4 object-contain"
                  >
                  {{ getTierBadgeLabel(user.tier) || 'Free' }}
                </span>
              </div>
              <p class="truncate text-xs text-gray-400">{{ user.email }}</p>
              <p class="mt-1 text-xs" :class="user.riot_name ? 'text-red-300/80' : 'text-gray-500 italic'">
                {{ accountRiotId }}
              </p>
              <p
                v-if="settings.primaryGame === 'deadlock'"
                class="mt-0.5 text-xs"
                :class="accountSteamLinked ? 'text-teal-300/80' : 'text-gray-500 italic'"
              >
                {{ accountSteamStatus }}
              </p>
              <p v-else-if="settings.primaryGame === 'cs2'" class="mt-0.5 text-xs text-gray-500 italic">
                {{ accountCs2Hint }}
              </p>
            </div>
          </div>
          <div class="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-gray-300">
            Desktop
          </div>
        </div>
        <div class="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white disabled:opacity-60"
            :disabled="billingPortalLoading"
            @click="openBilling"
          >
            {{ billingPortalLoading ? 'Opening…' : 'Manage billing' }}
          </button>
          <button
            type="button"
            class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white"
            @click="openSite"
          >
            Open dashboard
          </button>
          <button
            type="button"
            class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white"
            @click="openHelp"
          >
            Support
          </button>
          <button
            type="button"
            class="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition-colors hover:border-red-500/35 hover:bg-red-500/15"
            @click="handleLogout"
          >
            Sign out
          </button>
        </div>
      </div>
      <div v-else class="h-28 animate-pulse rounded-2xl border border-white/[0.09] bg-white/[0.02]" />

      <p v-if="billingMessage" class="text-xs" :class="billingMessageError ? 'text-red-400' : 'text-gray-400'">
        {{ billingMessage }}
      </p>
    </SettingsSection>

    <SettingsSection
      v-if="user && user.analyses_used !== undefined"
      id="usage"
      title="Usage"
      hint="Track monthly coaching sessions"
      :highlight-id="highlightSection"
    >
      <div class="rounded-2xl border border-white/[0.10] bg-black/20 p-4">
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-400">AI analyses</span>
          <span class="font-medium tabular-nums text-gray-200">
            {{ analysesUsageLabel }}
          </span>
        </div>
        <div v-if="user.analyses_limit" class="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            class="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-500 transition-all"
            :style="{ width: usagePercent + '%' }"
          />
        </div>
        <p class="mt-2 text-[11px] text-gray-600">Used when you run full-match AI coaching.</p>
        <p class="mt-1 text-[10px] text-gray-500">{{ analysesPoolHint }}</p>
      </div>

      <div v-if="user.archive_limit != null" class="rounded-2xl border border-white/[0.10] bg-black/20 p-4">
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-400">Cloud VODs saved</span>
          <span class="font-medium tabular-nums text-gray-200">
            {{ user.archive_count ?? 0 }} / {{ user.archive_limit }}
          </span>
        </div>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
            :style="{ width: archiveUsagePercent + '%' }"
          />
        </div>
        <p class="mt-2 text-[11px] text-gray-600">
          Save recordings without using analysis quota.
          <template v-if="user.tier === 'free' && user.archive_retention_days != null && user.archive_limit != null">
            Free keeps cloud VODs for {{ user.archive_retention_days }} days ({{ user.archive_limit }} max). Plus keeps them 90 days.
          </template>
          <span v-else-if="user.archive_retention_days"> Retained {{ user.archive_retention_days }} days on your plan.</span>
        </p>
      </div>

      <div class="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.10] bg-black/20 p-4">
        <div>
          <p class="text-sm text-gray-200">Help improve UpForge AI</p>
          <p class="mt-1 text-xs text-gray-500">
            Allow anonymised use of cloud-archived VODs for model training. Separate from saving to cloud — off by default.
          </p>
        </div>
        <button
          type="button"
          class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors"
          :class="settings.trainingConsent ? 'bg-red-500' : 'bg-white/20'"
          @click="toggleTrainingConsent"
        >
          <span
            class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
            :class="settings.trainingConsent ? 'translate-x-4' : 'translate-x-0.5'"
          />
        </button>
      </div>

      <div class="rounded-2xl border border-white/[0.10] bg-black/20 p-4">
        <div class="flex items-center justify-between text-[11px] text-gray-500">
          <span>Current plan</span>
          <span class="rounded-full bg-white/[0.04] px-2 py-0.5 text-gray-300">{{ getTierBadgeLabel(user.tier) || 'Free' }}</span>
        </div>
      </div>

      <div
        v-if="usagePercent >= 80 && user.analyses_limit"
        class="rounded-2xl border p-4"
        :class="[theme.accentBorder, theme.accentBg]"
      >
        <p class="text-xs font-medium" :class="theme.accentText">
          {{ usagePercent >= 100 ? 'You have used all analyses for this month.' : 'You are getting close to your monthly analysis limit.' }}
        </p>
        <p class="mt-1 text-xs" :class="theme.accentMuted">
          Upgrade for more analyses and full history access.
        </p>
        <button
          type="button"
          class="mt-3 w-full rounded-xl bg-red-500 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-400"
          @click="openUpgrade"
        >
          Upgrade plan
        </button>
      </div>
    </SettingsSection>
  </div>
</template>
