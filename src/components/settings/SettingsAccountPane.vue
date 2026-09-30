<script setup lang="ts">
import { useSettings } from '../../composables/useSettings'
import { useGameTheme } from '../../composables/useGameTheme'
import PaymentFailedAlert from '../../components/PaymentFailedAlert.vue'
import SettingsAccountLinks from './SettingsAccountLinks.vue'
import SettingsSection from './SettingsSection.vue'
import AccountUsagePanel from './AccountUsagePanel.vue'
import SettingsToggle from './SettingsToggle.vue'

const { theme } = useGameTheme()

const {
  accountCs2Hint,
  accountInitial,
  accountLinkFocus,
  accountRiotId,
  accountSteamLinked,
  accountSteamStatus,
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
  user,
} = useSettings()

</script>

<template>
  <div class="space-y-4">

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
      v-if="user"
      id="usage"
      title="Usage"
      hint="Included allowances, purchased credits and cloud capacity"
      :highlight-id="highlightSection"
    >
      <AccountUsagePanel @upgrade="openUpgrade" />

      <div class="flex items-center justify-between gap-4 border-t border-white/[0.06] pt-4">
        <div>
          <p class="text-sm text-gray-200">Help improve UpForge AI</p>
          <p class="mt-1 text-xs text-gray-500">
            Allow anonymised use of cloud-archived VODs for model training. Separate from saving to cloud. Off by default.
          </p>
        </div>
        <SettingsToggle label="Help improve UpForge AI" :on="!!settings.trainingConsent" @click="toggleTrainingConsent" />
      </div>

      <div class="flex items-center justify-between border-t border-white/[0.06] pt-4 text-[11px] text-gray-500">
        <span>Current plan</span>
        <span class="text-gray-300">{{ getTierBadgeLabel(user.tier) || 'Free' }}</span>
      </div>

    </SettingsSection>
    <SettingsAccountLinks :focus="accountLinkFocus" />
  </div>
</template>
