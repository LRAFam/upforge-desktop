<script setup lang="ts">
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
