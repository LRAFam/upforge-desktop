<template>
  <div ref="rootRef" class="relative flex-shrink-0">
    <button
      ref="triggerRef"
      type="button"
      class="flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-all"
      :class="open
        ? 'border-white/[0.18] bg-white/[0.08] text-white'
        : 'border-white/[0.10] bg-white/[0.03] text-gray-300 hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-white'"
      :title="`Active game: ${label}`"
      @click.stop="toggleOpen"
    >
      <span
        class="h-2 w-2 rounded-full flex-shrink-0"
        :style="{ backgroundColor: activeOption.accent, boxShadow: `0 0 8px ${activeOption.accent}66` }"
      />
      <span class="hidden sm:inline max-w-[72px] truncate">{{ label }}</span>
      <span class="sm:hidden">{{ activeOption.shortLabel }}</span>
      <svg class="h-3 w-3 text-gray-500 transition-transform" :class="open ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <Teleport to="body">
      <Transition name="game-menu">
        <div
          v-if="open"
          ref="menuRef"
          class="fixed z-[200] min-w-[200px] overflow-hidden rounded-xl border border-white/[0.12] bg-[#121820] shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
          :style="menuStyle"
        >
          <p class="px-3 pt-2.5 pb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-gray-600">Switch game</p>
          <button
            v-for="game in PRIMARY_GAMES"
            :key="game.id"
            type="button"
            class="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
            :class="primaryGame === game.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'"
            @click="selectGame(game.id)"
          >
            <span
              class="h-2.5 w-2.5 rounded-full flex-shrink-0"
              :style="{ backgroundColor: game.accent }"
            />
            <span class="flex-1 text-xs font-semibold text-gray-200">{{ game.label }}</span>
            <span
              v-if="game.live"
              class="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
              :style="{ color: game.accent, backgroundColor: `${game.accent}18`, border: `1px solid ${game.accent}33` }"
            >Live</span>
            <svg
              v-if="primaryGame === game.id"
              class="h-3.5 w-3.5 flex-shrink-0"
              :style="{ color: game.accent }"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { PRIMARY_GAMES, type PrimaryGame } from '../lib/games'
import { usePrimaryGame } from '../composables/usePrimaryGame'

const { primaryGame, label, loadFromSettings, setPrimaryGame } = usePrimaryGame()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const saving = ref(false)
const menuStyle = ref<Record<string, string>>({ top: '0px', left: '0px', width: '200px' })

const activeOption = computed(() =>
  PRIMARY_GAMES.find((g) => g.id === primaryGame.value) ?? PRIMARY_GAMES[0],
)

function updateMenuPosition() {
  const el = rootRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  menuStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${rect.left}px`,
    width: `${Math.max(rect.width, 200)}px`,
  }
}

async function toggleOpen() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    updateMenuPosition()
  }
}

async function selectGame(game: PrimaryGame) {
  if (saving.value || game === primaryGame.value) {
    open.value = false
    return
  }
  saving.value = true
  try {
    await setPrimaryGame(game)
  } finally {
    saving.value = false
    open.value = false
  }
}

function onDocumentClick(e: MouseEvent) {
  if (!open.value) return
  const target = e.target as Node
  if (rootRef.value?.contains(target) || menuRef.value?.contains(target)) return
  open.value = false
}

function onViewportChange() {
  if (open.value) updateMenuPosition()
}

onMounted(() => {
  void loadFromSettings()
  document.addEventListener('click', onDocumentClick)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})
</script>

<style scoped>
.game-menu-enter-active,
.game-menu-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.game-menu-enter-from,
.game-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
