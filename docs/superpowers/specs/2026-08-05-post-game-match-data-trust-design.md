# Post-game match-data trust UX

**Date:** 2026-08-05  
**Service:** `upforge-desktop`  
**Status:** Approved design (awaiting implementation plan)  
**Related:** `analysis-readiness.ts`, `activation-error-codes.ts`, `analysis-failure-messages.ts`, `pipeline-errors.ts`

## 1. Problem

Players set up OBS, play a full match, see recording look healthy, then hit a red post-game modal with generic copy (“Upload failed”, “Could not save recording to cloud”, “Analysis could not complete”). That breaks trust.

A frequent underlying cause is **Riot match data not ready yet** (`syncing` / `waiting_match_data`). Auto-analyse already skips upload in some paths, but:

1. Analyse / Retry gates are not consistent across post-game and dashboard.
2. Waiting can feel like a failure (or flash preparing → uploading before dropping to pending).
3. Real failures often lose detail: IPC returns a fixed generic string; UI overwrites classified payloads.
4. Friendly vs technical error paths are mixed: players see technical dumps or useless generics; ops does not always get the raw cause.

## 2. Goals

1. **Hard-block Analyse** until analysis readiness is `ready` (rich match data + duel moments rules as today).
2. **Waiting is calm**, not a red failure: clear “fetching match stats” copy; Analyse unlocks when ready.
3. **Real failures show friendly copy** (title, message, next step) in the player UI.
4. **Ops get the raw error** via existing Discord / pipeline / website error reporting (`reportPipelineError` and related flows), with `failureCode`, ids, and stage.
5. **Stop swallowing** structured errors behind “Could not save recording to cloud” / bare “Upload failed”.

### Success criteria

- While `syncing` or `waiting_match_data`, Analyse (and Retry that starts analysis) cannot start from post-game or dashboard.
- Post-game in that state shows pending/waiting chrome, never red ANALYSIS FAILED solely because stats are late.
- Save-to-cloud / archive-only remains allowed without rich match data.
- On true failure, player modal shows activation-catalog (or equivalent) friendly text; Discord/pipeline payload includes the technical message.
- `recordings:save-to-cloud` and analyse IPC return structured error fields, not only a generic string.

## 3. Non-goals

- Rewriting Riot match-data fetch / Henrik / enrich internals.
- Full OBS early-fail redesign (separate reliability work).
- Marketing site or web dashboard redesign beyond what desktop already reports into.
- Changing credit/refund policy semantics.

## 4. Match-stats gate

**Rule:** Analysis must not start unless `getAnalysisReadiness(rec).ready === true`.

Applies to:

- Post-game **Analyse now**
- Post-game **Retry** when that retries analysis upload
- Dashboard Analyse / Retry paths that call analyse

Does **not** apply to:

- **Save to cloud** (archive-only upload): may run without rich match data
- Clip extraction / late clip retry that only needs local VOD + best-effort timeline

Main process must enforce the gate (UI disable alone is not enough). If Analyse is invoked while not ready, return structured failure with readiness message (or no-op with readiness state), not a generic upload failure.

Background enrich / `scheduleAnalysisReadinessRefresh` continues as today; when readiness flips to `ready`, UI unlocks Analyse (and auto-analyse may proceed if product settings already allow that path).

## 5. Waiting UI

When readiness is `syncing` or `waiting_match_data` (and VOD is otherwise OK):

| Element | Behavior |
|---------|----------|
| Visual | Calm / pending (not red ANALYSIS FAILED) |
| Title | Match recorded (or existing pending hero) |
| Body | Still getting Riot match data. Analyse unlocks when ready (usually about a minute). Keep Valorant / Riot Client open. |
| Primary CTA | Disabled; label like “Waiting for match stats…” |
| Secondary | Save to cloud / Dismiss still available |
| Transition | When ready → primary becomes **Analyse now** without an intervening error modal |

Avoid a long preparing → uploading flash when auto-analyse is blocked on readiness; go straight to pending/waiting.

Copy must follow anti-slop rules (no emojis, no em dashes).

## 6. Real failure UI

Red ANALYSIS FAILED (or credit-refunded variant) only for true failures: upload, auth, missing/unreadable file, quota, server analysis failure, etc.

Player-facing payload shape (all surfaces that show post-game / dashboard analysis failure):

```ts
{
  title: string
  message: string
  hint?: string
  failureCode?: string
  canRetry: boolean
  creditRefunded?: boolean
}
```

Rules:

- Prefer `ACTIVATION_ERRORS[failureCode].userMessage` (and matching title/hint helpers) when `failureCode` is known.
- `classifyAnalysisFailure` remains a fallback for unclassified strings; do not re-classify away a known activation `userMessage` into a weaker generic.
- Never show stack traces, S3 XML, or long HTTP dumps in the player modal.
- Retry label follows `failureCode` / recovery action (Resume upload, Retry, open Settings, etc.).

## 7. Dual error path (player vs ops)

Every reported failure must split:

| Audience | Content |
|----------|---------|
| Player (modal, dashboard banner, toasts) | Friendly `title` / `message` / `hint` only |
| Ops (Discord errors channel, website / pipeline error flow via `reportPipelineError` / existing reporters) | Raw/technical message, `failureCode`, game/map/agent, recording id / job id when known, pipeline stage/step |

Implementation expectation:

- Build one internal failure object with `{ userFacing, technical, failureCode, ...meta }`.
- UI and IPC expose `userFacing`.
- Call sites pass `technical` into `reportPipelineError` / peers (truncated as today).
- `waiting_match_data` / `syncing` are **not** failures: no red modal, no Discord report.
- Keep existing skip filters for true user-recoverable noise (quota, expected OBS setup gaps). During implementation, review whether blanket skips (e.g. entire `upload` kind) hide too many real pipeline bugs; prefer reporting unexpected upload/save failures with technical detail rather than only logging a generic local string.

## 8. IPC and call sites

### `recordings:save-to-cloud`

On failure, return structured fields, e.g.:

`{ ok: false, error: string /* friendly */, title?, hint?, failureCode? }`

Do not replace a classified failure with a hard-coded “Could not save recording to cloud”.

PostGameView `saveToCloudNow` must use the structured payload for the error state (not overwrite a prior classified `post-game:upload-error` with a weaker string when both exist; prefer the richer of the two).

### Analyse / Retry

Same structured shape on hard failures. Gate violations return readiness message + state, not “Upload failed”.

### Preload / `env.d.ts`

Update typings for save-to-cloud and analyse result types.

## 9. Files likely touched

| Area | Paths |
|------|--------|
| Readiness / match end | `electron/main/analysis-readiness.ts`, `electron/main/index.ts` (`handleMatchEnd`, analyse gate, save-to-cloud) |
| Error taxonomy | `electron/main/activation-error-codes.ts`, `src/lib/analysis-failure-messages.ts` |
| Ops reporting | `electron/main/pipeline-errors.ts` (call sites already in index / upload-manager) |
| Post-game UI | `src/views/PostGameView.vue` |
| Dashboard | `src/composables/useDashboard.ts`, action queue / recent analyses as needed |
| Preload / types | `electron/preload/index.ts`, `src/env.d.ts` |
| Tests | readiness gate tests, failure message tests, IPC contract tests where present |

## 10. Testing

- Unit: Analyse gate rejects `syncing` / `waiting_match_data`; allows when `ready`.
- Unit: friendly payload ≠ technical string for at least one upload and one activation-coded failure.
- Unit/regression: save-to-cloud failure returns structured fields, not only the old generic string.
- Manual: match end with delayed Riot stats → pending waiting UI → Analyse unlocks → success path.
- Manual: force upload failure → friendly modal + Discord/pipeline receives raw.

## 11. Rollout

Desktop-only. Ships with normal desktop release (version bump + tag). No API migrate required for this pass.
