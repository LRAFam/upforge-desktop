<script setup lang="ts">
import { computed } from 'vue'
import { useSettings } from '../../composables/useSettings'
import { useGameTheme } from '../../composables/useGameTheme'
import { analysesUsedLabel, sharedAnalysesPoolHint } from '../../lib/quota-display'
import PaymentFailedAlert from '../../components/PaymentFailedAlert.vue'
import SettingsAccountLinks from './SettingsAccountLinks.vue'
import SettingsSection from './SettingsSection.vue'
import SettingsToggle from './SettingsToggle.vue'

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
      title="Profile"
      hint="Plan, billing, and sign-in"
    >
      <div v-if="paymentPastDue">
        <PaymentFailedAlert @error="showBillingError" />
      </div>

      <div v-if="user" class="space-y-4">
        <div class="flex min-w-0 items-center gap-3">
          <div
            class="flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.08] bg-[#1a1a1a] text-sm font-bold"
            :class="theme.accentText"
          >
            {{ accountInitial }}
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="truncate text-sm font-semibold text-white">{{ user.name }}</p>
              <span
                class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold"
                :class="getTierBadgeClass(user.tier)"
              >
                <img
                  v-if="getSubscriptionIconUrl(user.tier)"
                  :src="getSubscriptionIconUrl(user.tier)!"
                  :alt="getTierBadgeLabel(user.tier)"
                  class="h-3.5 w-3.5 object-contain"
                >
                {{ getTierBadgeLabel(user.tier) || 'Free' }}
              </span>
            </div>
            <p class="truncate text-xs text-gray-400">{{ user.email }}</p>
            <p class="mt-1 text-xs" :class="user.riot_name ? theme.accentMuted : 'text-gray-500 italic'">
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

        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="btn-secondary"
            :disabled="billingPortalLoading"
            @click="openBilling"
          >
            {{ billingPortalLoading ? 'Opening…' : 'Manage billing' }}
          </button>
          <button
            type="button"
            class="btn-secondary"
            @click="openSite"
          >
            Open dashboard
          </button>
          <button
            type="button"
            class="btn-secondary"
            @click="openHelp"
          >
            Support
          </button>
          <button
            type="button"
            class="btn-danger"
            @click="handleLogout"
          >
            Sign out
          </button>
        </div>
      </div>
      <div v-else class="h-24 animate-pulse rounded-lg border border-white/[0.08] bg-white/[0.02]" />

      <p v-if="billingMessage" class="text-xs" :class="billingMessageError ? 'text-red-400' : 'text-gray-400'">
        {{ billingMessage }}
      </p>
    </SettingsSection>

    <SettingsSection
      v-if="user && user.analyses_used !== undefined"
      id="usage"
      title="Usage"
      hint="Monthly coaching sessions and cloud VOD storage"
      :highlight-id="highlightSection"
    >
      <div class="space-y-1">
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-400">AI analyses</span>
          <span class="font-medium tabular-nums text-gray-200">{{ analysesUsageLabel }}</span>
        </div>
        <div v-if="user.analyses_limit" class="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            class="h-full rounded-full transition-all"
            :style="{ width: usagePercent + '%', backgroundColor: 'var(--game-accent, #ef4444)' }"
          />
        </div>
        <p class="text-[11px] text-gray-600">Used when you run full-match AI coaching.</p>
        <p class="text-[10px] text-gray-500">{{ analysesPoolHint }}</p>
      </div>

      <div v-if="user.archive_limit != null" class="space-y-1 border-t border-white/[0.06] pt-4">
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-400">Cloud VODs saved</span>
          <span class="font-medium tabular-nums text-gray-200">
            {{ user.archive_count ?? 0 }} / {{ user.archive_limit }}
          </span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            class="h-full rounded-full bg-emerald-500 transition-all"
            :style="{ width: archiveUsagePercent + '%' }"
          />
        </div>
        <p class="text-[11px] text-gray-600">
          Save recordings without using analysis quota.
          <template v-if="user.tier === 'free' && user.archive_retention_days != null && user.archive_limit != null">
            Free keeps cloud VODs for {{ user.archive_retention_days }} days ({{ user.archive_limit }} max). Plus keeps them 90 days.
          </template>
          <span v-else-if="user.archive_retention_days"> Retained {{ user.archive_retention_days }} days on your plan.</span>
        </p>
      </div>

      <div class="flex items-center justify-between gap-4 border-t border-white/[0.06] pt-4">
        <div>
          <p class="text-sm text-gray-200">Help improve UpForge AI</p>
          <p class="mt-1 text-xs text-gray-500">
            Allow anonymised use of cloud-archived VODs for model training. Separate from saving to cloud. Off by default.
          </p>
        </div>
        <SettingsToggle :on="!!settings.trainingConsent" @click="toggleTrainingConsent" />
      </div>

      <div class="flex items-center justify-between border-t border-white/[0.06] pt-4 text-[11px] text-gray-500">
        <span>Current plan</span>
        <span class="text-gray-300">{{ getTierBadgeLabel(user.tier) || 'Free' }}</span>
      </div>

      <div
        v-if="usagePercent >= 80 && user.analyses_limit"
        class="rounded-lg border p-3"
        :class="[theme.accentBorder, theme.accentBg]"
      >
        <p class="text-xs font-medium" :class="theme.accentText">
          {{ usagePercent >= 100 ? 'You have used all analyses for this month.' : 'You are getting close to your monthly analysis limit.' }}
        </p>
        <p class="mt-1 text-xs" :class="theme.accentMuted">
          Upgrade for more analyses and full history access.
        </p>
        <div class="mt-3 flex justify-end">
          <button
            type="button"
            class="btn-primary"
            @click="openUpgrade"
          >
            Upgrade plan
          </button>
        </div>
      </div>
    </SettingsSection>
  </div>
</template>
