<script setup lang="ts">
import { useSettings } from '../../composables/useSettings'
import PaymentFailedAlert from '../../components/PaymentFailedAlert.vue'

const {
  PRIMARY_GAMES,
  accountCs2Hint,
  accountInitial,
  accountRiotId,
  accountSteamLinked,
  accountSteamStatus,
  archiveUsagePercent,
  billingMessage,
  billingMessageError,
  billingPortalLoading,
  handleLogout,
  openBilling,
  openHelp,
  openSite,
  openUpgrade,
  paymentPastDue,
  sectionOpen,
  selectPrimaryGame,
  settings,
  showBillingError,
  toggleKey,
  toggleLaunchOnStartup,
  toggleSection,
  toggleTrainingConsent,
  toggles,
  usagePercent,
  user,
} = useSettings()
</script>

<template>
<section class="space-y-4">
<div class="panel-elevated overflow-hidden p-4">
          <p class="text-sm font-semibold text-white">Your game</p>
          <p class="mt-1 text-xs text-gray-500">Switches dashboard, settings, and web links — same as upforge.gg.</p>
          <div class="mt-3 grid grid-cols-3 gap-2">
            <button
              v-for="game in PRIMARY_GAMES"
              :key="game.id"
              type="button"
              class="rounded-xl border px-3 py-2.5 text-left transition-all"
              :class="settings.primaryGame === game.id
                ? 'border-white/[0.20] bg-white/[0.08]'
                : 'border-white/[0.10] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]'"
              @click="selectPrimaryGame(game.id)"
            >
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full flex-shrink-0" :style="{ backgroundColor: game.accent }" />
                <span class="text-xs font-semibold text-gray-200">{{ game.label }}</span>
              </div>
            </button>
          </div>
        </div>

        <div class="panel-elevated overflow-hidden">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('account')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15.75 6.75a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.118a7.5 7.5 0 0115 0A17.933 17.933 0 0112 21.75a17.933 17.933 0 01-7.5-1.632z" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">Account</p>
                <p class="text-xs text-gray-500">Profile, plan, and linked game accounts</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.account ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.account" class="border-t border-white/[0.09] p-4">
            <div v-if="paymentPastDue" class="mb-4">
              <PaymentFailedAlert @error="showBillingError" />
            </div>
            <div v-if="user" class="rounded-2xl border border-white/[0.10] bg-gradient-to-br from-red-500/12 via-orange-500/6 to-transparent p-4">
              <div class="flex items-start justify-between gap-4">
                <div class="flex min-w-0 items-center gap-3">
                  <div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#1a1a1a] text-sm font-bold text-red-400">{{ accountInitial }}</div>
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="truncate text-sm font-semibold text-white">{{ user.name }}</p>
                      <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="getTierBadgeClass(user.tier)">
                        <img v-if="getSubscriptionIconUrl(user.tier)" :src="getSubscriptionIconUrl(user.tier)!" :alt="getTierBadgeLabel(user.tier)" class="w-4 h-4 object-contain" />
                        {{ getTierBadgeLabel(user.tier) || 'Free' }}
                      </span>
                    </div>
                    <p class="truncate text-xs text-gray-400">{{ user.email }}</p>
                    <p class="mt-1 text-xs" :class="user.riot_name ? 'text-red-300/80' : 'text-gray-500 italic'">{{ accountRiotId }}</p>
                    <p v-if="settings.primaryGame === 'deadlock'" class="mt-0.5 text-xs" :class="accountSteamLinked ? 'text-teal-300/80' : 'text-gray-500 italic'">{{ accountSteamStatus }}</p>
                    <p v-else-if="settings.primaryGame === 'cs2'" class="mt-0.5 text-xs text-gray-500 italic">{{ accountCs2Hint }}</p>
                  </div>
                </div>
                <div class="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-gray-300">Desktop</div>
              </div>
              <div class="mt-4 grid grid-cols-2 gap-2">
                <button class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white disabled:opacity-60" :disabled="billingPortalLoading" @click="openBilling">{{ billingPortalLoading ? 'Opening…' : 'Manage billing' }}</button>
                <button class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white" @click="openSite">Open dashboard</button>
                <button class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-white/[0.14] hover:text-white" @click="openHelp">Support</button>
                <button class="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition-colors hover:border-red-500/35 hover:bg-red-500/15" @click="handleLogout">Sign out</button>
              </div>
            </div>
            <div v-else class="h-28 animate-pulse rounded-2xl border border-white/[0.09] bg-white/[0.02]" />
            <p v-if="billingMessage" class="mt-3 text-xs" :class="billingMessageError ? 'text-red-400' : 'text-gray-400'">{{ billingMessage }}</p>

            <div class="mt-4 rounded-2xl border border-white/[0.10] bg-black/20 p-4">
              <p class="text-[10px] font-bold uppercase tracking-widest text-gray-600">Badge &amp; rank icons</p>
              <p class="mt-1 text-[11px] text-gray-500">Preview of imported artwork (more ranks coming soon).</p>
              <div class="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-3">
                <div
                  v-for="item in BADGE_PREVIEW_ITEMS"
                  :key="item.slug"
                  class="flex flex-col items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
                >
                  <img :src="getBadgeIconUrl(item.slug)!" :alt="item.label" class="w-16 h-16 object-contain" />
                  <span class="text-[9px] text-gray-500 text-center leading-tight">{{ item.label }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="user && user.analyses_used !== undefined" class="panel-elevated overflow-hidden">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('usage')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3.75 3v18m0 0h18M7.5 14.25l3-3 2.25 2.25 4.5-6" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">Usage</p>
                <p class="text-xs text-gray-500">Track monthly coaching sessions</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.usage ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.usage" class="border-t border-white/[0.09] p-4 space-y-3">
            <div class="rounded-2xl border border-white/[0.10] bg-black/20 p-4">
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-400">AI analyses</span>
                <span class="font-medium tabular-nums text-gray-200">
                  {{ Math.max(0, user.analyses_used ?? 0) }} / {{ user.analyses_limit == null ? '∞' : user.analyses_limit }}
                </span>
              </div>
              <div v-if="user.analyses_limit" class="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div class="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-500 transition-all" :style="{ width: usagePercent + '%' }" />
              </div>
              <p class="mt-2 text-[11px] text-gray-600">Used when you run full-match AI coaching.</p>
            </div>
            <div v-if="user.archive_limit != null" class="rounded-2xl border border-white/[0.10] bg-black/20 p-4">
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-400">Cloud VODs saved</span>
                <span class="font-medium tabular-nums text-gray-200">
                  {{ user.archive_count ?? 0 }} / {{ user.archive_limit }}
                </span>
              </div>
              <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all" :style="{ width: archiveUsagePercent + '%' }" />
              </div>
              <p class="mt-2 text-[11px] text-gray-600">
                Save recordings without using analysis quota.
                <span v-if="user.archive_retention_days"> Retained {{ user.archive_retention_days }} days on your plan.</span>
              </p>
            </div>
            <div class="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.10] bg-black/20 p-4">
              <div>
                <p class="text-sm text-gray-200">Help improve UpForge AI</p>
                <p class="mt-1 text-xs text-gray-500">Allow anonymised use of cloud-archived VODs for model training. Separate from saving to cloud — off by default.</p>
              </div>
              <button
                class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors"
                :class="settings.trainingConsent ? 'bg-red-500' : 'bg-white/20'"
                @click="toggleTrainingConsent"
              >
                <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform" :class="settings.trainingConsent ? 'translate-x-4' : 'translate-x-0.5'" />
              </button>
            </div>
            <div class="rounded-2xl border border-white/[0.10] bg-black/20 p-4">
              <div class="flex items-center justify-between text-[11px] text-gray-500">
                <span>Current plan</span>
                <span class="rounded-full bg-white/[0.04] px-2 py-0.5 text-gray-300">{{ getTierBadgeLabel(user.tier) || 'Free' }}</span>
              </div>
            </div>
            <div v-if="usagePercent >= 80 && user.analyses_limit" class="rounded-2xl border border-purple-500/20 bg-purple-500/10 p-4">
              <p class="text-xs font-medium text-purple-300">{{ usagePercent >= 100 ? 'You have used all analyses for this month.' : 'You are getting close to your monthly analysis limit.' }}</p>
              <p class="mt-1 text-xs text-purple-300/70">Upgrade for more analyses and full history access.</p>
              <button class="mt-3 w-full rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 py-2 text-xs font-semibold text-white transition-all hover:from-purple-500 hover:to-purple-600" @click="openUpgrade">Upgrade plan</button>
            </div>
          </div>
        </div>

        <div class="panel-elevated overflow-hidden">
          <button class="flex w-full items-center justify-between px-4 py-3 text-left" @click="toggleSection('behavior')">
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-gray-300">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10.5 6h9m-9 6h9m-9 6h9M4.5 6h.008v.008H4.5V6zm0 6h.008v.008H4.5V12zm0 6h.008v.008H4.5V18z" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-semibold text-white">General preferences</p>
                <p class="text-xs text-gray-500">Startup, notifications, and automation</p>
              </div>
            </div>
            <svg class="h-4 w-4 text-gray-500 transition-transform" :class="sectionOpen.behavior ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <div v-if="sectionOpen.behavior" class="divide-y divide-white/[0.05] border-t border-white/[0.09]">
            <div v-for="toggle in toggles" :key="toggle.key" class="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p class="text-sm text-gray-200">{{ toggle.label }}</p>
                <p v-if="toggle.hint" class="mt-1 text-xs text-gray-500">{{ toggle.hint }}</p>
              </div>
              <button
                class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                :class="settings[toggle.key] ? 'bg-red-500' : 'bg-white/20'"
                @click="toggle.key === 'launchOnStartup' ? toggleLaunchOnStartup() : toggleKey(toggle.key)"
              >
                <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform" :class="settings[toggle.key] ? 'translate-x-4' : 'translate-x-0.5'" />
              </button>
            </div>
          </div>
        </div>
</section>
</template>
