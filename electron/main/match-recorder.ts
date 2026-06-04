import type { DesktopRecorder } from './desktop-recorder'
import type { OBSRecorder } from './obs-recorder'

/** Recorder used for live match capture (desktop capture or OBS). */
export type ActiveMatchRecorder = DesktopRecorder | OBSRecorder

/**
 * Shared surface used by ActiveMatchRecorder for settings/IPC status.
 */
export interface MatchRecorder {
  isRecording(): boolean
  getRecordingStartedAt(): number | null
  stop(): Promise<string | null>
  getAudioMode(): string | false | null
  redetectAudio(): Promise<string | false>
  forceStop(): void
  onStatusChange?: (recording: boolean, error?: string) => void
}
