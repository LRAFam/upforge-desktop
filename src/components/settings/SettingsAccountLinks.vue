<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSettings, type RiotAccountRow } from '../../composables/useSettings'
import { gameBrand } from '../../lib/game-branding'
import type { PrimaryGame } from '../../lib/games'

const props = defineProps<{ focus?: PrimaryGame | null }>()
const router = useRouter()

const {
  user,
  settings,
  accountLinkFocus,
  reloadAccountLinks,
  riotAccounts,
  riotAccountsAtCap,
  riotAccountsCanAdd,
  riotAccountsCapLabel,
  openUpgrade,
  showSaved,
  cs2FaceitLinked,
  cs2FaceitNickname,
} = useSettings()

const riotName = ref('')
const riotTag = ref('')
const riotRegion = ref('na')
const riotBusy = ref(false)
const riotError = ref('')
const riotSuccess = ref('')
const riotActionError = ref('')
const showRiotAddForm = ref(false)
const riotActivatingId = ref<number | null>(null)
const riotRemovingId = ref<number | null>(null)
const riotConfirmRemoveId = ref<number | null>(null)
const riotEditingId = ref<number | null>(null)
const riotSavingId = ref<number | null>(null)
const riotEditError = ref('')
const riotEditName = ref('')
const riotEditTag = ref('')
const riotEditRegion = ref('na')

const faceitNickname = ref('')
const faceitBusy = ref(false)
const faceitError = ref('')
const faceitSuccess = ref('')

const steamSearch = ref('')
const steamResults = ref<Array<{ account_id: number; personaname: string }>>([])
const steamBusy = ref(false)
const steamError = ref('')
const steamSuccess = ref('')

const panelRefs: Partial<Record<PrimaryGame, HTMLElement | null>> = {
  valorant: null,
  cs2: null,
  deadlock: null,
  lol: null,
}

const valorantLinked = computed(() => riotAccounts.value.length > 0)
const cs2Linked = computed(() => Boolean(
  settings.cs2SteamName?.trim()
  || cs2FaceitLinked.value,
))
const deadlockLinked = computed(() => Boolean(user.value?.deadlock_account_id))
const lolLinked = computed(() => Boolean(user.value?.lol_riot_name?.trim() && user.value?.lol_riot_tag?.trim()))

const lolName = ref('')
const lolTag = ref('')
const lolPlatform = ref('EUW1')
const lolBusy = ref(false)
const lolError = ref('')
const lolSuccess = ref('')
const lolUnlinking = ref(false)
const lolEditing = ref(false)

const LOL_PLATFORMS = [
  { value: 'EUW1', label: 'EUW' },
  { value: 'EUN1', label: 'EUNE' },
  { value: 'NA1', label: 'NA' },
  { value: 'KR', label: 'KR' },
  { value: 'BR1', label: 'BR' },
  { value: 'LA1', label: 'LAN' },
  { value: 'LA2', label: 'LAS' },
  { value: 'OC1', label: 'OCE' },
  { value: 'JP1', label: 'JP' },
  { value: 'TR1', label: 'TR' },
  { value: 'RU', label: 'RU' },
] as const

const activeFocus = computed(() => props.focus ?? accountLinkFocus.value)

async function afterLinked() {
  await reloadAccountLinks()
  await window.api.app.refreshDashboard().catch(() => null)
  await router.push('/dashboard')
}

function setPanelRef(game: PrimaryGame, el: Element | null) {
  panelRefs[game] = el as HTMLElement | null
}

async function scrollToFocus() {
  const game = activeFocus.value
  if (!game) return
  await nextTick()
  panelRefs[game]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

onMounted(async () => {
  await reloadAccountLinks()
  void scrollToFocus()
})

function openRiotAddForm() {
  riotError.value = ''
  riotSuccess.value = ''
  showRiotAddForm.value = true
}

function cancelRiotAddForm() {
  showRiotAddForm.value = false
  riotName.value = ''
  riotTag.value = ''
  riotRegion.value = 'na'
  riotError.value = ''
  riotSuccess.value = ''
}

watch(activeFocus, () => { void scrollToFocus() })

async function linkValorant() {
  riotError.value = ''
  riotSuccess.value = ''
  if (!riotName.value.trim() || !riotTag.value.trim()) {
    riotError.value = 'Enter your Riot name and tag (e.g. PlayerName + 1234).'
    return
  }
  riotBusy.value = true
  try {
    const result = await window.api.auth.linkRiotAccount({
      riot_name: riotName.value.trim(),
      riot_tag: riotTag.value.trim().replace(/^#/, ''),
      riot_region: riotRegion.value,
    })
    if (!result.ok) {
      riotError.value = result.error || 'Could not link Riot account'
      return
    }
    riotSuccess.value = 'Riot account linked. Syncing stats in the background.'
    riotName.value = ''
    riotTag.value = ''
    riotRegion.value = 'na'
    showRiotAddForm.value = false
    await reloadAccountLinks()
    await window.api.app.refreshDashboard().catch(() => null)
  } finally {
    riotBusy.value = false
  }
}

async function activateRiotAccount(id: number) {
  riotActionError.value = ''
  riotActivatingId.value = id
  try {
    const result = await window.api.auth.activateRiotAccount(id)
    if (!result.ok) {
      riotActionError.value = result.error || 'Could not set active account'
      return
    }
    await reloadAccountLinks()
    await window.api.app.refreshDashboard().catch(() => null)
  } finally {
    riotActivatingId.value = null
  }
}

function startRiotEdit(account: RiotAccountRow) {
  riotEditingId.value = account.id
  riotEditError.value = ''
  riotConfirmRemoveId.value = null
  riotEditName.value = account.riot_name
  riotEditTag.value = account.riot_tag
  riotEditRegion.value = account.riot_region ?? 'na'
}

function cancelRiotEdit() {
  riotEditingId.value = null
  riotEditError.value = ''
  riotEditName.value = ''
  riotEditTag.value = ''
  riotEditRegion.value = 'na'
}

async function saveRiotRename(id: number) {
  riotEditError.value = ''
  if (!riotEditName.value.trim() || !riotEditTag.value.trim()) {
    riotEditError.value = 'Enter your Riot name and tag (e.g. PlayerName + 1234).'
    return
  }
  riotSavingId.value = id
  try {
    const result = await window.api.auth.renameRiotAccount(id, {
      riot_name: riotEditName.value.trim(),
      riot_tag: riotEditTag.value.trim().replace(/^#/, ''),
      riot_region: riotEditRegion.value,
    })
    if (!result.ok) {
      riotEditError.value = result.error || 'Could not update Riot account'
      return
    }
    cancelRiotEdit()
    await reloadAccountLinks()
    await window.api.app.refreshDashboard().catch(() => null)
  } finally {
    riotSavingId.value = null
  }
}

async function removeRiotAccount(id: number) {
  riotActionError.value = ''
  riotRemovingId.value = id
  try {
    const result = await window.api.auth.removeRiotAccount(id)
    if (!result.ok) {
      riotActionError.value = result.error || 'Could not remove Riot account'
      return
    }
    riotConfirmRemoveId.value = null
    await reloadAccountLinks()
    await window.api.app.refreshDashboard().catch(() => null)
  } finally {
    riotRemovingId.value = null
  }
}

async function saveCs2Steam() {
  faceitError.value = ''
  await window.api.cs2.syncIdentity(settings.cs2SteamName?.trim() ?? '')
  showSaved()
  await reloadAccountLinks()
  await window.api.app.refreshDashboard().catch(() => null)
}

async function linkFaceit() {
  faceitError.value = ''
  faceitSuccess.value = ''
  const nick = faceitNickname.value.trim()
  if (!nick) {
    faceitError.value = 'Enter your FACEIT username.'
    return
  }
  faceitBusy.value = true
  try {
    const result = await window.api.cs2.connectFaceit(nick)
    if (!result.ok) {
      faceitError.value = result.error || 'FACEIT player not found'
      return
    }
    faceitSuccess.value = 'FACEIT linked.'
    faceitNickname.value = ''
    await afterLinked()
  } finally {
    faceitBusy.value = false
  }
}

async function searchDeadlock() {
  steamError.value = ''
  steamSuccess.value = ''
  const q = steamSearch.value.trim()
  if (q.length < 2) {
    steamError.value = 'Type at least 2 characters.'
    return
  }
  steamBusy.value = true
  steamResults.value = []
  try {
    const numeric = /^\d+$/.test(q) ? Number(q) : null
    if (numeric != null && Number.isFinite(numeric)) {
      const player = await window.api.deadlock.lookupPlayer(numeric)
      steamResults.value = player ? [player] : []
    } else {
      steamResults.value = await window.api.deadlock.searchPlayers(q)
    }
    if (!steamResults.value.length) steamError.value = 'No Steam profiles found.'
  } finally {
    steamBusy.value = false
  }
}

async function connectDeadlock(accountId: number, name: string) {
  steamError.value = ''
  steamBusy.value = true
  try {
    const result = await window.api.deadlock.connectAccount(accountId)
    if (!result.ok) {
      steamError.value = result.error || 'Could not connect account'
      return
    }
    steamSuccess.value = `Linked as ${name}.`
    steamSearch.value = ''
    steamResults.value = []
    await afterLinked()
  } finally {
    steamBusy.value = false
  }
}

function startLolEdit() {
  lolEditing.value = true
  lolError.value = ''
  lolSuccess.value = ''
  lolName.value = user.value?.lol_riot_name ?? ''
  lolTag.value = user.value?.lol_riot_tag ?? ''
  lolPlatform.value = user.value?.lol_platform ?? 'EUW1'
}

function cancelLolEdit() {
  lolEditing.value = false
  lolName.value = ''
  lolTag.value = ''
  lolError.value = ''
  lolSuccess.value = ''
}

async function linkLol() {
  lolError.value = ''
  lolSuccess.value = ''
  if (!lolName.value.trim() || !lolTag.value.trim()) {
    lolError.value = 'Enter your Riot name and tag (e.g. Name + TAG).'
    return
  }
  if (!lolPlatform.value) {
    lolError.value = 'Select your League server.'
    return
  }
  lolBusy.value = true
  try {
    const result = await window.api.auth.linkLolAccount({
      riot_name: lolName.value.trim(),
      riot_tag: lolTag.value.trim().replace(/^#/, ''),
      lol_platform: lolPlatform.value,
    })
    if (!result.ok) {
      lolError.value = result.error || 'Could not link League account'
      return
    }
    lolSuccess.value = 'League account linked.'
    lolEditing.value = false
    await afterLinked()
  } finally {
    lolBusy.value = false
  }
}

async function unlinkLol() {
  lolError.value = ''
  lolSuccess.value = ''
  lolUnlinking.value = true
  try {
    const result = await window.api.auth.unlinkLolAccount()
    if (!result.ok) {
      lolError.value = result.error || 'Could not unlink League account'
      return
    }
    lolSuccess.value = 'League account unlinked.'
    lolEditing.value = false
    await reloadAccountLinks()
    await window.api.app.refreshDashboard().catch(() => null)
  } finally {
    lolUnlinking.value = false
  }
}
</script>

<template>
  <div class="panel-elevated overflow-hidden">
    <div class="border-b border-white/[0.09] px-4 py-3">
      <p class="text-sm font-semibold text-white">Link game accounts</p>
      <p class="mt-0.5 text-xs text-gray-500">Connect here in the app. No website onboarding loop.</p>
    </div>

    <div class="space-y-3 p-4">
      <!-- Valorant -->
      <div
        :ref="(el) => setPanelRef('valorant', el as Element | null)"
        class="rounded-2xl border p-4 transition-colors"
        :class="activeFocus === 'valorant' ? 'border-red-500/30 bg-red-500/[0.06]' : 'border-white/[0.10] bg-black/20'"
      >
        <div class="flex items-center justify-between gap-2 mb-2">
          <p class="text-xs font-bold uppercase tracking-wider text-gray-300">{{ gameBrand('valorant').wordmark }}</p>
          <span v-if="valorantLinked" class="text-[9px] font-bold uppercase tracking-wide text-emerald-300/90">{{ riotAccounts.length }} linked</span>
        </div>

        <p v-if="valorantLinked" class="text-[11px] text-gray-500 mb-3">{{ riotAccountsCapLabel }}</p>
        <p v-else class="text-xs text-gray-500 mb-3">Link Valorant accounts to track stats. One account is active at a time.</p>

        <div v-if="valorantLinked" class="space-y-2 mb-3">
          <div
            v-for="account in riotAccounts"
            :key="account.id"
            class="rounded-xl border border-white/[0.08] bg-black/25 p-3"
          >
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-sm font-semibold text-gray-200 truncate">
                    {{ account.riot_name }}<span class="text-red-400">#{{ account.riot_tag }}</span>
                  </p>
                  <span
                    v-if="account.is_active"
                    class="text-[9px] font-bold uppercase tracking-wide text-red-300/90 border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 rounded"
                  >Active</span>
                </div>
                <p v-if="account.riot_region" class="text-[10px] text-gray-500 mt-0.5">
                  Region: {{ account.riot_region.toUpperCase() }}
                </p>
              </div>
              <div class="flex flex-wrap gap-1.5 shrink-0">
                <button
                  v-if="!account.is_active"
                  type="button"
                  class="btn-secondary btn-sm"
                  :disabled="riotActivatingId === account.id"
                  @click="activateRiotAccount(account.id)"
                >{{ riotActivatingId === account.id ? 'Setting…' : 'Set active' }}</button>
                <button
                  v-if="riotEditingId !== account.id"
                  type="button"
                  class="btn-secondary btn-sm"
                  title="Riot ID changed? Update the name and tag for this account."
                  @click="startRiotEdit(account)"
                >Update</button>
                <template v-if="riotConfirmRemoveId === account.id">
                  <button
                    type="button"
                    class="btn-danger btn-sm"
                    :disabled="riotRemovingId === account.id"
                    @click="removeRiotAccount(account.id)"
                  >{{ riotRemovingId === account.id ? 'Removing…' : 'Confirm' }}</button>
                  <button
                    type="button"
                    class="btn-ghost btn-sm"
                    @click="riotConfirmRemoveId = null"
                  >Cancel</button>
                </template>
                <button
                  v-else
                  type="button"
                  class="btn-danger btn-sm"
                  :disabled="riotAccounts.length <= 1 || riotRemovingId === account.id"
                  :title="riotAccounts.length <= 1 ? 'You must keep at least one Riot account' : undefined"
                  @click="riotConfirmRemoveId = account.id"
                >Remove</button>
              </div>
            </div>

            <div v-if="riotEditingId === account.id" class="mt-3 border-t border-white/[0.06] pt-3 space-y-2">
              <p class="text-[11px] text-gray-500">
                Changed your Riot ID in Valorant? Update it here so recording and stats keep matching
                this account.
              </p>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input v-model="riotEditName" type="text" placeholder="Name" class="rounded-xl border border-white/[0.10] bg-black/30 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-red-500/40 focus:outline-none" />
                <input v-model="riotEditTag" type="text" placeholder="Tag" class="rounded-xl border border-white/[0.10] bg-black/30 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-red-500/40 focus:outline-none" />
                <select v-model="riotEditRegion" class="rounded-xl border border-white/[0.10] bg-black/30 px-3 py-2 text-xs text-gray-200 focus:border-red-500/40 focus:outline-none">
                  <option value="na">NA</option>
                  <option value="eu">EU</option>
                  <option value="ap">AP</option>
                  <option value="kr">KR</option>
                  <option value="latam">LATAM</option>
                  <option value="br">BR</option>
                </select>
              </div>
              <p v-if="riotEditError" class="text-[11px] text-red-400">{{ riotEditError }}</p>
              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  class="btn-secondary"
                  @click="cancelRiotEdit"
                >Cancel</button>
                <button
                  type="button"
                  class="btn-primary"
                  :disabled="riotSavingId === account.id"
                  @click="saveRiotRename(account.id)"
                >{{ riotSavingId === account.id ? 'Saving…' : 'Save changes' }}</button>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="valorantLinked && riotAccountsAtCap"
          class="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-[11px] text-gray-500 mb-3 flex flex-wrap items-center justify-between gap-2"
        >
          <span>Account limit reached on your current plan.</span>
          <button type="button" class="text-[10px] font-bold uppercase tracking-wide text-red-400 hover:text-red-300" @click="openUpgrade">Upgrade</button>
        </div>

        <button
          v-if="valorantLinked && riotAccountsCanAdd && !showRiotAddForm"
          type="button"
          class="btn-secondary mb-3"
          @click="openRiotAddForm"
        >Add account</button>

        <div v-if="showRiotAddForm || !valorantLinked" class="space-y-2">
          <p v-if="valorantLinked" class="text-[11px] text-gray-500">
            Enter the Riot ID for the Valorant account you want to link.
          </p>
          <p v-else class="text-xs text-gray-500">Your Riot ID from the Valorant home screen (Name#Tag).</p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input v-model="riotName" type="text" placeholder="Name" class="rounded-xl border border-white/[0.10] bg-black/30 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-red-500/40 focus:outline-none" />
            <input v-model="riotTag" type="text" placeholder="Tag" class="rounded-xl border border-white/[0.10] bg-black/30 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-red-500/40 focus:outline-none" />
            <select v-model="riotRegion" class="rounded-xl border border-white/[0.10] bg-black/30 px-3 py-2 text-xs text-gray-200 focus:border-red-500/40 focus:outline-none">
              <option value="na">NA</option>
              <option value="eu">EU</option>
              <option value="ap">AP</option>
              <option value="kr">KR</option>
              <option value="latam">LATAM</option>
              <option value="br">BR</option>
            </select>
          </div>
          <div class="flex justify-end gap-2">
            <button
              v-if="valorantLinked"
              type="button"
              class="btn-secondary"
              @click="cancelRiotAddForm"
            >Cancel</button>
            <button
              type="button"
              class="btn-primary"
              :disabled="riotBusy"
              @click="linkValorant"
            >{{ riotBusy ? 'Linking…' : 'Link Riot account' }}</button>
          </div>
        </div>

        <p v-if="riotError" class="mt-2 text-[11px] text-red-400">{{ riotError }}</p>
        <p v-if="riotSuccess" class="mt-2 text-[11px] text-emerald-400">{{ riotSuccess }}</p>
        <p v-if="riotActionError" class="mt-2 text-[11px] text-red-400">{{ riotActionError }}</p>
      </div>

      <!-- CS2 -->
      <div
        :ref="(el) => setPanelRef('cs2', el as Element | null)"
        class="rounded-2xl border p-4 transition-colors"
        :class="activeFocus === 'cs2' ? 'border-blue-500/30 bg-blue-500/[0.06]' : 'border-white/[0.10] bg-black/20'"
      >
        <div class="flex items-center justify-between gap-2 mb-2">
          <p class="text-xs font-bold uppercase tracking-wider text-gray-300">{{ gameBrand('cs2').wordmark }}</p>
          <span v-if="cs2Linked" class="text-[9px] font-bold uppercase tracking-wide text-emerald-300/90">Linked</span>
        </div>
        <label class="block text-[11px] text-gray-500 mb-1">Steam / in-game name</label>
        <input
          v-model="settings.cs2SteamName"
          type="text"
          placeholder="Matches your CS2 name"
          class="w-full rounded-xl border border-white/[0.10] bg-black/30 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-blue-500/40 focus:outline-none"
          @change="saveCs2Steam"
        />
        <div class="mt-3 pt-3 border-t border-white/[0.06]">
          <label class="block text-[11px] text-gray-500 mb-1">FACEIT username <span class="text-gray-600">(optional)</span></label>
          <div class="flex gap-2">
            <input
              v-model="faceitNickname"
              type="text"
              :placeholder="cs2FaceitNickname ? `Connected: ${cs2FaceitNickname}` : 'FACEIT nickname'"
              class="flex-1 rounded-xl border border-white/[0.10] bg-black/30 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-orange-500/40 focus:outline-none"
            />
            <button
              type="button"
              class="btn-secondary shrink-0"
              :disabled="faceitBusy"
              @click="linkFaceit"
            >{{ faceitBusy ? '…' : 'Link FACEIT' }}</button>
          </div>
        </div>
        <p v-if="faceitError" class="mt-2 text-[11px] text-red-400">{{ faceitError }}</p>
        <p v-if="faceitSuccess" class="mt-2 text-[11px] text-emerald-400">{{ faceitSuccess }}</p>
      </div>

      <!-- Deadlock -->
      <div
        :ref="(el) => setPanelRef('deadlock', el as Element | null)"
        class="rounded-2xl border p-4 transition-colors"
        :class="activeFocus === 'deadlock' ? 'border-yellow-500/30 bg-yellow-500/[0.06]' : 'border-white/[0.10] bg-black/20'"
      >
        <div class="flex items-center justify-between gap-2 mb-2">
          <p class="text-xs font-bold uppercase tracking-wider text-gray-300">{{ gameBrand('deadlock').wordmark }}</p>
          <span v-if="deadlockLinked" class="text-[9px] font-bold uppercase tracking-wide text-emerald-300/90">Linked</span>
        </div>
        <p v-if="deadlockLinked" class="text-xs text-gray-400 mb-2">Steam profile connected — stats sync from match history.</p>
        <template v-else>
          <p class="text-xs text-gray-500 mb-2">Search your Steam display name or paste your Steam ID.</p>
          <div class="flex gap-2">
            <input
              v-model="steamSearch"
              type="text"
              placeholder="Steam name or ID"
              class="flex-1 rounded-xl border border-white/[0.10] bg-black/30 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-yellow-500/40 focus:outline-none"
              @keydown.enter.prevent="searchDeadlock"
            />
            <button
              type="button"
              class="btn-secondary shrink-0"
              :disabled="steamBusy"
              @click="searchDeadlock"
            >{{ steamBusy ? '…' : 'Search' }}</button>
          </div>
          <ul v-if="steamResults.length" class="mt-2 space-y-1">
            <li v-for="player in steamResults" :key="player.account_id">
              <button
                type="button"
                class="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left text-xs text-gray-200 hover:border-yellow-500/25 hover:bg-yellow-500/[0.06]"
                @click="connectDeadlock(player.account_id, player.personaname)"
              >
                {{ player.personaname }}
              </button>
            </li>
          </ul>
        </template>
        <p v-if="steamError" class="mt-2 text-[11px] text-red-400">{{ steamError }}</p>
        <p v-if="steamSuccess" class="mt-2 text-[11px] text-emerald-400">{{ steamSuccess }}</p>
      </div>

      <!-- League of Legends -->
      <div
        :ref="(el) => setPanelRef('lol', el as Element | null)"
        class="rounded-2xl border p-4 transition-colors"
        :class="activeFocus === 'lol' ? 'border-amber-500/30 bg-amber-500/[0.06]' : 'border-white/[0.10] bg-black/20'"
      >
        <div class="flex items-center justify-between gap-2 mb-2">
          <p class="text-xs font-bold uppercase tracking-wider text-gray-300">{{ gameBrand('lol').wordmark }}</p>
          <span v-if="lolLinked" class="text-[9px] font-bold uppercase tracking-wide text-emerald-300/90">Linked</span>
        </div>

        <template v-if="lolLinked && !lolEditing">
          <p class="text-sm font-semibold text-gray-200 mb-1">
            {{ user?.lol_riot_name }}<span class="text-amber-400">#{{ user?.lol_riot_tag }}</span>
          </p>
          <p v-if="user?.lol_platform" class="text-[11px] text-gray-500 mb-3">
            Server: {{ user.lol_platform }}
          </p>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="btn-secondary"
              @click="startLolEdit"
            >Update</button>
            <button
              type="button"
              class="btn-danger"
              :disabled="lolUnlinking"
              @click="unlinkLol"
            >{{ lolUnlinking ? '…' : 'Unlink' }}</button>
          </div>
        </template>

        <template v-else>
          <p class="text-xs text-gray-500 mb-3">
            Can be a different Riot ID than Valorant. Use the Riot ID from the League client.
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              v-model="lolName"
              type="text"
              placeholder="Name"
              class="rounded-xl border border-white/[0.10] bg-black/30 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-amber-500/40 focus:outline-none"
            />
            <input
              v-model="lolTag"
              type="text"
              placeholder="Tag"
              class="rounded-xl border border-white/[0.10] bg-black/30 px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-amber-500/40 focus:outline-none"
            />
            <select
              v-model="lolPlatform"
              class="rounded-xl border border-white/[0.10] bg-black/30 px-3 py-2 text-xs text-gray-200 focus:border-amber-500/40 focus:outline-none"
            >
              <option v-for="p in LOL_PLATFORMS" :key="p.value" :value="p.value">{{ p.label }}</option>
            </select>
          </div>
          <div class="mt-3 flex justify-end gap-2">
            <button
              v-if="lolEditing"
              type="button"
              class="btn-secondary"
              @click="cancelLolEdit"
            >Cancel</button>
            <button
              type="button"
              class="btn-primary"
              :disabled="lolBusy"
              @click="linkLol"
            >{{ lolBusy ? 'Linking…' : (lolEditing ? 'Save League account' : 'Link League account') }}</button>
          </div>
        </template>

        <p v-if="lolError" class="mt-2 text-[11px] text-red-400">{{ lolError }}</p>
        <p v-if="lolSuccess" class="mt-2 text-[11px] text-emerald-400">{{ lolSuccess }}</p>
      </div>
    </div>
  </div>
</template>
