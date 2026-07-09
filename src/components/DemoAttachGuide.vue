<script setup lang="ts">
import { ref } from 'vue'
import {
  CS2_AUTOEXEC_LINE,
  demoAttachGuideSteps,
  demoAttachGuideTitle,
  isDemoAttachGame,
  type DemoAttachGame,
} from '../lib/demo-attach-guide'

const props = withDefaults(defineProps<{
  game: string
  compact?: boolean
  defaultOpen?: boolean
}>(), {
  compact: false,
  defaultOpen: false,
})

const expanded = ref(props.defaultOpen)
const copied = ref(false)
const folderError = ref<string | null>(null)

const attachGame = (): DemoAttachGame | null =>
  isDemoAttachGame(props.game) ? props.game : null

function toggle() {
  expanded.value = !expanded.value
}

async function openDemoFolder() {
  folderError.value = null
  const game = attachGame()
  if (!game) return
  try {
    const result = game === 'cs2'
      ? await window.api.cs2.openDemosFolder()
      : await window.api.deadlock.openReplaysFolder()
    if (!result.ok) {
      folderError.value = game === 'cs2'
        ? 'Could not open folder — set your demo path in Settings → Recording'
        : 'Could not open replays folder — play a match first or check Steam install'
    }
  } catch {
    folderError.value = 'Could not open folder'
  }
}

async function copyAutoexec() {
  try {
    await navigator.clipboard.writeText(CS2_AUTOEXEC_LINE)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    folderError.value = 'Could not copy — select the command manually'
  }
}
</script>

<template>
  <div
    v-if="attachGame()"
    class="rounded-xl border border-white/[0.08] bg-black/20 overflow-hidden"
    :class="compact ? 'text-[10px]' : 'text-[11px]'"
  >
    <button
      type="button"
      class="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors"
      :class="compact ? 'py-1.5' : 'py-2.5'"
      @click="toggle"
    >
      <span class="font-semibold text-gray-300">
        {{ demoAttachGuideTitle(attachGame()!) }}
      </span>
      <svg
        class="w-3.5 h-3.5 text-gray-500 flex-shrink-0 transition-transform"
        :class="expanded ? 'rotate-180' : ''"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <div v-if="expanded" class="border-t border-white/[0.06] px-3 pb-3 pt-2.5 space-y-3">
      <ol class="space-y-2 list-none">
        <li
          v-for="(step, index) in demoAttachGuideSteps(attachGame()!)"
          :key="index"
          class="flex gap-2 leading-relaxed text-gray-400"
        >
          <span
            class="flex-shrink-0 font-bold tabular-nums rounded-md text-center"
            :class="compact
              ? 'w-4 h-4 text-[9px] text-blue-300/90 bg-blue-500/10'
              : 'w-5 h-5 text-[10px] text-blue-300/90 bg-blue-500/10'"
          >{{ index + 1 }}</span>
          <span class="pt-0.5">
            <template v-for="(part, partIndex) in step.parts" :key="partIndex">
              <strong v-if="part.emphasis" class="font-semibold text-gray-200">{{ part.text }}</strong>
              <code v-else-if="part.mono" class="text-[10px] font-mono text-cyan-300/85">{{ part.text }}</code>
              <span v-else>{{ part.text }}</span>
            </template>
          </span>
        </li>
      </ol>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg border border-white/10 bg-white/[0.04] font-semibold text-gray-300 hover:bg-white/[0.07] transition-colors"
          :class="compact ? 'px-2 py-1 text-[9px]' : 'px-2.5 py-1 text-[10px]'"
          @click="openDemoFolder"
        >
          Open {{ attachGame() === 'cs2' ? 'demo' : 'replays' }} folder
        </button>
        <button
          v-if="attachGame() === 'cs2'"
          type="button"
          class="rounded-lg border border-orange-500/20 bg-orange-500/10 font-semibold text-orange-300 hover:bg-orange-500/20 transition-colors"
          :class="compact ? 'px-2 py-1 text-[9px]' : 'px-2.5 py-1 text-[10px]'"
          @click="copyAutoexec"
        >
          {{ copied ? 'Copied!' : 'Copy autoexec line' }}
        </button>
      </div>

      <p v-if="folderError" class="text-[10px] text-amber-300/90 leading-snug">{{ folderError }}</p>
    </div>
  </div>
</template>
