import { describe, expect, it } from 'vitest'
import {
  COACHING_RECORDING,
  CREATOR_RECORDING_1080,
  resolveRecordingOutput,
} from './recording-preset'

describe('resolveRecordingOutput', () => {
  it('forces coaching when creator is not allowed', () => {
    expect(resolveRecordingOutput({
      recordingPreset: 'creator',
      recordingQuality: '1080p',
      allowCreator: false,
    })).toMatchObject({
      recordingPreset: 'coaching',
      quality: '720p',
      manageObsVideo: true,
    })
  })

  it('defaults creator to 1080p60 and manages OBS video', () => {
    expect(resolveRecordingOutput({
      recordingPreset: 'creator',
      allowCreator: true,
    })).toEqual({
      recordingPreset: 'creator',
      ...CREATOR_RECORDING_1080,
    })
    expect(CREATOR_RECORDING_1080.manageObsVideo).toBe(true)
  })

  it('allows creator 720p with coaching bitrate/fps but still creator preset', () => {
    expect(resolveRecordingOutput({
      recordingPreset: 'creator',
      recordingQuality: '720p',
      allowCreator: true,
    })).toEqual({
      recordingPreset: 'creator',
      quality: '720p',
      bitrate: COACHING_RECORDING.bitrate,
      fps: COACHING_RECORDING.fps,
      manageObsVideo: true,
      label: COACHING_RECORDING.label,
    })
  })
})
