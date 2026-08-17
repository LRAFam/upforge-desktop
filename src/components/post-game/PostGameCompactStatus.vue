<script setup lang="ts">
defineProps<{
  tone: 'active' | 'paused' | 'success' | 'error' | 'neutral'
  eyebrow: string
  title: string
  body: string
  progress: number | null
  status: string | null
  timing: string | null
  primaryLabel: string
  showExpectations: boolean
}>()

defineEmits<{
  primary: []
  close: []
}>()
</script>

<template>
  <section class="w-full rounded-xl border border-white/[0.10] bg-[#171717] p-4 text-left shadow-xl">
    <div class="flex items-start gap-3">
      <span
        class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
        :class="{
          'bg-blue-400 animate-pulse': tone === 'active',
          'bg-amber-400': tone === 'paused',
          'bg-emerald-400': tone === 'success',
          'bg-red-400': tone === 'error',
          'bg-gray-500': tone === 'neutral',
        }"
      />
      <div class="min-w-0 flex-1">
        <p class="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500">{{ eyebrow }}</p>
        <h1 class="mt-1 text-base font-bold leading-tight text-white">{{ title }}</h1>
        <p class="mt-1 text-[11px] leading-relaxed text-gray-400">{{ body }}</p>
      </div>
      <button
        type="button"
        class="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white"
        title="Close"
        @click="$emit('close')"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div v-if="progress != null" class="mt-3">
      <div class="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          class="h-full rounded-full bg-blue-400 transition-[width] duration-300"
          :style="{ width: `${Math.max(3, Math.min(100, progress))}%` }"
        />
      </div>
      <div class="mt-1.5 flex items-center justify-between gap-3 text-[10px] text-gray-500">
        <span>{{ status }}</span>
        <span class="shrink-0 tabular-nums">{{ progress }}%<template v-if="timing"> · {{ timing }}</template></span>
      </div>
    </div>

    <div v-if="showExpectations" class="mt-3 border-t border-white/[0.07] pt-3">
      <p class="text-[11px] leading-relaxed text-gray-400">
        Analysis usually takes 20–30 minutes. We will email you when the report is ready.
      </p>
      <p class="mt-1 text-[10px] leading-relaxed text-gray-500">
        Uploads and local video processing pause during matches to protect FPS and network performance. Server analysis can continue safely.
      </p>
    </div>

    <div class="mt-3 flex gap-2">
      <button
        type="button"
        class="flex-1 rounded-lg bg-[#ff4655] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#e93d4b]"
        @click="$emit('primary')"
      >
        {{ primaryLabel }}
      </button>
      <button
        type="button"
        class="rounded-lg border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-xs font-semibold text-gray-300 transition-colors hover:bg-white/[0.07] hover:text-white"
        @click="$emit('close')"
      >
        Dismiss
      </button>
    </div>
  </section>
</template>
