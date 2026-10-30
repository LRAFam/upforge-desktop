<script setup lang="ts">
/**
 * Full-bleed hero: art + scrim + result wash + optional agent cut-out.
 * The score (or title) goes in the default slot at D1; stats go in #stats.
 */
withDefaults(defineProps<{
  art?: string
  agent?: string
  result?: string
  tone?: 'win' | 'loss' | 'none'
  meta?: string
  accent?: string
  height?: number
  artPosition?: string
}>(), { tone: 'none', height: 288, artPosition: 'center 40%' })
</script>

<template>
  <section class="uf-hero" :style="{ height: `${height}px` }">
    <img v-if="art" :src="art" alt="" class="uf-hero-art" :style="{ objectPosition: artPosition }">
    <div class="uf-hero-scrim" />
    <div v-if="tone !== 'none'" class="uf-hero-wash" :class="`uf-hero-wash--${tone}`" />
    <div v-if="accent" class="uf-hero-accent" :style="{ background: accent }" />
    <img v-if="agent" :src="agent" alt="" class="uf-hero-agent" :style="{ height: `${Math.round(height * 1.9)}px` }">
    <div class="uf-hero-body">
      <div class="uf-rise" style="display: flex; flex-direction: column; gap: 10px">
        <div style="display: flex; align-items: baseline; gap: 14px">
          <span v-if="result" class="uf-d4" :style="{ color: tone === 'win' ? 'var(--uf-win)' : tone === 'loss' ? 'var(--uf-loss)' : 'var(--uf-muted)' }">{{ result }}</span>
          <span v-if="meta" class="uf-t4" style="color: var(--uf-muted)">{{ meta }}</span>
        </div>
        <slot />
      </div>
      <div class="uf-rise uf-d1s" style="display: flex; gap: 30px; align-items: baseline"><slot name="stats" /></div>
    </div>
  </section>
</template>

<style scoped>
.uf-hero { position: relative; flex: none; overflow: hidden; border-bottom: 1px solid var(--uf-line); }
.uf-hero-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(0.6) brightness(0.9); }
.uf-hero-scrim { position: absolute; inset: 0; background:
  linear-gradient(90deg, var(--uf-bg) 0%, rgba(14,17,22,0.94) 36%, rgba(14,17,22,0.5) 68%, rgba(14,17,22,0.8) 100%),
  linear-gradient(180deg, transparent 50%, var(--uf-bg)); }
.uf-hero-wash { position: absolute; inset: 0; }
.uf-hero-wash--loss { background: radial-gradient(900px 340px at 8% 110%, rgba(232,80,91,0.2), transparent 70%); }
.uf-hero-wash--win { background: radial-gradient(900px 340px at 8% 110%, rgba(34,169,155,0.2), transparent 70%); }
.uf-hero-accent { position: absolute; left: 0; right: 0; top: 0; height: 2px; }
.uf-hero-agent { position: absolute; right: 70px; top: 10px; width: auto; pointer-events: none; }
.uf-hero-body { position: relative; height: 100%; box-sizing: border-box; padding: 0 40px 28px; display: flex; flex-direction: column; justify-content: flex-end; gap: 14px; }
</style>
