<script setup lang="ts">
import { useSettings } from '../../composables/useSettings'
import { useGameTheme } from '../../composables/useGameTheme'
import PaymentFailedAlert from '../../components/PaymentFailedAlert.vue'
import SettingsAccountLinks from './SettingsAccountLinks.vue'
import SettingsDiscordLink from './SettingsDiscordLink.vue'
import SettingsSection from './SettingsSection.vue'
import SettingsRow from './SettingsRow.vue'
import AccountUsagePanel from './AccountUsagePanel.vue'
import SettingsToggle from './SettingsToggle.vue'
import SettingsDeleteAccount from './SettingsDeleteAccount.vue'
import { uiV3 } from '../../lib/ui-v3'
import { computed, onMounted, ref } from 'vue'
import { playerIdentity } from '../../lib/player-identity'
import PlayerAvatar from '../v3/identity/PlayerAvatar.vue'
import PlayerBanner from '../v3/identity/PlayerBanner.vue'
import RankIcon from '../v3/identity/RankIcon.vue'
import type { ProfileData } from '../../env.d.ts'
import { readCache, writeCache } from '../../lib/stale-cache'
import { openWebFeature } from '../../lib/web-explore-links'

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
  toggleAiTraining,
  aiTrainingOn,
  aiTrainingBusy,
  aiTrainingError,
  aiTrainingLoaded,
  openPrivacyAiTraining,
  user,
} = useSettings()


// Squad is a paid team plan; non-members only learn about it here (no Squad item in their sidebar).
// Same cache key as SidebarV3 so both agree; a failed lookup keeps the last known answer.
const squadMember = ref<boolean | null>(readCache<boolean>('sidebar:squad-member')?.value ?? null)
onMounted(async () => {
  if (!uiV3.value) return
  const res = await window.api?.squad?.getTeam().catch(() => undefined)
  if (res !== undefined) { squadMember.value = !!res?.team; writeCache('sidebar:squad-member', squadMember.value) }
})
function openSquadPlan() { void openWebFeature('/team') }

// Your Valorant identity (player card avatar + wide banner, rank, account level) from the profile
// Home already cached, refreshed once read-only here. Other games: the letter, no banner.
const profileStats = ref(readCache<ProfileData | null>('home:profile')?.value?.latest_stats ?? null)
onMounted(async () => {
  if (!uiV3.value) return
  const p = await window.api?.profile?.get().catch(() => null) as ProfileData | null | undefined
  if (p?.latest_stats) profileStats.value = p.latest_stats
})
const identity = computed(() => {
  const s = settings.primaryGame === 'valorant' || !settings.primaryGame ? profileStats.value : null
  return playerIdentity({
    name: user.value?.name, playerCardId: s?.player_card_id, agent: s?.most_played_agent,
    rank: s?.current_rank, level: s?.account_level,
  })
})
</script>

<template>
  <div class="space-y-4">

    <SettingsSection
      title="Profile"
      :hint="uiV3 ? undefined : 'Plan, billing, and sign-in'"
    >
      <div v-if="paymentPastDue">
        <PaymentFailedAlert @error="showBillingError" />
      </div>

      <div v-if="user && uiV3" class="uf-profile">
        <PlayerBanner :src="identity.banner">
        <div class="uf-profile-id">
          <PlayerAvatar :identity="identity" :size="72" />
          <div class="uf-set-row-text">
            <p class="uf-t3">{{ user.name }} <span class="uf-profile-plan" :class="{ 'is-pro': /pro/i.test(getTierBadgeLabel(user.tier) || '') }">{{ getTierBadgeLabel(user.tier) || 'Free' }}</span></p>
            <p v-if="identity.rankLabel || identity.level || identity.title" class="uf-t4 uf-profile-rank">
              <RankIcon :src="identity.rankIcon" :label="identity.rankLabel" :size="20" />
              <span>{{ [identity.rankLabel, identity.title, identity.level ? `Level ${identity.level}` : null].filter(Boolean).join(' · ') }}</span>
            </p>
            <p class="uf-t4">{{ user.email }}</p>
            <p class="uf-t4" :class="{ 'uf-profile-linked': user.riot_name }">{{ accountRiotId }}</p>
            <p v-if="settings.primaryGame === 'deadlock'" class="uf-t4" :class="{ 'uf-profile-linked': accountSteamLinked }">{{ accountSteamStatus }}</p>
            <p v-else-if="settings.primaryGame === 'cs2'" class="uf-t4">{{ accountCs2Hint }}</p>
          </div>
        </div>
        </PlayerBanner>
        <div class="uf-set-actions">
          <button type="button" class="uf-btn-secondary uf-set-btn" :disabled="billingPortalLoading" @click="openBilling">{{ billingPortalLoading ? 'Opening…' : 'Manage billing' }}</button>
          <button type="button" class="uf-btn-secondary uf-set-btn" @click="openSite">Open dashboard</button>
          <button type="button" class="uf-btn-secondary uf-set-btn" @click="openHelp">Support</button>
          <button type="button" class="uf-link uf-profile-signout" @click="handleLogout">Sign out</button>
        </div>
      </div>
      <div v-else-if="user" class="space-y-4">
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
      <div v-else-if="uiV3" class="uf-profile-skeleton" aria-label="Loading account" />
      <div v-else class="h-24 animate-pulse rounded-lg border border-white/[0.08] bg-white/[0.02]" />

      <p v-if="billingMessage && uiV3" class="uf-note" :class="billingMessageError ? 'is-bad' : ''">{{ billingMessage }}</p>
      <p v-else-if="billingMessage" class="text-xs" :class="billingMessageError ? 'text-red-400' : 'text-gray-400'">
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

      <!-- v3: the AI-training toggle lives in App › Privacy & data. Same account setting. -->
      <div v-if="!uiV3" class="flex items-center justify-between gap-4 border-t border-white/[0.06] pt-4">
        <div>
          <p class="text-sm text-gray-200">Use my gameplay to improve UpForge's AI</p>
          <p class="mt-1 text-xs text-gray-500">
            On by default. We use your recordings and match data to make UpForge's coaching more accurate. Audio is never used. Switch it off any time and your gameplay is left out of future training.
          </p>
          <p v-if="aiTrainingLoaded && aiTrainingOn === null" class="mt-1 text-xs text-gray-500">Sign in and go online to change this setting.</p>
          <p v-if="aiTrainingError" class="mt-1 text-xs text-red-400" role="alert">{{ aiTrainingError }}</p>
          <button type="button" class="mt-1 text-xs text-orange-400 hover:underline" @click="openPrivacyAiTraining">How we use gameplay →</button>
        </div>
        <SettingsToggle
          label="Use my gameplay to improve UpForge's AI"
          :on="aiTrainingOn === true"
          :disabled="aiTrainingOn === null || aiTrainingBusy"
          @click="toggleAiTraining"
        />
      </div>

      <SettingsRow
        v-if="uiV3 && squadMember === false"
        label="Play as a squad"
        hint="Shared reviews and credits for 4–6 players, on one paid team plan."
      >
        <button type="button" class="uf-link" @click="openSquadPlan">See squad plans →</button>
      </SettingsRow>

      <div v-if="!uiV3" class="flex items-center justify-between border-t border-white/[0.06] pt-4 text-[11px] text-gray-500">
        <span>Current plan</span>
        <span class="text-gray-300">{{ getTierBadgeLabel(user.tier) || 'Free' }}</span>
      </div>

    </SettingsSection>
    <SettingsAccountLinks :focus="accountLinkFocus" />
    <!-- Discord DMs for pre-game briefs and debriefs (the briefs skip message links here). -->
    <SettingsDiscordLink v-if="uiV3 && user" />
    <!-- Download my data + self-serve deletion (grace period on the server; see account-deletion.ts). -->
    <SettingsDeleteAccount v-if="user" :email="user.email" />
  </div>
</template>
