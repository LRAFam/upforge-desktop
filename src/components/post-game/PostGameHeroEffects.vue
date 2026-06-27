<script setup lang="ts">
withDefaults(defineProps<{
  /** crosshair = analysing scan, uplink = upload beams, reveal = score ready shimmer */
  variant?: 'crosshair' | 'uplink' | 'reveal'
}>(), {
  variant: 'crosshair',
})
</script>

<template>
  <!-- Analysing: tactical crosshair + scan ring -->
  <div v-if="variant === 'crosshair'" class="absolute inset-0 pointer-events-none overflow-hidden">
    <svg
      class="absolute right-3 top-1/2 -translate-y-1/2 h-20 w-20 opacity-[0.14]"
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="40" cy="40" r="18" stroke="#ff4655" stroke-width="1" />
      <circle cx="40" cy="40" r="6" stroke="#ff4655" stroke-width="1.5" />
      <path d="M40 8v12M40 60v12M8 40h12M60 40h12" stroke="#ff4655" stroke-width="1.5" stroke-linecap="round" />
    </svg>
    <div class="hero-scan-ring absolute right-8 top-1/2 h-16 w-16 -translate-y-1/2 rounded-full border border-[#ff4655]/25" />
    <div class="hero-scan-line absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#ff4655]/40 to-transparent" />
  </div>

  <!-- Upload: rising data particles -->
  <div v-else-if="variant === 'uplink'" class="absolute inset-0 pointer-events-none overflow-hidden">
    <span v-for="i in 5" :key="i" class="hero-uplink-particle absolute bottom-0 h-8 w-px bg-gradient-to-t from-[#ff4655]/0 via-[#ff4655]/50 to-orange-400/80" :style="{ left: `${12 + i * 16}%`, animationDelay: `${i * 0.35}s` }" />
    <div class="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#ff4655]/10 to-transparent" />
  </div>

  <!-- Ready: emerald reveal sweep -->
  <div v-else class="absolute inset-0 pointer-events-none overflow-hidden">
    <div class="hero-reveal-sweep absolute inset-0 bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent" />
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(34,197,94,0.15),transparent_60%)]" />
  </div>
</template>

<style scoped>
.hero-scan-ring {
  animation: heroScanRing 2.8s ease-in-out infinite;
}

.hero-scan-line {
  top: 35%;
  animation: heroScanLine 3.2s ease-in-out infinite;
}

.hero-uplink-particle {
  animation: heroUplink 2.4s ease-in-out infinite;
}

.hero-reveal-sweep {
  animation: heroRevealSweep 4s ease-in-out infinite;
}

@keyframes heroScanRing {
  0%, 100% { transform: translateY(-50%) scale(0.85); opacity: 0.35; }
  50% { transform: translateY(-50%) scale(1.15); opacity: 0.7; }
}

@keyframes heroScanLine {
  0%, 100% { top: 28%; opacity: 0.2; }
  50% { top: 62%; opacity: 0.55; }
}

@keyframes heroUplink {
  0% { transform: translateY(0); opacity: 0; }
  20% { opacity: 1; }
  100% { transform: translateY(-110px); opacity: 0; }
}

@keyframes heroRevealSweep {
  0%, 100% { transform: translateX(-100%); opacity: 0.3; }
  50% { transform: translateX(100%); opacity: 0.6; }
}

@media (prefers-reduced-motion: reduce) {
  .hero-scan-ring,
  .hero-scan-line,
  .hero-uplink-particle,
  .hero-reveal-sweep {
    animation: none !important;
  }
}
</style>
