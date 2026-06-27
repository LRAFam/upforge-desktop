<script setup lang="ts">
withDefaults(defineProps<{
  artUrl: string
  mapUrl?: string | null
  /** default = active flow, muted = error/refund, vivid = map-forward, reveal = score ready */
  tone?: 'default' | 'muted' | 'vivid' | 'reveal'
}>(), {
  tone: 'default',
})
</script>

<template>
  <div class="absolute inset-0 pointer-events-none overflow-hidden">
    <img
      :src="artUrl"
      alt=""
      class="absolute inset-0 h-full w-full object-cover"
      :class="tone === 'muted' ? 'opacity-75' : 'opacity-95'"
    />
    <img
      v-if="mapUrl"
      :src="mapUrl"
      alt=""
      class="absolute inset-0 h-full w-full object-cover scale-105 mix-blend-soft-light"
      :class="tone === 'muted' ? 'opacity-25 grayscale-[0.35]' : tone === 'vivid' ? 'opacity-45' : 'opacity-35'"
    />
    <div
      class="absolute inset-0"
      :class="tone === 'muted'
        ? 'bg-gradient-to-t from-[#111111] via-[#111111]/94 to-[#111111]/72'
        : 'bg-gradient-to-t from-[#111111] via-[#111111]/88 to-[#111111]/45'"
    />
    <div
      class="absolute inset-0"
      :class="tone === 'reveal'
        ? 'bg-[radial-gradient(ellipse_at_50%_0%,rgba(34,197,94,0.14),transparent_58%)]'
        : 'bg-[radial-gradient(ellipse_at_20%_100%,rgba(255,70,85,0.12),transparent_55%)]'"
    />
  </div>
</template>
