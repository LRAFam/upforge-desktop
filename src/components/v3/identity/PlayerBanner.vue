<script setup lang="ts">
/**
 * Wide player-card art as a scrimmed band behind a profile block (default slot). Rulebook "one
 * image, used big": use at most once per screen, and not on a screen that already has a hero.
 * With no banner it renders the slot on the plain page with no box, so nothing pretends to be art.
 */
defineProps<{ src: string | null }>()
</script>

<template>
  <div class="pb" :class="{ 'has-art': !!src }">
    <img v-if="src" :src="src" alt="" class="pb-art" decoding="async">
    <div class="pb-body"><slot /></div>
  </div>
</template>

<style scoped>
.pb { position: relative; overflow: hidden; }
.pb.has-art { min-height: 128px; display: flex; align-items: flex-end; }
.pb-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; filter: saturate(0.7) brightness(0.7); }
/* Scrim only: solid on the left where the text sits, the art shows on the right. */
.pb.has-art::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, var(--uf-bg) 0%, rgba(14, 17, 22, 0.86) 38%, rgba(14, 17, 22, 0.35) 100%); }
.pb-body { position: relative; z-index: 1; width: 100%; }
.pb.has-art .pb-body { padding: 20px 20px 18px; }
</style>
