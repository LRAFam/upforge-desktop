<script setup lang="ts">
/**
 * Title-bar account menu (v3): the current game's linked accounts. Valorant and League alts can be
 * made main here (existing endpoints, same plan caps); CS2 and Deadlock show their linked identity.
 * "Manage accounts" opens Settings › Account. Closes on Escape and outside click.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { usePrimaryGame } from '../../../composables/usePrimaryGame'
import { switcherView, type SwitcherInput } from './account-switcher'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; manage: [] }>()

const { primaryGame } = usePrimaryGame()
const input = ref<SwitcherInput>({})
const loading = ref(false)
const failed = ref(false)
const actingId = ref<number | null>(null)
const actionError = ref<string | null>(null)
const view = computed(() => switcherView(primaryGame.value, input.value))
const root = ref<HTMLElement | null>(null)

async function load(): Promise<void> {
  loading.value = true
  failed.value = false
  actionError.value = null
  try {
    const game = primaryGame.value
    if (game === 'valorant') {
      const res = await window.api.auth.listRiotAccounts()
      input.value = { valorant: res?.accounts ?? [] }
    } else if (game === 'lol') {
      const res = await window.api.lol.listAccounts()
      if (!res?.ok) throw new Error('unavailable')
      input.value = { lol: res.accounts }
    } else if (game === 'cs2') {
      const [s, faceit] = await Promise.all([
        window.api.settings.get().catch(() => null),
        window.api.cs2.getFaceitConnection().catch(() => null),
      ])
      input.value = { cs2: { steamName: (s as { cs2SteamName?: string } | null)?.cs2SteamName ?? null, faceitNickname: faceit?.connected ? faceit.nickname ?? null : null } }
    } else {
      const user = await window.api.auth.getUser().catch(() => null)
      input.value = { deadlock: { linked: Boolean((user as { deadlock_account_id?: number | null } | null)?.deadlock_account_id) } }
    }
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

async function makeMain(id: number): Promise<void> {
  actingId.value = id
  actionError.value = null
  try {
    const res = primaryGame.value === 'lol'
      ? await window.api.lol.setMainAccount(id)
      : await window.api.auth.activateRiotAccount(id)
    if (!res?.ok) { actionError.value = res?.error || 'Could not change your main account.'; return }
    await load()
    await window.api.app.refreshDashboard().catch(() => null)
  } finally {
    actingId.value = null
  }
}

function onKey(e: KeyboardEvent): void { if (e.key === 'Escape') emit('close') }
function onDown(e: MouseEvent): void {
  const target = e.target as HTMLElement | null
  // The title-bar account button toggles the menu itself; don't close-then-reopen on it.
  if (target?.closest?.('.uf-account')) return
  if (root.value && !root.value.contains(target as Node)) emit('close')
}

watch(() => props.open, (on) => {
  if (on) {
    void load()
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown, true)
  } else {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('mousedown', onDown, true)
  }
})
watch(primaryGame, () => { if (props.open) void load() })
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('mousedown', onDown, true)
})
</script>

<template>
  <div v-if="open" ref="root" class="uf-acc-menu -webkit-no-drag uf-rise" role="dialog" aria-label="Linked accounts">
    <p class="uf-label">Linked accounts</p>
    <p v-if="loading && !view.rows.length" class="uf-t4">Loading…</p>
    <p v-else-if="failed" class="uf-t4">Couldn't load your accounts. <button type="button" class="uf-link" @click="load">Retry</button></p>
    <template v-else>
      <div v-for="(r, i) in view.rows" :key="r.id ?? `${r.label}-${i}`" class="uf-acc-row">
        <span class="uf-acc-text">
          <span class="uf-t3">{{ r.label }}</span>
          <span class="uf-t4">{{ r.sub }}<template v-if="view.multi"> · {{ r.isMain ? 'Main' : 'Alt' }}</template></span>
        </span>
        <button v-if="r.canMakeMain && r.id != null" type="button" class="uf-link uf-t4" :disabled="actingId === r.id" @click="makeMain(r.id)">
          {{ actingId === r.id ? 'Switching…' : 'Make main' }}
        </button>
      </div>
      <p v-if="!view.rows.length" class="uf-t4">{{ view.empty }}</p>
      <p v-if="view.multi && view.rows.length > 1" class="uf-t4 uf-acc-hint">Your main is the account the coach follows. Matches on alts are coached but don't count for your focus.</p>
    </template>
    <p v-if="actionError" class="uf-t4 uf-acc-err" role="alert">{{ actionError }}</p>
    <button type="button" class="uf-link uf-acc-manage" @click="emit('manage')">Manage accounts</button>
  </div>
</template>

<style scoped>
.uf-acc-menu { position: absolute; top: 44px; right: 8px; width: 300px; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; background: var(--uf-bg); border: 1px solid var(--uf-line-2); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5); z-index: 40; }
.uf-acc-menu p { margin: 0; }
.uf-acc-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--uf-line); }
.uf-acc-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.uf-acc-text .uf-t3 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uf-acc-hint { color: var(--uf-faint); }
.uf-acc-err { color: var(--uf-loss); }
.uf-acc-manage { align-self: flex-start; }
</style>
