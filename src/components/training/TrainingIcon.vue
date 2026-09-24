<script setup lang="ts">
defineProps<{ name: string }>()
const paths: Record<string, string> = {
  all: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  aim: 'M12 2v4 M12 18v4 M2 12h4 M18 12h4 M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M12 10v4 M10 12h4',
  reaction: 'M13 2 4 14h7l-1 8 10-13h-7z',
  precision: 'M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M12 8v8 M8 12h8',
  duel: 'M4 3l7 7-3 3-7-7 M20 3l-7 7 3 3 7-7 M3 16l5 5 M16 21l5-5 M5 19l5-5 M19 19l-5-5',
  analytics: 'M4 20V10 M12 20V4 M20 20v-7',
  leaderboards: 'M8 21h8 M12 17v4 M6 3h12v7a6 6 0 0 1-12 0z M6 5H3v3a4 4 0 0 0 4 4 M18 5h3v3a4 4 0 0 1-4 4',
  loadouts: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
  flick: 'M3 18 17 4 M10 4h7v7 M4 8V4h4 M16 20h4v-4',
  gridshot: 'M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z',
  sixshot: 'M3 4h4v4H3z M10 4h4v4h-4z M17 4h4v4h-4z M3 16h4v4H3z M10 16h4v4h-4z M17 16h4v4h-4z',
  tracking: 'M2 15c4 0 4-8 8-8s4 10 8 10h4 M18 13l4 4-4 4',
  strafe_track: 'M3 6h18 M3 6l3-3 M3 6l3 3 M21 18H3 M21 18l-3-3 M21 18l-3 3',
  switching: 'M3 6h18 M17 2l4 4-4 4 M21 18H3 M7 14l-4 4 4 4',
  angle_clearing: 'M4 21V4h9v9h7 M9 18h11 M17 15l3 3-3 3',
  distance_switching: 'M3 7h6v10H3z M16 10h4v4h-4z M11 12h3 M12 10l2 2-2 2',
  head_height: 'M2 9h5 M17 9h5 M15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M6 21v-3a6 6 0 0 1 12 0v3',
  strafe_aim: 'M2 18h20 M2 18l3-3 M2 18l3 3 M22 18l-3-3 M22 18l-3 3 M12 3v8 M8 7h8',
}
const aliases: Record<string, string> = {train:'aim',microadjust:'precision',microflick:'flick'}
</script>
<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0">
    <path :d="paths[aliases[name] || name] || paths.aim" />
  </svg>
</template>
