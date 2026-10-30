<script setup lang="ts">
import UfDialog from '../v3/UfDialog.vue'
import UfButton from '../v3/UfButton.vue'
import { uiV3 } from '../../lib/ui-v3'

const props = withDefaults(defineProps<{
  show: boolean
  name: string
  tag: string
  atCap?: boolean
  linking?: boolean
  error?: string | null
}>(), {
  atCap: false,
  linking: false,
  error: null,
})

const emit = defineEmits<{
  close: []
  confirm: []
  openSettings: []
  upgrade: []
}>()

const riotLabel = () => `${props.name}#${props.tag}`
</script>

<template>
  <UfDialog
    v-if="uiV3"
    :open="show"
    :title="atCap ? 'Account limit reached' : 'Link this Riot account'"
    kicker="Before recording"
    :width="460"
    :persistent="linking"
    @close="emit('close')"
  >
    <p class="uf-t2" style="margin: 0">
      You are queueing as <span class="uf-riot-id">{{ name }}<span>#{{ tag }}</span></span>.
      <template v-if="atCap">This Riot ID is not linked and you have no open slots on your plan.</template>
      <template v-else>Link it to UpForge before recording, then re-queue.</template>
    </p>
    <p v-if="error" class="uf-dialog-error" role="alert">{{ error }}</p>
    <template #actions>
      <button type="button" class="uf-link" :disabled="linking" style="margin-right: auto" @click="emit('close')">Cancel</button>
      <template v-if="atCap">
        <UfButton variant="secondary" @click="emit('openSettings')">Open Settings</UfButton>
        <UfButton variant="primary" @click="emit('upgrade')">Upgrade</UfButton>
      </template>
      <UfButton v-else variant="primary" :disabled="linking" @click="emit('confirm')">{{ linking ? 'Linking…' : `Link ${riotLabel()}` }}</UfButton>
    </template>
  </UfDialog>
<template v-else>
  <Transition name="modal-pop">
    <div
      v-if="show"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-md"
      @click.self="emit('close')"
    >
      <div class="relative w-[400px] max-w-[calc(100vw-2rem)] bg-[#111116] border border-white/[0.10] rounded-2xl p-5 shadow-[0_24px_64px_rgba(0,0,0,0.8)]">
        <h3 class="text-sm font-bold text-white mb-1">
          {{ atCap ? 'Account limit reached' : 'Link Riot account?' }}
        </h3>
        <p v-if="atCap" class="text-xs text-gray-400 mb-4">
          You are queueing as
          <span class="text-gray-200 font-semibold">{{ name }}</span><span class="text-red-400">#{{ tag }}</span>.
          This Riot ID is not linked and you have no open slots on your plan.
        </p>
        <p v-else class="text-xs text-gray-400 mb-4">
          You are queueing as
          <span class="text-gray-200 font-semibold">{{ name }}</span><span class="text-red-400">#{{ tag }}</span>.
          Link this account to UpForge before recording. Re-queue after linking.
        </p>

        <p v-if="error" class="text-xs text-red-400 mb-3">{{ error }}</p>

        <div class="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            class="btn-secondary"
            :disabled="linking"
            @click="emit('close')"
          >Cancel</button>

          <template v-if="atCap">
            <button
              type="button"
              class="btn-secondary"
              @click="emit('openSettings')"
            >Open Settings</button>
            <button
              type="button"
              class="btn-primary"
              @click="emit('upgrade')"
            >Upgrade</button>
          </template>
          <button
            v-else
            type="button"
            class="btn-primary"
            :disabled="linking"
            @click="emit('confirm')"
          >{{ linking ? 'Linking…' : `Link ${riotLabel()}` }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>
</template>
