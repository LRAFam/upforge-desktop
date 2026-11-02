/**
 * UI v3 sidebar state for human coaching (Option A, coaches-flow-proposal.md):
 * - `notesReady`: Coaches badge — coach notes ready for you that you haven't opened.
 * - `needsNotes`: Students badge — matches your students sent that still need your notes.
 * - `coachProfile`: whether the Students nav item exists (accounts with a coach profile only).
 * The classic sidebar keeps its own combined count (composables/useRosterHubBadge).
 */
import { ref } from 'vue'
import { readCache, writeCache } from '../../../lib/stale-cache'

const PROFILE_KEY = 'sidebar:coach-profile'

const notesReady = ref(0)
const needsNotes = ref(0)
const coachProfile = ref<boolean>(false)
let seeded = false

export function useCoachBadges() {
  if (!seeded) {
    seeded = true
    coachProfile.value = readCache<boolean>(PROFILE_KEY)?.value ?? false
  }
  return {
    notesReady,
    needsNotes,
    coachProfile,
    setNotesReady(n: number) { notesReady.value = Math.max(0, n) },
    setNeedsNotes(n: number) { needsNotes.value = Math.max(0, n) },
    /** Only a definite answer (roster payload or a clean "no coach") changes it; callers skip on network errors. */
    setCoachProfile(on: boolean) {
      coachProfile.value = on
      writeCache(PROFILE_KEY, on)
    },
  }
}
