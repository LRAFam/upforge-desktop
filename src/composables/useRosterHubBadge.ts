import { ref } from 'vue'

const pendingReviewCount = ref(0)

/** Shared pending roster-review count for sidebar badge. */
export function useRosterHubBadge() {
  function setPendingReviewCount(count: number) {
    pendingReviewCount.value = Math.max(0, count)
  }

  return {
    pendingReviewCount,
    setPendingReviewCount,
  }
}
