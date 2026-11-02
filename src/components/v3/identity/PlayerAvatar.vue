<script setup lang="ts">
/**
 * Square player avatar (0–2px radius, rulebook rule 3). Art from `playerIdentity()`: photo → card
 * → agent → profile icon, stepping down the chain when an image fails to load; the name's first
 * letter is last. `badge` adds the rank icon in the bottom-right corner (only when one exists).
 */
import { computed, ref, watch } from 'vue'
import type { PlayerIdentity } from '../../../lib/player-identity'

const props = withDefaults(defineProps<{
  identity: PlayerIdentity
  size?: 24 | 32 | 48 | 72
  badge?: boolean
  /** Accessible name; leave empty when the name is printed next to the avatar. */
  alt?: string
}>(), { size: 32, badge: false, alt: '' })

const failed = ref(0)
watch(() => props.identity.avatars.map(a => a.src).join('|'), () => { failed.value = 0 })
const image = computed(() => props.identity.avatars[failed.value] ?? null)
const badgeSrc = computed(() => (props.badge && props.size >= 32 ? props.identity.rankIcon : null))
</script>

<template>
  <span class="pa" :class="[`pa--${size}`, image ? `is-${image.kind}` : 'is-letter']" :role="alt ? 'img' : undefined"
    :aria-label="alt || undefined" :aria-hidden="alt ? undefined : 'true'">
    <img v-if="image" :key="image.src" :src="image.src" alt="" loading="lazy" decoding="async" @error="failed++">
    <span v-else class="pa-letter">{{ identity.initial }}</span>
    <img v-if="badgeSrc" :src="badgeSrc" alt="" class="pa-badge" loading="lazy" decoding="async">
  </span>
</template>

<style scoped>
.pa { position: relative; flex: none; display: inline-flex; align-items: center; justify-content: center; background: var(--uf-raised); border-radius: 2px; color: var(--uf-bone); }
.pa > img:first-child { width: 100%; height: 100%; object-fit: cover; border-radius: 2px; }
.pa.is-agent > img:first-child, .pa.is-icon > img:first-child { object-fit: contain; }
.pa-letter { font-family: var(--uf-display); font-weight: 700; line-height: 1; }
.pa--24 { width: 24px; height: 24px; } .pa--24 .pa-letter { font-size: 15px; }
.pa--32 { width: 32px; height: 32px; } .pa--32 .pa-letter { font-size: 19px; }
.pa--48 { width: 48px; height: 48px; } .pa--48 .pa-letter { font-size: 28px; }
.pa--72 { width: 72px; height: 72px; } .pa--72 .pa-letter { font-size: 40px; }
.pa-badge { position: absolute; right: -4px; bottom: -4px; width: 40%; height: 40%; min-width: 14px; min-height: 14px; object-fit: contain; filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.9)); }
</style>
