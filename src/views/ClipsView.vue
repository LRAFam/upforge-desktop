<template>
  <div class="flex flex-col h-full px-4 pt-3 pb-4 gap-3">
    <!-- Header -->
    <div class="flex items-center justify-between flex-shrink-0">
      <div>
        <h2 class="text-sm font-semibold text-white">Clip Library</h2>
        <p class="text-[11px] text-gray-500 mt-0.5">{{ clips.length }} clip{{ clips.length !== 1 ? 's' : '' }} saved locally</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[10px] text-gray-600">F9 to bookmark during match</span>
      </div>
    </div>

    <!-- Filter row -->
    <div class="flex items-center gap-2 flex-shrink-0">
      <button
        v-for="f in filters"
        :key="f.value"
        class="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
        :class="activeFilter === f.value
          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
          : 'text-gray-500 hover:text-gray-300 border border-transparent'"
        @click="activeFilter = f.value"
      >
        {{ f.label }}
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
        <p class="text-[11px] text-gray-600 mt-0.5">Press F9 during a match to save a moment</p>
      </div>
    </div>

    <!-- Clip grid -->
    <div v-else class="flex-1 overflow-y-auto">
      <div class="grid grid-cols-2 gap-3">
        <div
          v-for="clip in filteredClips"
          :key="clip.id"
          class="group relative bg-white/[0.03] border border-white/[0.06] rounded-lg overflow-hidden cursor-pointer hover:border-white/[0.12] transition-colors"
          @click="openPlayer(clip)"
        >
          <!-- Thumbnail -->
          <div class="relative aspect-video bg-black">
            <img
              v-if="thumbnails[clip.id]"
              :src="thumbnails[clip.id]"
              class="w-full h-full object-cover"
              alt=""
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <svg class="w-8 h-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <!-- Play overlay -->
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <div class="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <svg class="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>
            <!-- Duration badge -->
            <div class="absolute bottom-1.5 right-1.5 bg-black/70 rounded px-1.5 py-0.5 text-[10px] text-gray-300 font-mono">
              {{ formatDuration(clip.durationSeconds) }}
            </div>
            <!-- Trigger badge -->
            <div class="absolute top-1.5 left-1.5">
              <span
                class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
                :class="triggerClass(clip.trigger)"
              >{{ clip.trigger }}</span>
            </div>
          </div>

          <!-- Metadata -->
          <div class="p-2.5">
            <p class="text-[11px] font-medium text-gray-200 truncate">
              {{ clip.title || defaultTitle(clip) }}
            </p>
            <div class="flex items-center gap-1.5 mt-1">
              <span v-if="clip.map" class="text-[10px] text-gray-500">{{ clip.map }}</span>
              <span v-if="clip.agent" class="text-[10px] text-gray-600">·</span>
              <span v-if="clip.agent" class="text-[10px] text-gray-500">{{ clip.agent }}</span>
              <span class="ml-auto text-[10px] text-gray-600">{{ timeAgo(clip.savedAt) }}</span>
            </div>
            <!-- AI coaching tip -->
            <div v-if="clip.suggestion" class="mt-2 p-1.5 bg-orange-500/10 border border-orange-500/20 rounded text-[10px] text-orange-300/80">
              💡 {{ clip.suggestion }}
            </div>
            <div v-else-if="clip.analysisStatus === 'queued' || clip.analysisStatus === 'processing'" class="mt-2 flex items-center gap-1 text-[10px] text-gray-600">
              <span class="w-1 h-1 rounded-full bg-gray-600 animate-pulse" />
              Analysing...
            </div>
          </div>

          <!-- Action buttons (hover) -->
          <div
            class="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1"
            @click.stop
          >
            <button
              class="w-6 h-6 rounded bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 transition-colors"
              title="Upload & Analyse"
              @click="uploadClip(clip)"
            >
              <svg class="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
            </button>
            <button
              class="w-6 h-6 rounded bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-red-500/60 transition-colors"
              title="Delete"
              @click="deleteClip(clip.id)"
            >
              <svg class="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 001-1h4a1 1 0 001 1m-7 0h8"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Video player modal -->
    <div
      v-if="playingClip"
      class="fixed inset-0 z-50 bg-black/90 flex flex-col"
      @click.self="closePlayer"
    >
      <div class="flex items-center justify-between px-4 py-2 flex-shrink-0">
        <p class="text-sm font-medium text-white">{{ playingClip.title || defaultTitle(playingClip) }}</p>
        <div class="flex items-center gap-2">
          <button
            v-if="playingClip.uploadStatus === 'uploaded'"
            class="px-3 py-1 text-[11px] bg-white/10 hover:bg-white/20 text-gray-300 rounded transition-colors"
            @click="shareClip(playingClip)"
          >
            Share
          </button>
          <button
            v-else
            class="px-3 py-1 text-[11px] bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded transition-colors"
            @click="uploadClip(playingClip)"
          >
            Upload & Analyse
          </button>
          <button class="text-gray-500 hover:text-white transition-colors" @click="closePlayer">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <div v-if="playingClip.suggestion" class="px-4 py-2 bg-orange-500/10 border-t border-orange-500/20 flex-shrink-0">
        <p class="text-[11px] text-orange-300/80">💡 <strong>AI Coaching:</strong> {{ playingClip.suggestion }}</p>
      </div>
    </div>
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
}

async function deleteClip(id: string) {
  await window.api.clips.delete(id)
  clips.value = clips.value.filter(c => c.id !== id)
  delete thumbnails.value[id]
  if (playingClip.value?.id === id) closePlayer()
}

async function uploadClip(clip: ClipRecord) {
  const result = await window.api.clips.upload(clip.id)
  if (result.ok) {
    const idx = clips.value.findIndex(c => c.id === clip.id)
    if (idx !== -1) {
      clips.value[idx] = { ...clips.value[idx], uploadStatus: 'uploaded', apiClipId: result.apiClipId ?? null }
    }
    await window.api.clips.requestAnalysis(clip.id)
    const idx2 = clips.value.findIndex(c => c.id === clip.id)
    if (idx2 !== -1) clips.value[idx2] = { ...clips.value[idx2], analysisStatus: 'queued' }
  }
}

async function shareClip(clip: ClipRecord) {
  const result = await window.api.clips.share(clip.id)
  if (result.ok && result.shareToken) {
    const url = `https://upforge.gg/clips/${result.shareToken}`
    await navigator.clipboard.writeText(url)
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
