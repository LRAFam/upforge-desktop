import { ref } from 'vue'
import type { RecordingTimeline } from '../env.d.ts'

/** Holds a timeline loaded from an API analysis before navigating to /vod-review. */
export const pendingTimeline = ref<RecordingTimeline | null>(null)
