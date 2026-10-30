<script setup lang="ts">
/**
 * "Get FACEIT coaching" for a CS2 recording that matches one of the player's FACEIT matches.
 * Finding the match is free; queueing it spends an analysis, so it always takes a second tap.
 * Needs the lead's preload lines (cs2.findFaceitMatch / attachFaceitMatch / getFaceitLink);
 * renders nothing until they exist.
 */
import { computed, onMounted, ref } from 'vue'
import UfButton from '../UfButton.vue'
import { FACEIT_CONFIRM, faceitAttachView, type FaceitLookup } from './cs2-faceit-attach'

const props = defineProps<{ recordingId: string; startedAtMs: number; endedAtMs?: number | null; map?: string | null }>()

type Cs2FaceitApi = {
  findFaceitMatch?: (rec: { startedAtMs: number; endedAtMs?: number | null; map?: string | null }) => Promise<FaceitLookup>
  attachFaceitMatch?: (recordingId: string, matchId: string) => Promise<{ ok: boolean; jobId?: string; error?: string }>
  getFaceitLink?: (recordingId: string) => Promise<{ matchId: string; jobId: string } | null>
}
const api = (window as unknown as { api?: { cs2?: Cs2FaceitApi } }).api?.cs2

const lookup = ref<FaceitLookup | null>(null)
const linked = ref<{ jobId: string } | null>(null)
const confirming = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const view = computed(() => faceitAttachView(lookup.value, linked.value))

onMounted(async () => {
  if (!api?.findFaceitMatch || !api.getFaceitLink) return
  linked.value = await api.getFaceitLink(props.recordingId).catch(() => null)
  if (linked.value) return
  lookup.value = await api.findFaceitMatch({ startedAtMs: props.startedAtMs, endedAtMs: props.endedAtMs ?? null, map: props.map ?? null })
    .catch(() => null)
})

async function attach() {
  if (lookup.value?.status !== 'matched' || !api?.attachFaceitMatch) return
  busy.value = true
  error.value = null
  const res: { ok: boolean; jobId?: string; error?: string } = await api.attachFaceitMatch(props.recordingId, lookup.value.match.match_id)
    .catch(() => ({ ok: false, error: 'FACEIT coaching could not be started.' }))
  busy.value = false
  confirming.value = false
  if (res.ok && res.jobId) linked.value = { jobId: res.jobId }
  else error.value = res.error ?? 'FACEIT coaching could not be started.'
}
</script>

<template>
  <div v-if="view.visible" class="cs2-faceit uf-rise">
    <span class="uf-label">FACEIT</span>
    <p class="uf-t4" style="margin: 0">{{ error ?? view.line }}</p>
    <div v-if="view.canAttach && !linked" class="cs2-faceit-actions">
      <template v-if="!confirming">
        <UfButton variant="secondary" @click="confirming = true">Get FACEIT coaching</UfButton>
      </template>
      <template v-else>
        <span class="uf-t4">{{ FACEIT_CONFIRM }}</span>
        <UfButton variant="primary" :disabled="busy" @click="attach">{{ busy ? 'Starting…' : 'Confirm' }}</UfButton>
        <UfButton variant="link" :disabled="busy" @click="confirming = false">Cancel</UfButton>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cs2-faceit { display: flex; flex-direction: column; gap: 8px; padding: 14px 0; border-top: 1px solid var(--uf-line); }
.cs2-faceit-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
</style>
