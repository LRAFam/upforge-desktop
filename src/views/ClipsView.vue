<template>
  <div class="flex flex-col h-full px-4 pt-3 pb-4 gap-3 bg-[#0a0a0a]">
    <!-- Header -->
    <div class="flex items-start justify-between gap-3 flex-shrink-0">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold text-white">Clip Library</h2>
          <span class="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-400">{{ clips.length }}</span>
        </div>
        <p class="mt-0.5 text-xs text-gray-500">Review saved moments, upload the best ones, and keep key plays organized.</p>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex items-center rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
          <button
            class="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
            :class="viewMode === 'grid' ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'"
            title="Grid view"
            @click="viewMode = 'grid'"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4.75 5.75h5.5v5.5h-5.5zM13.75 5.75h5.5v5.5h-5.5zM4.75 14.75h5.5v5.5h-5.5zM13.75 14.75h5.5v5.5h-5.5z" />
            </svg>
          </button>
          <button
            class="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
            :class="viewMode === 'list' ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'"
            title="List view"
            @click="viewMode = 'list'"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 6.75h12M8 12h12M8 17.25h12M4.75 6.75h.5M4.75 12h.5M4.75 17.25h.5" />
            </svg>
          </button>
        </div>
        <span class="text-xs text-gray-600">F9 to bookmark during match</span>
      </div>
    </div>

    <!-- Filter row -->
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-[#0c0c0c] px-3 py-2.5 flex-shrink-0">
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="f in filters"
          :key="f.value"
          class="rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150"
          :class="activeFilter === f.value
            ? 'border-red-500/30 bg-red-500/20 text-red-400'
            : 'border-white/[0.06] text-gray-500 hover:border-white/[0.12] hover:text-gray-300'"
          @click="activeFilter = f.value"
        >
          {{ f.label }}
        </button>
      </div>
      <div class="flex items-center gap-2">
        <label class="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-600">Sort</label>
        <select
          v-model="sortOrder"
          class="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-200 outline-none transition-colors focus:border-red-500/30"
        >
          <option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </div>
    </div>

    <!-- Toast notification -->
    <Transition name="toast-slide">
      <div
        v-if="showToast"
        class="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-xl backdrop-blur-md pointer-events-none"
        :class="toastType === 'success'
          ? 'border-green-500/30 bg-green-500/15'
          : 'border-red-500/30 bg-red-500/15'"
      >
        <svg v-if="toastType === 'success'" class="h-3.5 w-3.5 flex-shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
        <svg v-else class="h-3.5 w-3.5 flex-shrink-0 text-red-400" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        <span class="text-xs font-semibold text-white">{{ toastMessage }}</span>
      </div>
    </Transition>

    <!-- Upload error banner -->
    <div
      v-if="uploadError"
      class="flex flex-shrink-0 items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2"
    >
      <svg class="h-3.5 w-3.5 flex-shrink-0 text-red-400" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>
      <p class="flex-1 text-xs text-red-400">{{ uploadError }}</p>
      <button class="text-red-400/60 transition-colors hover:text-red-400" @click="uploadError = null">
        <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="displayedClips.length === 0" class="flex flex-1 items-center justify-center">
      <div class="max-w-sm rounded-3xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.02] px-8 py-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
        <div class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-red-500/20 via-orange-500/15 to-transparent ring-1 ring-red-500/20 ring-offset-4 ring-offset-[#0a0a0a]">
          <div class="flex h-14 w-14 items-center justify-center rounded-full bg-[#111111]">
            <svg class="h-7 w-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M4 7.75A1.75 1.75 0 015.75 6h7.5A1.75 1.75 0 0115 7.75v8.5A1.75 1.75 0 0113.25 18h-7.5A1.75 1.75 0 014 16.25v-8.5z" />
            </svg>
          </div>
        </div>
        <div class="mt-5 space-y-2">
          <h3 class="text-lg font-semibold text-white">No clips saved yet</h3>
          <p class="text-sm leading-relaxed text-gray-400">Bookmark important rounds, clutch attempts, or mistakes as they happen so your best review moments are ready after the match.</p>
        </div>
        <div class="mt-5 rounded-2xl border border-white/[0.06] bg-black/30 px-4 py-3 text-left">
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Quick tip</p>
          <p class="mt-1 text-xs text-gray-400">Press <span class="rounded-md border border-white/[0.12] bg-white/[0.04] px-1.5 py-0.5 font-mono text-gray-200">F9</span> during a match to create a clip, then return here to trim, upload, and review it.</p>
        </div>
      </div>
    </div>

    <!-- Clip collection -->
    <div v-else class="flex-1 overflow-y-auto">
      <div v-if="viewMode === 'grid'" class="grid grid-cols-2 gap-3">
        <div
          v-for="clip in displayedClips"
          :key="clip.id"
          class="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] transition-all hover:border-white/[0.14] hover:bg-white/[0.04]"
          @click="openPlayer(clip)"
        >
          <div class="relative bg-black" style="min-height: 72px; aspect-ratio: 16/9;">
            <img
              v-if="thumbnails[clip.id]"
              :src="thumbnails[clip.id]"
              class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              alt=""
            />
            <div v-else class="flex h-full w-full items-center justify-center bg-[#060606]">
              <svg class="h-8 w-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-200 group-hover:opacity-100">
              <div class="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-black/45 backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
                <svg class="ml-0.5 h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
            <div class="absolute left-2 top-2 flex items-center gap-2">
              <span class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] shadow-lg backdrop-blur-sm" :class="triggerClass(clip.trigger)">
                <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" :d="triggerIconPath(clip.trigger)" />
                </svg>
                {{ triggerLabel(clip.trigger) }}
              </span>
            </div>
            <div class="absolute bottom-2 left-2">
              <span class="rounded-full border border-white/15 bg-black/70 px-2 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur-sm">{{ formatDuration(clip.durationSeconds) }}</span>
            </div>
            <div v-if="clip.suggestion" class="absolute right-2 top-2">
              <span class="inline-flex items-center gap-1 rounded-full bg-orange-500/80 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
                <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M11.25 3.75h1.5M12 17.25v3m6-8.25a6 6 0 10-12 0c0 2.204 1.04 3.416 2.25 4.5h7.5C16.96 15.416 18 14.204 18 12zM9.75 20.25h4.5" />
                </svg>
                AI
              </span>
            </div>
            <div class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/85 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div class="absolute inset-x-0 bottom-0 flex items-end justify-end gap-2 p-2 opacity-0 transition-all duration-200 group-hover:opacity-100" @click.stop>
              <button
                :disabled="!!uploadingClipId"
                class="flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold backdrop-blur-sm transition-colors"
                :class="uploadingClipId === clip.id
                  ? 'cursor-wait border-red-500/20 bg-red-500/10 text-red-400/60'
                  : 'border-red-500/25 bg-red-500/15 text-red-400 hover:border-red-500/40 hover:bg-red-500/25'"
                @click="uploadClip(clip)"
              >
                <svg v-if="uploadingClipId !== clip.id" class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                <svg v-else class="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                {{ uploadingClipId === clip.id ? 'Uploading…' : 'Upload' }}
              </button>
              <template v-if="confirmDeleteId === clip.id">
                <button class="flex h-8 items-center rounded-xl bg-red-500 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-red-400" @click="deleteClip(clip.id)">Confirm</button>
                <button class="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-black/55 text-gray-300 transition-colors hover:border-white/20 hover:text-white" @click="confirmDeleteId = null">
                  <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </template>
              <button
                v-else
                class="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-black/55 text-gray-300 transition-colors hover:border-red-500/30 hover:bg-red-500/20 hover:text-red-300"
                @click="confirmDeleteId = clip.id"
              >
                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 001-1h4a1 1 0 001 1m-7 0h8"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="space-y-2 p-3">
            <div class="flex items-start justify-between gap-2">
              <p class="min-w-0 flex-1 truncate text-sm font-semibold text-gray-100">{{ clip.title || defaultTitle(clip) }}</p>
              <span class="text-[11px] text-gray-600">{{ timeAgo(clip.savedAt) }}</span>
            </div>
            <div class="flex items-center gap-2 text-xs text-gray-500">
              <span v-if="clip.map">{{ clip.map }}</span>
              <span v-if="clip.map && clip.agent" class="text-gray-700">•</span>
              <span v-if="clip.agent">{{ clip.agent }}</span>
            </div>
            <div v-if="clip.suggestion" class="flex items-start gap-2 rounded-xl border border-orange-500/15 bg-orange-500/10 p-2 text-xs text-orange-200/85">
              <svg class="mt-0.5 h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 18h6M10 22h4M8.91 14c-.79-.87-1.41-1.86-1.41-4a4.5 4.5 0 119 0c0 2.14-.62 3.13-1.41 4" />
              </svg>
              <span class="line-clamp-2">{{ clip.suggestion }}</span>
            </div>
            <div v-if="clip.coachingTags?.length" class="flex flex-wrap gap-1">
              <span
                v-for="tag in clip.coachingTags.slice(0, 3)"
                :key="tag"
                class="rounded-full border border-red-500/15 bg-red-500/10 px-1.5 py-px text-[8px] font-semibold capitalize text-red-400/70"
              >{{ tag.replace(/_/g, ' ') }}</span>
            </div>
            <div v-else-if="clip.analysisStatus === 'queued' || clip.analysisStatus === 'processing'" class="flex items-center gap-1 text-xs text-gray-600">
              <span class="h-1 w-1 rounded-full bg-gray-600 animate-pulse" />
              Analysing...
            </div>
          </div>
        </div>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="clip in displayedClips"
          :key="clip.id"
          class="group flex cursor-pointer gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 transition-all hover:border-white/[0.14] hover:bg-white/[0.04]"
          @click="openPlayer(clip)"
        >
          <div class="relative w-56 flex-shrink-0 overflow-hidden rounded-xl bg-black" style="aspect-ratio: 16/9;">
            <img
              v-if="thumbnails[clip.id]"
              :src="thumbnails[clip.id]"
              class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              alt=""
            />
            <div v-else class="flex h-full w-full items-center justify-center bg-[#060606]">
              <svg class="h-8 w-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <div class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <div class="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/45 backdrop-blur-md">
                <svg class="ml-0.5 h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              </div>
            </div>
            <div class="absolute left-2 top-2">
              <span class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] shadow-lg backdrop-blur-sm" :class="triggerClass(clip.trigger)">
                <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" :d="triggerIconPath(clip.trigger)" />
                </svg>
                {{ triggerLabel(clip.trigger) }}
              </span>
            </div>
            <div class="absolute bottom-2 left-2">
              <span class="rounded-full border border-white/15 bg-black/70 px-2 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur-sm">{{ formatDuration(clip.durationSeconds) }}</span>
            </div>
          </div>
          <div class="flex min-w-0 flex-1 flex-col justify-between gap-3">
            <div class="space-y-2">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-white">{{ clip.title || defaultTitle(clip) }}</p>
                  <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>{{ timeAgo(clip.savedAt) }}</span>
                    <span v-if="clip.map" class="text-gray-700">•</span>
                    <span v-if="clip.map">{{ clip.map }}</span>
                    <span v-if="clip.agent" class="text-gray-700">•</span>
                    <span v-if="clip.agent">{{ clip.agent }}</span>
                  </div>
                </div>
                <div v-if="clip.suggestion" class="rounded-full bg-orange-500/10 px-2 py-1 text-[10px] font-semibold text-orange-300">AI Tip</div>
              </div>
              <div v-if="clip.suggestion" class="rounded-xl border border-orange-500/15 bg-orange-500/10 p-3 text-xs leading-relaxed text-orange-200/85">{{ clip.suggestion }}</div>
              <div v-if="clip.coachingTags?.length" class="flex flex-wrap gap-1">
                <span
                  v-for="tag in clip.coachingTags.slice(0, 4)"
                  :key="tag"
                  class="rounded-full border border-red-500/15 bg-red-500/10 px-1.5 py-px text-[8px] font-semibold capitalize text-red-400/70"
                >{{ tag.replace(/_/g, ' ') }}</span>
              </div>
              <div v-else-if="clip.analysisStatus === 'queued' || clip.analysisStatus === 'processing'" class="flex items-center gap-1 text-xs text-gray-600">
                <span class="h-1 w-1 rounded-full bg-gray-600 animate-pulse" />
                Analysing...
              </div>
            </div>
            <div class="flex items-center justify-end gap-2" @click.stop>
              <button
                :disabled="!!uploadingClipId"
                class="flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors"
                :class="uploadingClipId === clip.id
                  ? 'cursor-wait border-red-500/20 bg-red-500/10 text-red-400/60'
                  : 'border-red-500/25 bg-red-500/15 text-red-400 hover:border-red-500/40 hover:bg-red-500/25'"
                @click="uploadClip(clip)"
              >
                <svg v-if="uploadingClipId !== clip.id" class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                <svg v-else class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                {{ uploadingClipId === clip.id ? 'Uploading…' : 'Upload & Analyse' }}
              </button>
              <template v-if="confirmDeleteId === clip.id">
                <button class="flex h-9 items-center rounded-xl bg-red-500 px-3 text-xs font-semibold text-white transition-colors hover:bg-red-400" @click="deleteClip(clip.id)">Confirm delete</button>
                <button class="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gray-400 transition-colors hover:border-white/[0.14] hover:text-white" @click="confirmDeleteId = null">
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </template>
              <button
                v-else
                class="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-gray-400 transition-colors hover:border-red-500/30 hover:bg-red-500/15 hover:text-red-300"
                @click="confirmDeleteId = clip.id"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 001-1h4a1 1 0 001 1m-7 0h8"/>
                </svg>
              </button>
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
          <!-- Editable title -->
          <div v-if="editingTitle" class="flex items-center gap-1.5">
            <input
              ref="titleInputEl"
              v-model="titleInputValue"
              class="flex-1 min-w-0 bg-white/[0.06] border border-white/[0.15] rounded px-2 py-0.5 text-xs font-semibold text-white focus:outline-none focus:border-red-500/40 transition-colors"
              maxlength="80"
              @keydown.enter="saveTitleEdit"
              @keydown.escape="cancelTitleEdit"
              @blur="saveTitleEdit"
            />
            <button class="text-gray-600 hover:text-gray-400 transition-colors" @mousedown.prevent="cancelTitleEdit">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div v-else class="flex items-center gap-1.5 group/title">
            <p class="text-xs font-semibold text-white truncate">{{ playingClip.title || defaultTitle(playingClip) }}</p>
            <button
              class="opacity-0 group-hover/title:opacity-100 transition-opacity text-gray-600 hover:text-gray-300 flex-shrink-0"
              title="Rename clip"
              @click="startTitleEdit"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
            </button>
          </div>
          <p v-if="playingClip.trigger" class="text-xs text-gray-600 mt-0.5 capitalize">{{ playingClip.trigger }} clip · <span class="font-mono">{{ formatDuration(playingClip.durationSeconds) }}</span></p>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-white hover:bg-white/[0.07] transition-colors"
            title="Fullscreen (F)"
            @click="videoEl?.requestFullscreen()"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V6a2 2 0 012-2h2M4 16v2a2 2 0 002 2h2m8-16h2a2 2 0 012 2v2m0 8v2a2 2 0 01-2 2h-2"/>
            </svg>
          </button>
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
        :src="toFileUrl(playingClip.path)"
      />
      <div class="flex items-center justify-center gap-4 px-4 py-1.5 bg-black/40 border-t border-white/[0.04] flex-shrink-0">
        <span class="text-[9px] text-gray-700">Space: Play/Pause</span>
        <span class="text-[9px] text-gray-700">← →: Skip 5s</span>
        <span class="text-[9px] text-gray-700">F: Fullscreen</span>
        <span class="text-[9px] text-gray-700">Esc: Close</span>
      </div>
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
        <div class="relative w-[380px] bg-[#111116] border border-white/[0.10] rounded-2xl p-5 shadow-[0_24px_64px_rgba(0,0,0,0.8)]">
          <h3 class="text-sm font-bold text-white mb-1">Trim Clip</h3>
          <p class="text-xs text-gray-500 mb-4">Original duration: <span class="text-gray-400 font-mono">{{ formatDuration(trimModal.duration, true) }}</span> · New duration: <span class="text-red-400 font-mono">{{ formatDuration(trimModal.endSec - trimModal.startSec, true) }}</span></p>

          <!-- Trim range visual bar -->
          <div class="relative h-8 mb-4 bg-white/[0.04] rounded-lg overflow-hidden border border-white/[0.06]">
            <!-- Kept region highlight -->
            <div
              class="absolute top-0 bottom-0 bg-red-500/20 border-x border-red-500/40 transition-all"
              :style="{
                left: (trimModal.startSec / trimModal.duration * 100) + '%',
                width: ((trimModal.endSec - trimModal.startSec) / trimModal.duration * 100) + '%'
              }"
            />
            <!-- Start handle label -->
            <div
              class="absolute top-1 text-[9px] font-mono text-red-400 pointer-events-none"
              :style="{ left: 'calc(' + (trimModal.startSec / trimModal.duration * 100) + '% + 4px)' }"
            >{{ formatDuration(trimModal.startSec, true) }}</div>
            <!-- End handle label -->
            <div
              class="absolute top-1 text-[9px] font-mono text-red-400 pointer-events-none"
              :style="{ right: 'calc(' + ((1 - trimModal.endSec / trimModal.duration) * 100) + '% + 4px)' }"
            >{{ formatDuration(trimModal.endSec, true) }}</div>
          </div>

          <div class="space-y-3 mb-4">
            <!-- Start slider -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs text-gray-500">Start</label>
                <div class="flex items-center gap-1">
                  <button
                    class="w-5 h-5 rounded bg-white/[0.05] hover:bg-white/[0.10] text-gray-400 text-xs flex items-center justify-center transition-colors"
                    @click="trimModal.startSec = Math.round(Math.max(0, trimModal.startSec - 0.1) * 10) / 10"
                  >−</button>
                  <span class="text-xs font-mono text-white w-16 text-center">{{ formatDuration(trimModal.startSec, true) }}</span>
                  <button
                    class="w-5 h-5 rounded bg-white/[0.05] hover:bg-white/[0.10] text-gray-400 text-xs flex items-center justify-center transition-colors"
                    @click="trimModal.startSec = Math.round(Math.min(trimModal.endSec - 0.5, trimModal.startSec + 0.1) * 10) / 10"
                  >+</button>
                </div>
              </div>
              <input
                v-model.number="trimModal.startSec"
                type="range"
                :min="0"
                :max="trimModal.endSec - 0.5"
                step="0.1"
                class="w-full h-1 appearance-none bg-white/[0.08] rounded-full outline-none accent-red-500 cursor-pointer"
              />
            </div>
            <!-- End slider -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs text-gray-500">End</label>
                <div class="flex items-center gap-1">
                  <button
                    class="w-5 h-5 rounded bg-white/[0.05] hover:bg-white/[0.10] text-gray-400 text-xs flex items-center justify-center transition-colors"
                    @click="trimModal.endSec = Math.round(Math.max(trimModal.startSec + 0.5, trimModal.endSec - 0.1) * 10) / 10"
                  >−</button>
                  <span class="text-xs font-mono text-white w-16 text-center">{{ formatDuration(trimModal.endSec, true) }}</span>
                  <button
                    class="w-5 h-5 rounded bg-white/[0.05] hover:bg-white/[0.10] text-gray-400 text-xs flex items-center justify-center transition-colors"
                    @click="trimModal.endSec = Math.round(Math.min(trimModal.duration, trimModal.endSec + 0.1) * 10) / 10"
                  >+</button>
                </div>
              </div>
              <input
                v-model.number="trimModal.endSec"
                type="range"
                :min="trimModal.startSec + 0.5"
                :max="trimModal.duration"
                step="0.1"
                class="w-full h-1 appearance-none bg-white/[0.08] rounded-full outline-none accent-red-500 cursor-pointer"
              />
            </div>
            <p v-if="trimModal.error" class="text-xs text-red-400">{{ trimModal.error }}</p>
          </div>
          <div class="flex gap-2">
            <button
              :disabled="trimModal.loading"
              class="flex-1 py-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white text-[12px] font-bold transition-all disabled:opacity-50"
              @click="confirmTrim"
            >{{ trimModal.loading ? 'Trimming…' : 'Trim Clip' }}</button>
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
const trimModal = ref({ show: false, clipId: '', startSec: 0, endSec: 10, duration: 10, loading: false, error: null as string | null })

// Title editing state
const editingTitle = ref(false)
const titleInputValue = ref('')
const titleInputEl = ref<HTMLInputElement | null>(null)

const showToast = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
const TOAST_DURATION = 3500
let toastTimer: ReturnType<typeof setTimeout> | null = null
const confirmDeleteId = ref<string | null>(null)

/** Convert a local filesystem path to a valid file:// URL.
 *  encodeURI preserves : and / so Windows drive letters and path separators
 *  are kept intact, while spaces and other special chars are percent-encoded. */
function toFileUrl(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.startsWith('/')
    ? encodeURI(`file://${normalized}`)    // macOS/Linux: /path → file:///path
    : encodeURI(`file:///${normalized}`)   // Windows:   C:/path → file:///C:/path
}

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

const sortOptions = [
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
  { label: 'Longest duration', value: 'duration' }
] as const

const sortOrder = ref<(typeof sortOptions)[number]['value']>('newest')
const viewMode = ref<'grid' | 'list'>('grid')

const filteredClips = computed(() => {
  if (activeFilter.value === 'all') return clips.value
  return clips.value.filter(c => c.trigger === activeFilter.value)
})

const displayedClips = computed(() => {
  return filteredClips.value.slice().sort((a, b) => {
    if (sortOrder.value === 'oldest') return a.savedAt - b.savedAt
    if (sortOrder.value === 'duration') return b.durationSeconds - a.durationSeconds
    return b.savedAt - a.savedAt
  })
})

const removeListener = ref<(() => void) | null>(null)

onMounted(async () => {
  await loadClips()
  removeListener.value = window.api.on('clips:new', async (_ids: unknown) => {
    // clips:new sends an array of newly extracted clip IDs — reload everything
    await loadClips()
  })
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  removeListener.value?.()
  window.removeEventListener('keydown', handleKeyDown)
})

function handleKeyDown(e: KeyboardEvent) {
  if (!playingClip.value) return
  if (trimModal.value.show) return
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

  switch (e.key) {
    case 'Escape':
      closePlayer()
      break
    case ' ':
      e.preventDefault()
      toggleModalPlay()
      break
    case 'ArrowLeft':
      e.preventDefault()
      if (videoEl.value) videoEl.value.currentTime = Math.max(0, videoEl.value.currentTime - 5)
      break
    case 'ArrowRight':
      e.preventDefault()
      if (videoEl.value) {
        const dur = videoEl.value.duration || 0
        videoEl.value.currentTime = Math.min(dur, videoEl.value.currentTime + 5)
      }
      break
    case 'f':
    case 'F':
      e.preventDefault()
      videoEl.value?.requestFullscreen()
      break
  }
}

function toggleModalPlay() {
  if (!videoEl.value) return
  if (videoEl.value.paused) videoEl.value.play().catch(e => {
    if (e.name !== 'AbortError') console.error('[Clips] play() failed:', e)
  })
  else videoEl.value.pause()
}

// Title editing
function startTitleEdit() {
  if (!playingClip.value) return
  editingTitle.value = true
  titleInputValue.value = playingClip.value.title || defaultTitle(playingClip.value)
  // Focus input on next tick
  setTimeout(() => titleInputEl.value?.select(), 50)
}

function cancelTitleEdit() {
  editingTitle.value = false
  titleInputValue.value = ''
}

async function saveTitleEdit() {
  if (!playingClip.value || !editingTitle.value) return
  const newTitle = titleInputValue.value.trim()
  editingTitle.value = false
  if (!newTitle || newTitle === (playingClip.value.title || defaultTitle(playingClip.value))) return

  try {
    await window.api.clips.updateTitle(playingClip.value.id, newTitle)
    const idx = clips.value.findIndex(c => c.id === playingClip.value!.id)
    if (idx !== -1) clips.value[idx] = { ...clips.value[idx], title: newTitle }
    playingClip.value = { ...playingClip.value, title: newTitle }
    showToastMsg('Clip renamed', 'success')
  } catch {
    showToastMsg('Failed to rename clip', 'error')
  }
}

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
  editingTitle.value = false
  titleInputValue.value = ''
}

function openTrim(clip: ClipRecord) {
  trimModal.value = {
    show: true,
    clipId: clip.id,
    startSec: 0,
    endSec: Math.round(clip.durationSeconds),
    duration: clip.durationSeconds,
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
      // Refresh thumbnail for trimmed clip
      delete thumbnails.value[clipId]
      await loadThumbnail(clipId)
      showToastMsg('Clip trimmed successfully', 'success')
    }
  } catch (e) {
    trimModal.value.error = e instanceof Error ? e.message : 'Trim failed'
  } finally {
    trimModal.value.loading = false
  }
}

async function deleteClip(id: string) {
  confirmDeleteId.value = null
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

function formatDuration(secs: number, precise = false): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  if (precise) {
    return `${m}:${Math.floor(s).toString().padStart(2, '0')}.${Math.round((s % 1) * 10)}`
  }
  return `${m}:${Math.floor(s).toString().padStart(2, '0')}`
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
    case 'ace': return 'bg-yellow-500/85 text-black'
    case 'multikill': return 'bg-orange-500/85 text-white'
    case 'kill': return 'bg-red-500/85 text-white'
    case 'death': return 'bg-rose-500/85 text-white'
    case 'assist': return 'bg-emerald-500/85 text-white'
    case 'clutch': return 'bg-purple-500/85 text-white'
    case 'hotkey':
    case 'manual': return 'bg-blue-500/85 text-white'
    default: return 'bg-gray-700/85 text-gray-300'
  }
}

function triggerLabel(trigger: string): string {
  switch (trigger) {
    case 'multikill': return 'Multi'
    case 'hotkey': return 'Bookmark'
    case 'manual': return 'Manual'
    default: return trigger
  }
}

function triggerIconPath(trigger: string): string {
  switch (trigger) {
    case 'kill':
      return 'M12 3v3m0 12v3m9-9h-3M6 12H3m15.364 6.364-2.122-2.122M7.757 7.757 5.636 5.636m12.728 0-2.122 2.121M7.757 16.243l-2.121 2.121M12 15.25a3.25 3.25 0 100-6.5 3.25 3.25 0 000 6.5z'
    case 'death':
      return 'M9.75 9.75l4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
    case 'assist':
      return 'M15 19.128a9.38 9.38 0 002.625.372c1.035 0 2.03-.166 2.962-.472M8.625 6.75a2.625 2.625 0 115.25 0 2.625 2.625 0 01-5.25 0zM4.5 19.5a4.5 4.5 0 119 0v.128a12.04 12.04 0 01-9 0V19.5z'
    case 'ace':
      return 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442a.562.562 0 01.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61L12.27 17.77a.563.563 0 00-.54 0l-4.747 2.77a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345l2.125-5.111z'
    case 'clutch':
      return 'M9 12.75 11.25 15 15 9.75M12 3.75l7.5 3v5.25c0 4.142-2.657 7.884-6.596 9.287a2.25 2.25 0 01-1.808 0C7.157 19.884 4.5 16.142 4.5 12V6.75l7.5-3z'
    case 'multikill':
      return 'M13.5 4.5 21 12l-7.5 7.5M3 12h17.25'
    case 'hotkey':
    case 'manual':
      return 'M17.25 6.75v10.563c0 .621-.504 1.124-1.125 1.124-.224 0-.444-.067-.631-.192L12 15.75l-3.494 2.495a1.125 1.125 0 01-1.756-.932V6.75c0-.621.504-1.125 1.125-1.125h8.25c.621 0 1.125.504 1.125 1.125z'
    default:
      return 'M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z'
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
