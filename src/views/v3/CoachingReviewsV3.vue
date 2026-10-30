<script setup lang="ts">
/**
 * UI v3 · Coaching reviews (board 17 · Matches, "Coaching reviews" tab).
 * Rendered by CoachingHistoryView, which provides the coaching-history context (same data and
 * actions as the old screen). The Matches header (MatchesTabsV3) sits above it when embedded.
 */
import ReviewFiltersV3 from '../../components/v3/reviews/ReviewFiltersV3.vue'
import ReviewListV3 from '../../components/v3/reviews/ReviewListV3.vue'
import ReviewDetailV3 from '../../components/v3/reviews/ReviewDetailV3.vue'

defineProps<{ embedded?: boolean }>()
</script>

<template>
  <div class="rv3">
    <header v-if="!embedded" class="rv3-head">
      <span class="uf-label">Matches</span>
      <h1 class="uf-d2" style="margin: 0">Coaching reviews</h1>
    </header>
    <ReviewFiltersV3 />
    <div class="rv3-body">
      <ReviewListV3 />
      <ReviewDetailV3 />
    </div>
  </div>
</template>

<style scoped>
.rv3 { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--uf-bg); color: var(--uf-bone); }
.rv3-head { display: flex; flex-direction: column; gap: 10px; padding: 26px 40px 18px; }
.rv3-body { flex: 1; min-height: 0; display: flex; }
@media (max-width: 1023px) { .rv3-body { flex-direction: column; } }
</style>
