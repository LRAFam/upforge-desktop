# Activation reliability (desktop + API)

Brief reference for stable error codes, preflight checks, and degraded analysis.

## Error codes

Desktop and API share a stable taxonomy in:

- `electron/main/activation-error-codes.ts` (desktop)
- `app/Support/ActivationErrorCode.php` (API)

Codes drive funnel events (`failure_code`, `recovery_action`), dashboard copy, and admin pipeline views.

Quota walls use `quota_required` (commercial), never `upload_failed`.

Common upload codes:

| Code | When |
|------|------|
| `upload_aborted_by_user` | User cancel, logout, app quit, `abortUploads()` |
| `upload_stalled` | 120s with no S3 upload progress |
| `upload_network_interrupted` | Connection drop without user cancel |
| `preparation_timeout` / `preparation_settled_stuck` | Desktop post-game preparing safety nets |

Common media codes (API analysis path):

| Code | When |
|------|------|
| `media_not_ready` | S3 object missing or zero bytes after upload |
| `media_download_failed` | S3 head/download failed (retried by queue) |

## OBS preflight

IPC: `obs:run-preflight`, `obs:repair-setup`, `obs:test-recording`.

Persists `obsPreflightPassed` / `obsSetupPassedAt` in settings after a successful verify (including optional test recording).

StartRecord verify timeout: `UPFORGE_OBS_RECORD_VERIFY_MS` or settings `obsRecordVerifyMs` (default 5000, max 15000).

## Pre-record size estimate

`electron/main/recording-size-estimate.ts`:

- Estimates bytes from bitrate × expected match duration (default 42 min).
- Warns before OBS start when estimate exceeds `MAX_RECORDING_FILE_BYTES` (2.5 GB).
- `recommendSettingsUnderCap()` suggests lower bitrate/resolution for Settings.

## Telemetry fallback

Env `UPFORGE_TELEMETRY_FALLBACK=1` (default ON) or request `allow_telemetry_fallback`.

When duel video review is incomplete but rich `match_data` exists, analysis completes as `report_type: degraded_telemetry` / `coaching_source: telemetry_only`. Credits are kept for valid degraded reports.

## First analysis + admin

- Presign sets `params.is_first_analysis`
- Admin pipeline: `?first_analysis=1`, `?stuck=1`
- Scheduled: `analysis-jobs:alert-stuck-first-analysis`
- Primary KPI: % of first `analysis_queued` cohort with `report_opened` within 24h

## Local debugging

- Upload abort reasons: search main log for `upload_stalled`, `upload_aborted_by_user`, or `upload_network_interrupted`.
- Prep: `[Prep]` heartbeats and `preparation_failed` funnel events with `prep_step`.
- API media races: `DesktopRecordingS3Service::assertObjectReady()` retries headObject after multipart complete.
- PHPUnit: `tests/Unit/ActivationErrorCodeTest.php`, `tests/Feature/FirstAnalysisProtectionTest.php`
- Desktop: `electron/main/activation-error-codes.test.ts`, `recording-size-estimate.test.ts`, `obs-preflight.test.ts`
- AI: `pytest tests/test_telemetry_fallback_coach.py`
