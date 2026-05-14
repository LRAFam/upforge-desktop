<template>
  <div class="flex flex-col h-full px-4 pt-3 pb-4 gap-3">
    <!-- Header -->
    <div class="flex items-center justify-between flex-shrink-0">
      <div>
        <h2 class="text-sm font-semibold text-white">Clip Library</h2>
        <p class="text-xs text-gray-500 mt-0.5">{{ clips.length }} clip{{ clips.length !== 1 ? 's' : '' }} saved locally</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-600">F9 to bookmark during match</span>
      </div>
    </div>

    <!-- Filter row -->
    <div class="flex items-center gap-2 flex-shrink-0">
      <button
        v-for="f in filters"
        :key="f.value"
        class="px-2.5 py-1 rounded text-xs font-medium transition-colors"
        :class="activeFilter === f.value
          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
          : 'text-gray-500 hover:text-gray-300 border border-transparent'"
        @click="activeFilter = f.value"
      >
        {{ f.label }}
      </button>
    </div>

    <!-- Toast notification -->
    <Transition name="toast-slide">
      <div
        v-if="showToast"
        class="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl shadow-xl border backdrop-blur-md pointer-events-none"
        :class="toastType === 'success'
          ? 'bg-green-500/15 border-green-500/30'
          : 'bg-red-500/15 border-red-500/30'"
      >
        <svg v-if="toastType === 'success'" class="w-3.5 h-3.5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
        <svg v-else class="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        <span class="text-xs font-semibold text-white">{{ toastMessage }}</span>
      </div>
    </Transition>

    <!-- Upload error banner -->
    <div
      v-if="uploadError"
      class="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg flex-shrink-0"
    >
      <svg class="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>
      <p class="text-xs text-red-400 flex-1">{{ uploadError }}</p>
      <button class="text-red-400/60 hover:text-red-400 transition-colors" @click="uploadError = null">
        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="filteredClips.length === 0" class="flex-1 flex flex-col items-center justify-center gap-3 text-center">
      <div class="w-14 h-14 rounded-full bg-white/[0.04] flex items-center justify-center">
        <svg class="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
        </svg>
      </div>
      <div>
        <p class="text-sm text-gray-400">No clips yet</p>
        <p class="text-xs text-gray-600 mt-0.5">Press F9 during a match to save a moment</p>
      </div>
    </div>

    <!-- Clip grid -->
    <div v-else class="flex-1 overflow-y-auto">
      <div class="grid grid-cols-2 gap-3">
        <div
          v-for="clip in filteredClips"
          :key="clip.id"
          class="group relative bg-white/[0.03] border border-white/[0.06] rounded-lg overflow-hidden cursor-pointer hover:border-white/[0.12] transition-all"
          @click="openPlayer(clip)"
        >
          <!-- Thumbnail -->
          <div class="relative bg-black" style="min-height: 72px; aspect-ratio: 16/9;">
            <img
              v-if="thumbnails[clip.id]"
              :src="thumbnails[clip.id]"
              class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
              alt=""
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <svg class="w-8 h-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <!-- Play overlay (centre) -->
            <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <div class="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <svg class="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>
            <!-- Trigger badge (top-left) -->
            <div class="absolute top-1.5 left-1.5">
              <span
                class="px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wide"
                :class="triggerClass(clip.trigger)"
              >{{ clip.trigger }}</span>
            </div>
            <!-- AI Tips badge (top-right) -->
            <div v-if="clip.suggestion" class="absolute top-1.5 right-1.5">
              <span class="px-1.5 py-0.5 rounded text-xs font-semibold bg-orange-500/80 text-white backdrop-blur-sm">🤖 AI</span>
            </div>
            <!-- Bottom gradient overlay with always-visible action buttons -->
            <div class="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-between px-1.5 pb-1.5" @click.stop>
              <span class="text-xs text-gray-300 font-mono bg-black/50 rounded px-1 py-px">{{ formatDuration(clip.durationSeconds) }}</span>
              <div class="flex gap-1">
                <button
                  :class="[
                    'w-5 h-5 rounded bg-black/60 backdrop-blur-sm flex items-center justify-center transition-colors',
                    uploadingClipId === clip.id ? 'opacity-50 cursor-wait' : 'hover:bg-white/20'
                  ]"
                  :disabled="!!uploadingClipId"
                  title="Upload & Analyse"
                  @click="uploadClip(clip)"
                >
                  <svg v-if="uploadingClipId !== clip.id" class="w-2.5 h-2.5 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                  </svg>
                  <svg v-else class="w-2.5 h-2.5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                </button>
                <button
                  class="w-5 h-5 rounded bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-red-500/60 transition-colors"
                  title="Delete"
                  @click="deleteClip(clip.id)"
                >
                  <svg class="w-2.5 h-2.5 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 001-1h4a1 1 0 001 1m-7 0h8"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Metadata -->
          <div class="p-2.5">
            <p class="text-xs font-medium text-gray-200 truncate">
              {{ clip.title || defaultTitle(clip) }}
            </p>
            <div class="flex items-center gap-1.5 mt-1">
              <span v-if="clip.map" class="text-xs text-gray-500">{{ clip.map }}</span>
              <span v-if="clip.agent" class="text-xs text-gray-600">·</span>
              <span v-if="clip.agent" class="text-xs text-gray-500">{{ clip.agent }}</span>
              <span class="ml-auto text-xs text-gray-600">{{ timeAgo(clip.savedAt) }}</span>
            </div>
            <!-- AI coaching tip preview -->
            <div v-if="clip.suggestion" class="mt-2 p-1.5 bg-orange-500/10 border border-orange-500/20 rounded text-xs text-orange-300/80 line-clamp-2">
              💡 {{ clip.suggestion }}
            </div>
            <div v-if="clip.coachingTags?.length" class="flex flex-wrap gap-1 mt-1.5">
              <span
                v-for="tag in clip.coachingTags.slice(0, 3)"
                :key="tag"
                class="text-[8px] font-semibold px-1.5 py-px rounded-full bg-red-500/10 text-red-400/70 border border-red-500/15 capitalize"
              >{{ tag.replace(/_/g, ' ') }}</span>
            </div>
            <div v-else-if="clip.analysisStatus === 'queued' || clip.analysisStatus === 'processing'" class="mt-2 flex items-center gap-1 text-xs text-gray-600">
              <span class="w-1 h-1 rounded-full bg-gray-600 animate-pulse" />
              Analysing...
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Video player modal -->
    <div
      v-if="playingClip"
      class="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col"
      @click.self="closePlayer"
    >
      <!-- Modal header -->
      <div class="flex items-center justify-between px-4 py-3 flex-shrink-0 bg-white/[0.03] border-b border-white/[0.07]">
        <div class="flex-1 min-w-0 pr-3">
          <p class="text-xs font-semibold text-white truncate">{{ playingClip.title || defaultTitle(playingClip) }}</p>
          <p v-if="playingClip.trigger" class="text-xs text-gray-600 mt-0.5 capitalize">{{ playingClip.trigger }} clip</p>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/[0.06] hover:bg-white/[0.10] text-gray-300 border border-white/[0.10] rounded-lg transition-colors"
            @click="openTrim(playingClip)"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z"/>
            </svg>
            Trim
          </button>
          <button
            v-if="playingClip.uploadStatus === 'uploaded'"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/[0.06] hover:bg-white/[0.10] text-gray-300 border border-white/[0.10] rounded-lg transition-colors"
            @click="shareClip(playingClip)"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
            </svg>
            Share
          </button>
          <button
            v-else
            :disabled="!!uploadingClipId"
            :class="[
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors',
              uploadingClipId === playingClip.id
                ? 'bg-red-500/10 border-red-500/20 text-red-400/60 cursor-wait'
                : 'bg-red-500/15 hover:bg-red-500/25 text-red-400 border-red-500/25 hover:border-red-500/40'
            ]"
            @click="uploadClip(playingClip)"
          >
            <svg v-if="uploadingClipId !== playingClip.id" class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            <svg v-else class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            {{ uploadingClipId === playingClip.id ? 'Uploading…' : 'Upload & Analyse' }}
          </button>
          <button class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-white hover:bg-white/[0.07] transition-colors" @click="closePlayer">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
      <video
        ref="videoEl"
        class="flex-1 w-full object-contain"
        controls
        autoplay
        :src="`file://${playingClip.path}`"
      />
      <div v-if="playingClip.suggestion" class="px-4 py-3 bg-gradient-to-r from-orange-500/[0.08] to-transparent border-t border-orange-500/15 flex-shrink-0 flex items-start gap-2.5">
        <div class="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-px">
          <svg class="w-2.5 h-2.5 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0 space-y-1.5">
          <p v-if="playingClip.verdict" class="text-[10px] text-gray-400 italic leading-relaxed">{{ playingClip.verdict }}</p>
          <p class="text-xs text-orange-300/90 leading-relaxed"><span class="font-semibold text-orange-300">AI Coaching:</span> {{ playingClip.suggestion }}</p>
          <div v-if="playingClip.coachingTags?.length" class="flex flex-wrap gap-1 pt-0.5">
            <span
              v-for="tag in playingClip.coachingTags"
              :key="tag"
              class="text-[8px] font-semibold px-1.5 py-px rounded-full bg-red-500/10 text-red-400/70 border border-red-500/15 capitalize"
            >{{ tag.replace(/_/g, ' ') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Trim modal -->
    <Transition name="modal-pop">
      <div
        v-if="trimModal.show"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md"
        @click.self="trimModal.show = false"
      >
        <div class="relative w-[320px] bg-[#111116] border border-white/[0.10] rounded-2xl p-5 shadow-[0_24px_64px_rgba(0,0,0,0.8)]">
          <h3 class="text-sm font-bold text-white mb-4">Trim Clip</h3>
          <div class="space-y-3 mb-4">
            <div>
              <label class="block text-xs text-gray-500 mb-1">Start (seconds)</label>
              <input
                v-model.number="trimModal.startSec"
                type="number"
                :min="0"
                :max="trimModal.endSec - 0.5"
                step="0.5"
                class="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white focus:outline-none focus:border-red-500/30 transition-colors"
              />
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">End (seconds)</label>
              <input
                v-model.number="trimModal.endSec"
                type="number"
                :min="trimModal.startSec + 0.5"
                step="0.5"
                class="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white focus:outline-none focus:border-red-500/30 transition-colors"
              />
            </div>
            <p v-if="trimModal.error" class="text-xs text-red-400">{{ trimModal.error }}</p>
          </div>
          <div class="flex gap-2">
            <button
              :disabled="trimModal.loading"
              class="flex-1 py-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white text-[12px] font-bold transition-all disabled:opacity-50"
              @click="confirmTrim"
            >{{ trimModal.loading ? 'Trimming…' : 'Trim' }}</button>
            <button
              class="flex-1 py-2 rounded-xl text-gray-600 hover:text-gray-400 text-[12px] transition-colors border border-white/[0.07]"
              @click="trimModal.show = false"
            >Cancel</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Upgrade modal -->
    <Transition name="modal-pop">
      <div
        v-if="upgradeModal.show"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md"
        @click.self="upgradeModal.show = false"
      >
        <div class="relative w-[300px] bg-[#111116] border border-white/[0.10] rounded-2xl p-6 text-center shadow-[0_24px_64px_rgba(0,0,0,0.8)] overflow-hidden">
          <!-- Ambient glow -->
          <div class="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 bg-gradient-to-b from-red-500/20 to-transparent blur-2xl pointer-events-none" />
          <div class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />

          <div class="relative">
            <!-- Icon -->
            <div class="relative w-14 h-14 mx-auto mb-4">
              <div class="absolute inset-0 rounded-full bg-gradient-to-br from-red-500/30 to-orange-500/30 blur-xl" />
              <div class="relative w-14 h-14 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/25">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              </div>
            </div>

            <h3 class="text-sm font-bold text-white mb-1.5">Upgrade Required</h3>
            <p class="text-[12px] text-gray-500 mb-5 leading-relaxed">{{ upgradeModal.message }}</p>

            <div class="flex flex-col gap-2">
              <button
                class="w-full py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white text-[12px] font-bold transition-all shadow-lg shadow-red-500/20 hover:shadow-red-500/30"
                @click="openUpgrade"
              >
                View Plans →
              </button>
              <button
                class="w-full py-2 rounded-xl text-gray-600 hover:text-gray-400 text-[12px] transition-colors"
                @click="upgradeModal.show = false"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { ClipRecord } from '../env.d'

const clips = ref<ClipRecord[]>([])
const thumbnails = ref<Record<string, string>>({})
const activeFilter = ref<string>('all')
const playingClip = ref<ClipRecord | null>(null)
const videoEl = ref<HTMLVideoElement | null>(null)
const upgradeModal = ref({ show: false, message: '' })
const uploadingClipId = ref<string | null>(null)
const uploadError = ref<string | null>(null)
const trimModal = ref({ show: false, clipId: '', startSec: 0, endSec: 10, loading: false, error: null as string | null })

const showToast = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const TOAST_DURATION = 3500
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToastMsg(msg: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = msg
  toastType.value = type
  showToast.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { showToast.value = false }, TOAST_DURATION)
}

const filters = [
  { label: 'All', value: 'all' },
  { label: 'Manual', value: 'manual' },
  { label: 'Kills', value: 'kill' },
  { label: 'Multi', value: 'multikill' },
  { label: 'Clutch', value: 'clutch' },
  { label: 'Aces', value: 'ace' }
]

const filteredClips = computed(() => {
  if (activeFilter.value === 'all') return clips.value
  return clips.value.filter(c => c.trigger === activeFilter.value)
})

const removeListener = ref<(() => void) | null>(null)

onMounted(async () => {
  await loadClips()
  removeListener.value = window.api.on('clips:new', async (_ids: unknown) => {
    // clips:new sends an array of newly extracted clip IDs — reload everything
    await loadClips()
  })
})

onUnmounted(() => {
  removeListener.value?.()
})

async function loadClips() {
  try {
    clips.value = await window.api.clips.get()
    for (const clip of clips.value) {
      loadThumbnail(clip.id)
    }
  } catch {
    clips.value = []
  }
}

async function loadThumbnail(id: string) {
  try {
    const dataUrl = await window.api.clips.getThumbnail(id)
    if (dataUrl) thumbnails.value[id] = dataUrl
  } catch { /* ignore */ }
}

function openPlayer(clip: ClipRecord) {
  playingClip.value = clip
}

function closePlayer() {
  if (videoEl.value) {
    videoEl.value.pause()
    videoEl.value.src = ''
  }
  playingClip.value = null
  trimModal.value.show = false
}

function openTrim(clip: ClipRecord) {
  trimModal.value = {
    show: true,
    clipId: clip.id,
    startSec: 0,
    endSec: Math.round(clip.durationSeconds),
    loading: false,
    error: null,
  }
}

async function confirmTrim() {
  const { clipId, startSec, endSec } = trimModal.value
  if (endSec <= startSec) {
    trimModal.value.error = 'End must be after start'
    return
  }
  trimModal.value.loading = true
  trimModal.value.error = null
  try {
    const result = await window.api.clips.trim(clipId, startSec, endSec)
    if (!result.ok) {
      trimModal.value.error = result.error ?? 'Trim failed'
    } else {
      trimModal.value.show = false
      await loadClips()
    }
  } catch (e) {
    trimModal.value.error = e instanceof Error ? e.message : 'Trim failed'
  } finally {
    trimModal.value.loading = false
  }
}

async function deleteClip(id: string) {
  await window.api.clips.delete(id)
  clips.value = clips.value.filter(c => c.id !== id)
  delete thumbnails.value[id]
  if (playingClip.value?.id === id) closePlayer()
}

async function uploadClip(clip: ClipRecord) {
  if (uploadingClipId.value) return
  uploadError.value = null
  uploadingClipId.value = clip.id
  try {
    const result = await window.api.clips.upload(clip.id)
    if (result.needsUpgrade) {
      upgradeModal.value = { show: true, message: result.message ?? 'Upgrade to upload more clips.' }
      return
    }
    if (!result.ok) {
      uploadError.value = result.error ?? 'Upload failed. Check your internet connection.'
      showToastMsg('Upload failed — check your connection', 'error')
      return
    }
    const idx = clips.value.findIndex(c => c.id === clip.id)
    if (idx !== -1) {
      clips.value[idx] = { ...clips.value[idx], uploadStatus: 'uploaded', apiClipId: result.apiClipId ?? null }
    }
    const analysisResult = await window.api.clips.requestAnalysis(clip.id)
    if (analysisResult.needsUpgrade) {
      upgradeModal.value = { show: true, message: analysisResult.message ?? 'Upgrade to get AI coaching on clips.' }
      showToastMsg('Clip uploaded to feed!', 'success')
      return
    }
    if (!analysisResult.ok) {
      uploadError.value = analysisResult.error ?? 'Clip uploaded but analysis request failed.'
      showToastMsg('Clip uploaded — analysis request failed', 'error')
      return
    }
    const idx2 = clips.value.findIndex(c => c.id === clip.id)
    if (idx2 !== -1) clips.value[idx2] = { ...clips.value[idx2], analysisStatus: 'queued' }
    showToastMsg('Clip uploaded & analysis queued!', 'success')
  } finally {
    uploadingClipId.value = null
  }
}

function openUpgrade() {
  upgradeModal.value.show = false
  window.open('https://upforge.gg/pricing', '_blank')
}

async function shareClip(clip: ClipRecord) {
  const result = await window.api.clips.share(clip.id)
  if (result.ok && result.shareToken) {
    const url = `https://upforge.gg/clips/${result.shareToken}`
    await navigator.clipboard.writeText(url)
    showToastMsg('Share link copied to clipboard!', 'success')
  } else {
    showToastMsg('Failed to generate share link', 'error')
  }
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function defaultTitle(clip: ClipRecord): string {
  const parts: string[] = []
  if (clip.trigger === 'ace') parts.push('ACE')
  else if (clip.trigger === 'multikill') parts.push(`${clip.killCount ?? 'Multi'}-K Clip`)
  else if (clip.trigger === 'clutch') parts.push('Clutch')
  else if (clip.trigger === 'kill') parts.push('Kill Clip')
  else if (clip.trigger === 'hotkey') parts.push('Bookmarked Clip')
  else parts.push('Clip')
  if (clip.agent) parts.push(`— ${clip.agent}`)
  if (clip.map) parts.push(`on ${clip.map}`)
  return parts.join(' ')
}

function triggerClass(trigger: string): string {
  switch (trigger) {
    case 'ace': return 'bg-yellow-500/80 text-black'
    case 'multikill': return 'bg-orange-500/80 text-white'
    case 'kill': return 'bg-red-500/80 text-white'
    case 'clutch': return 'bg-purple-500/80 text-white'
    case 'hotkey': return 'bg-blue-500/80 text-white'
    default: return 'bg-gray-700/80 text-gray-300'
  }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
</script>

<style scoped>
.modal-pop-enter-active {
  transition: opacity 0.2s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-pop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.modal-pop-enter-from,
.modal-pop-leave-to {
  opacity: 0;
  transform: scale(0.92) translateY(8px);
}

.toast-slide-enter-active {
  transition: opacity 0.2s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-slide-enter-from,
.toast-slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}
</style>
