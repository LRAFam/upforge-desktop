/**
 * Stable activation / pipeline error taxonomy.
 * Machine codes for funnel + ops; user-safe copy for UI; keep raw/technical separately.
 */

export type ActivationErrorCategory =
  | 'obs'
  | 'recording'
  | 'preparation'
  | 'upload'
  | 'quota'
  | 'analysis'
  | 'media'
  | 'unknown'

export type ActivationPipelineStage =
  | 'obs_setup'
  | 'recording'
  | 'preparing'
  | 'uploading'
  | 'queued'
  | 'analysing'
  | 'report'
  | 'quota'

export type ActivationRecoveryAction =
  | 'launch_obs'
  | 'repair_obs_setup'
  | 'test_recording'
  | 'resume_preparation'
  | 'resume_upload'
  | 'retry_upload'
  | 'reconnect_account'
  | 'unlock_analysis'
  | 'regenerate_report'
  | 'open_dashboard'
  | 'contact_support'
  | 'upgrade'
  | 'none'

export interface ActivationErrorDefinition {
  code: string
  category: ActivationErrorCategory
  stage: ActivationPipelineStage
  retryable: boolean
  userActionRequired: boolean
  userMessage: string
  recoveryAction: ActivationRecoveryAction
}

/** Canonical catalog — codes are stable; messages may be refined. */
export const ACTIVATION_ERRORS: Record<string, ActivationErrorDefinition> = {
  obs_not_running: {
    code: 'obs_not_running',
    category: 'obs',
    stage: 'obs_setup',
    retryable: true,
    userActionRequired: true,
    userMessage: 'OBS is not running. Click Launch OBS and UpForge will connect automatically.',
    recoveryAction: 'launch_obs',
  },
  obs_not_connected: {
    code: 'obs_not_connected',
    category: 'obs',
    stage: 'obs_setup',
    retryable: true,
    userActionRequired: true,
    userMessage:
      'OBS is not connected. UpForge will keep trying, or click Launch OBS in Settings → Recording.',
    recoveryAction: 'launch_obs',
  },
  obs_websocket_disabled: {
    code: 'obs_websocket_disabled',
    category: 'obs',
    stage: 'obs_setup',
    retryable: true,
    userActionRequired: true,
    userMessage:
      'OBS WebSocket is not enabled. Click Launch OBS so UpForge can configure it, or enable WebSocket in OBS Settings.',
    recoveryAction: 'launch_obs',
  },
  obs_authentication_failed: {
    code: 'obs_authentication_failed',
    category: 'obs',
    stage: 'obs_setup',
    retryable: true,
    userActionRequired: true,
    userMessage:
      'OBS WebSocket password does not match. Click Launch OBS so UpForge can reconnect with the right password.',
    recoveryAction: 'launch_obs',
  },
  obs_scene_missing: {
    code: 'obs_scene_missing',
    category: 'obs',
    stage: 'obs_setup',
    retryable: true,
    userActionRequired: true,
    userMessage: 'UpForge could not find your recording scene. Click Repair Setup to recreate it.',
    recoveryAction: 'repair_obs_setup',
  },
  obs_source_missing: {
    code: 'obs_source_missing',
    category: 'obs',
    stage: 'obs_setup',
    retryable: true,
    userActionRequired: true,
    userMessage:
      'UpForge could not find your gameplay capture. Click Repair Setup and UpForge will recreate it.',
    recoveryAction: 'repair_obs_setup',
  },
  obs_invalid_source_type: {
    code: 'obs_invalid_source_type',
    category: 'obs',
    stage: 'obs_setup',
    retryable: true,
    userActionRequired: true,
    userMessage:
      'Your gameplay capture source is the wrong type. Click Repair Setup to fix it.',
    recoveryAction: 'repair_obs_setup',
  },
  obs_recording_start_timeout: {
    code: 'obs_recording_start_timeout',
    category: 'obs',
    stage: 'recording',
    retryable: true,
    userActionRequired: true,
    userMessage:
      'OBS did not start recording in time. Check OBS Output settings, then try Test Recording.',
    recoveryAction: 'test_recording',
  },
  obs_disconnected_during_recording: {
    code: 'obs_disconnected_during_recording',
    category: 'obs',
    stage: 'recording',
    retryable: true,
    userActionRequired: true,
    userMessage:
      'OBS disconnected while recording. Your match may still be on disk — check the dashboard.',
    recoveryAction: 'launch_obs',
  },
  recording_file_missing: {
    code: 'recording_file_missing',
    category: 'recording',
    stage: 'preparing',
    retryable: false,
    userActionRequired: true,
    userMessage:
      'The recording file was not created. OBS may have stopped early — check Settings → Recording.',
    recoveryAction: 'open_dashboard',
  },
  recording_file_incomplete: {
    code: 'recording_file_incomplete',
    category: 'recording',
    stage: 'preparing',
    retryable: false,
    userActionRequired: true,
    userMessage:
      'The recording file is incomplete or unreadable. Play another match, or retry only if the file opens in a media player.',
    recoveryAction: 'open_dashboard',
  },
  recording_file_too_large: {
    code: 'recording_file_too_large',
    category: 'recording',
    stage: 'uploading',
    retryable: false,
    userActionRequired: true,
    userMessage:
      'This recording is larger than the upload limit. Use recommended recording settings, or review highlight clips on the dashboard.',
    recoveryAction: 'open_dashboard',
  },
  preparation_timeout: {
    code: 'preparation_timeout',
    category: 'preparation',
    stage: 'preparing',
    retryable: true,
    userActionRequired: true,
    userMessage:
      'Preparing your match took too long. Your recording is saved — tap Resume Preparation on the dashboard.',
    recoveryAction: 'resume_preparation',
  },
  preparation_worker_failed: {
    code: 'preparation_worker_failed',
    category: 'preparation',
    stage: 'preparing',
    retryable: true,
    userActionRequired: true,
    userMessage:
      'Preparing your match failed. Your recording is saved — tap Resume Preparation on the dashboard.',
    recoveryAction: 'resume_preparation',
  },
  preparation_settled_stuck: {
    code: 'preparation_settled_stuck',
    category: 'preparation',
    stage: 'preparing',
    retryable: true,
    userActionRequired: true,
    userMessage:
      'Preparing did not finish. Your recording is saved — tap Resume Preparation on the dashboard.',
    recoveryAction: 'resume_preparation',
  },
  upload_aborted_by_user: {
    code: 'upload_aborted_by_user',
    category: 'upload',
    stage: 'uploading',
    retryable: true,
    userActionRequired: true,
    userMessage: 'Upload was cancelled. Your recording is still on the dashboard — tap Retry Upload.',
    recoveryAction: 'retry_upload',
  },
  upload_network_interrupted: {
    code: 'upload_network_interrupted',
    category: 'upload',
    stage: 'uploading',
    retryable: true,
    userActionRequired: true,
    userMessage:
      'Upload was interrupted by a network issue. Your recording is safe — tap Resume Upload.',
    recoveryAction: 'resume_upload',
  },
  upload_stalled: {
    code: 'upload_stalled',
    category: 'upload',
    stage: 'uploading',
    retryable: true,
    userActionRequired: true,
    userMessage: 'Upload stalled with no progress. Your recording is safe — tap Resume Upload.',
    recoveryAction: 'resume_upload',
  },
  upload_authentication_expired: {
    code: 'upload_authentication_expired',
    category: 'upload',
    stage: 'uploading',
    retryable: true,
    userActionRequired: true,
    userMessage: 'Your session expired during upload. Sign in again, then retry from the dashboard.',
    recoveryAction: 'reconnect_account',
  },
  upload_url_expired: {
    code: 'upload_url_expired',
    category: 'upload',
    stage: 'uploading',
    retryable: true,
    userActionRequired: true,
    userMessage: 'The upload link expired. Your recording is safe — tap Retry Upload for a fresh link.',
    recoveryAction: 'retry_upload',
  },
  upload_integrity_failed: {
    code: 'upload_integrity_failed',
    category: 'upload',
    stage: 'uploading',
    retryable: true,
    userActionRequired: false,
    userMessage: 'The uploaded file could not be verified. Tap Retry Upload.',
    recoveryAction: 'retry_upload',
  },
  upload_api_timeout: {
    code: 'upload_api_timeout',
    category: 'upload',
    stage: 'uploading',
    retryable: true,
    userActionRequired: false,
    userMessage: 'The server timed out during upload. Your recording is safe — tap Retry Upload.',
    recoveryAction: 'retry_upload',
  },
  upload_retry_invalid_state: {
    code: 'upload_retry_invalid_state',
    category: 'upload',
    stage: 'uploading',
    retryable: false,
    userActionRequired: true,
    userMessage: 'This match is still processing. Wait for it to finish, or open the dashboard for status.',
    recoveryAction: 'open_dashboard',
  },
  quota_required: {
    code: 'quota_required',
    category: 'quota',
    stage: 'quota',
    retryable: false,
    userActionRequired: true,
    userMessage:
      'Your match is ready, but you need an analysis credit. Upgrade or pay per analysis to unlock coaching.',
    recoveryAction: 'unlock_analysis',
  },
  media_download_failed: {
    code: 'media_download_failed',
    category: 'media',
    stage: 'analysing',
    retryable: true,
    userActionRequired: false,
    userMessage: 'We could not download your recording for analysis. We will retry automatically when possible.',
    recoveryAction: 'none',
  },
  media_not_ready: {
    code: 'media_not_ready',
    category: 'media',
    stage: 'analysing',
    retryable: true,
    userActionRequired: false,
    userMessage: 'Your recording is still finalizing in cloud storage. Analysis will start when it is ready.',
    recoveryAction: 'none',
  },
  clip_extraction_failed: {
    code: 'clip_extraction_failed',
    category: 'analysis',
    stage: 'analysing',
    retryable: true,
    userActionRequired: false,
    userMessage: 'We could not cut duel clips from this recording. Your credit was refunded if charged.',
    recoveryAction: 'regenerate_report',
  },
  insufficient_video_observations: {
    code: 'insufficient_video_observations',
    category: 'analysis',
    stage: 'analysing',
    retryable: true,
    userActionRequired: false,
    userMessage:
      'Video review did not produce enough duel observations. We will use match stats when available.',
    recoveryAction: 'regenerate_report',
  },
  video_model_timeout: {
    code: 'video_model_timeout',
    category: 'analysis',
    stage: 'analysing',
    retryable: true,
    userActionRequired: false,
    userMessage: 'Video analysis timed out. Your credit was refunded — try again from the dashboard.',
    recoveryAction: 'regenerate_report',
  },
  video_model_invalid_response: {
    code: 'video_model_invalid_response',
    category: 'analysis',
    stage: 'analysing',
    retryable: true,
    userActionRequired: false,
    userMessage: 'Video analysis returned an invalid result. Your credit was refunded — try again.',
    recoveryAction: 'regenerate_report',
  },
  telemetry_fallback_used: {
    code: 'telemetry_fallback_used',
    category: 'analysis',
    stage: 'analysing',
    retryable: false,
    userActionRequired: false,
    userMessage:
      'This report uses match stats because video review was incomplete. Limitations are listed in the report.',
    recoveryAction: 'none',
  },
  analysis_permanently_failed: {
    code: 'analysis_permanently_failed',
    category: 'analysis',
    stage: 'analysing',
    retryable: false,
    userActionRequired: true,
    userMessage:
      'Analysis could not complete for this match. Your recording is preserved — contact support if you need help.',
    recoveryAction: 'contact_support',
  },
  unknown: {
    code: 'unknown',
    category: 'unknown',
    stage: 'preparing',
    retryable: true,
    userActionRequired: true,
    userMessage: 'Something went wrong. Your match may still be on the dashboard.',
    recoveryAction: 'open_dashboard',
  },
} as const

export type ActivationErrorCode = keyof typeof ACTIVATION_ERRORS

export interface ClassifiedActivationError {
  code: ActivationErrorCode
  definition: ActivationErrorDefinition
  /** Original technical message for logs/diagnostics */
  technicalMessage: string
  /** Safe user-facing message */
  userMessage: string
}

export function getActivationError(code: string): ActivationErrorDefinition {
  return ACTIVATION_ERRORS[code] ?? ACTIVATION_ERRORS.unknown
}

/** Map raw exception / OBS / pipeline messages to a stable code. */
export function classifyActivationError(raw: string): ClassifiedActivationError {
  const technicalMessage = (raw || '').trim()
  const lower = technicalMessage.toLowerCase()
  const code = matchActivationErrorCode(lower, technicalMessage)
  const definition = getActivationError(code)
  return {
    code: definition.code as ActivationErrorCode,
    definition,
    technicalMessage,
    userMessage: definition.userMessage,
  }
}

function matchActivationErrorCode(lower: string, raw: string): ActivationErrorCode {
  if (!lower) return 'unknown'

  // Quota first — commercial, not upload
  if (
    /analysis_limit_reached|analysis\.limit|upgrade\.required|used your free analysis|no analyses remaining|used all.*analyses/i.test(
      lower,
    )
  ) {
    return 'quota_required'
  }

  if (/did not become active|startrecord.*within|recording start timeout/i.test(lower)) {
    return 'obs_recording_start_timeout'
  }
  if (/websocket.*(password|auth|authentication)|authentication failed|invalid password/i.test(lower)) {
    return 'obs_authentication_failed'
  }
  if (/websocket.*(disabled|enable)|enable websocket/i.test(lower)) {
    return 'obs_websocket_disabled'
  }
  if (/obs is not connected|obs not connected|isn't connected/i.test(lower)) {
    return 'obs_not_connected'
  }
  if (/obs (is )?not running|obs process|launch obs/i.test(lower) && /not|fail|couldn't|could not/.test(lower)) {
    return 'obs_not_running'
  }
  if (/not a scene|is not a scene|specified source is not a scene/i.test(lower)) {
    return 'obs_invalid_source_type'
  }
  if (/invalid (source )?type|wrong type|monitor_capture|display_capture|screen_capture/i.test(lower)) {
    return 'obs_invalid_source_type'
  }
  if (
    /no source.*(named|found).*upforge|source named.*upforge|within the canvas|object not found matching|no scene items were found|resource not found/i.test(
      lower,
    )
  ) {
    return 'obs_source_missing'
  }
  if (/scene.*(missing|not found|named upforge)/i.test(lower)) {
    return 'obs_scene_missing'
  }
  if (/disconnected.*(during|while).*record|obs process exited|connection closed.*record/i.test(lower)) {
    return 'obs_disconnected_during_recording'
  }

  if (/preparing is taking longer|preparing_timeout/i.test(lower)) {
    return 'preparation_timeout'
  }
  if (/preparing did not complete|preparing_settled|settled while still preparing/i.test(lower)) {
    return 'preparation_settled_stuck'
  }
  if (/could not prepare|preparation failed|prep.*failed/i.test(lower)) {
    return 'preparation_worker_failed'
  }

  if (/recording file (was )?not (created|found)|file not found at expected|recording file missing/i.test(lower)) {
    return 'recording_file_missing'
  }
  if (/too small|incomplete|corrupt|moov atom|invalid data found when processing/i.test(lower)) {
    return 'recording_file_incomplete'
  }
  if (/too large|file size exceeded|max:2684354560|recording too large/i.test(lower)) {
    return 'recording_file_too_large'
  }

  if (/upload_stalled|upload stalled/i.test(lower)) {
    return 'upload_stalled'
  }
  if (/^upload_network_interrupted:|upload network interrupted/i.test(lower)) {
    return 'upload_network_interrupted'
  }
  if (/^upload_aborted_by_user:|upload aborted by user|upload was cancelled/i.test(lower)) {
    return 'upload_aborted_by_user'
  }
  if (/upload aborted|upload was cancelled|aborted by user/i.test(lower)) {
    // Generic legacy wording — caller should prefer explicit upload_aborted_by_user
    return 'upload_aborted_by_user'
  }
  if (/upload session expired|upload_session_expired|nosuchupload/i.test(lower)) {
    return 'upload_url_expired'
  }
  if (/only failed jobs can be retried/i.test(lower)) {
    return 'upload_retry_invalid_state'
  }
  if (/api request timed out|operation timed|curl error 28|etimedout/i.test(lower) && /upload|presign|complete|api/.test(lower)) {
    return 'upload_api_timeout'
  }
  if (/socket hang up|econnreset|epipe|network|connection (dropped|interrupted)/i.test(lower)) {
    return 'upload_network_interrupted'
  }
  if (/not authenticated|401|session expired|unauthorized/i.test(lower)) {
    return 'upload_authentication_expired'
  }
  if (/recording_missing|recording_empty|integrity|checksum/i.test(lower)) {
    return 'upload_integrity_failed'
  }

  if (/insufficient duel observations|not generated from reviewed|no valid video insight/i.test(lower)) {
    return 'insufficient_video_observations'
  }
  if (/video download|s3 download|failed to download/i.test(lower)) {
    return 'media_download_failed'
  }
  if (/media.?not.?ready|object does not exist|nosuchkey/i.test(lower)) {
    return 'media_not_ready'
  }
  if (/clip extraction|cannot extract duel|ffmpeg exited/i.test(lower)) {
    return 'clip_extraction_failed'
  }
  if (/model timed? ?out|gemini.*timeout|claude.*timeout/i.test(lower)) {
    return 'video_model_timeout'
  }
  if (/invalid (model )?response|json parse|malformed/i.test(lower)) {
    return 'video_model_invalid_response'
  }
  if (/telemetry.?fallback|degraded report/i.test(lower)) {
    return 'telemetry_fallback_used'
  }
  if (/permanently failed|analysis could not complete/i.test(lower)) {
    return 'analysis_permanently_failed'
  }

  // Generic OBS not connected variants
  if (/\bobs\b/.test(lower) && /not connected|websocket/.test(lower)) {
    return 'obs_not_connected'
  }

  void raw
  return 'unknown'
}

export function isQuotaErrorCode(code: string): boolean {
  return code === 'quota_required'
}

export function isTechnicalUploadFailure(code: string): boolean {
  const def = getActivationError(code)
  return def.category === 'upload' || def.category === 'preparation' || def.category === 'recording'
}
