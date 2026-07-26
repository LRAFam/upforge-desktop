# Desktop recording reliability & telemetry design

**Date:** 2026-07-26  
**Service:** `upforge-desktop` (with light API support for funnel/ops events)  
**Status:** Phase 2 in progress (`feat/recording-durable-queue`)

## 1. Problem

We improve match recording and upload without clear before/after signal. Failures (OBS disconnect, wrong path, Advanced Output, aborted uploads) and FPS regressions are hard to prove. Hardware differences (i5 vs Ryzen 5, NVENC vs x264) get averaged away.

## 2. Goals

1. **Fewer failed/missing VODs** when OBS, disk, or network glitch  
2. **Smoother in-match performance** (less hitching from UpForge background work)  
3. **Faster, more reliable post-match upload** (fewer manual Analyse retries)

All supported games: Valorant, CS2, Deadlock, LoL.

**Success criteria**

- Every match produces a measurable “lap” with sector times and a clear outcome (success or DNF reason)  
- Metrics are cohortable by machine profile bucket (low/mid/high)  
- Deferred uploads survive app restart  
- During a live match (and earlier from game start where agreed), remux / multipart / duel-clip work does not compete for disk/CPU  
- Each Phase 1 fix names which metrics should move  

## 3. Non-goals (this initiative)

- Replacing OBS in Phase 0–2  
- Full product analytics (insight clicked, drills, retention)  
- Long-term player attribute graphs (tilt, aim scores, etc.)  
- Full AI pipeline stage/token/cost telemetry (belongs in `upforge-api` / `upforge-ai-service`)  
- Claiming true in-game FPS as a primary metric  

Those live on a separate **platform data** backlog. This design only requires a shared **`match_correlation_id`** so desktop ops can join later AI/product events.

## 4. Approach

**Evidence-first, phased.**

| Phase | Name | Intent |
|-------|------|--------|
| **0** | Measure | Instrument pipeline + machine profile + local timing sheet |
| **1** | Harden | Quick reliability/FPS/upload fixes; each fix tied to metrics |
| **2** | Durable | Disk-backed upload queue, resumable multipart where practical, single post-match worker, admin cohorts |
| **3** | Native capture (later) | UpForge-owned capture only behind flag; dual-run until quality bar met |

Phase 0 and Phase 1 ship together where practical (instrument while hardening), but **no Phase 1 claim of “improved” without Phase 0 events landing**.

## 5. Data model (ops-focused)

Three long-term streams (only **ops** is in scope now):

| Stream | Purpose | Owner (eventually) |
|--------|---------|-------------------|
| `ops_session` | Record/upload health, machine profile, DNFs | Desktop + funnel/ops API |
| `product_event` | Engagement | Frontend / product (backlog) |
| `coaching_fact` | Versioned behaviours/insights | AI pipeline (backlog) |

**Join key:** `match_correlation_id` (UUID generated at match/recording start on desktop, sent on upload + funnel props, echoed by API/AI later).

### 5.1 Machine profile

Collected once per session (and on change). Attached to ops events by reference or inline summary.

- CPU model, logical cores  
- RAM GB  
- GPU name(s)  
- GPU driver version  
- OS + build  
- App version, OBS version  
- Display count / primary resolution  
- Free disk on record drive (at profile refresh)  
- Detected encoder (NVENC / AMF / QSV / x264)  
- Derived **bucket:** `low` | `mid` | `high` (rule documented in code; tunable)

**Privacy:** model strings only. No hostname, no user file paths, no raw usernames. Subject to consent / ops-diagnostics class (see §8).

### 5.2 Per-match ops session (lap)

**Sector times (ms)**

| Sector | From → To |
|--------|-----------|
| `detect_to_record_start` | Match/live detect → `StartRecord` OK |
| `end_to_file_ready` | Match end → file settled + path resolved |
| `remux_compress` | Remux/compress start → done (0 if skipped) |
| `upload` | Upload start → S3 complete |
| `analysis_accepted` | Complete API → analysis queued/accepted |
| `lap_end_to_analysis` | Match end → analysis accepted |

**Recording facts**

- Game, mode/queue if known, map/match id when available  
- Resolution, target FPS, encoder, bitrate (applied vs **observed**)  
- Output format, output mode (Simple vs Advanced)  
- Duration, file size  
- Audio: track count; optional silence/clipping flag if cheap to detect  
- Capture target: method (game/window), window/game title, monitor index if known  
- End reason: `clean` | `interrupted` | `crash_suspected` | `manual` | `too_short` | `discarded` | …

**During-match samples** (every ~10–15s while recording; retain summary + optional last-N locally)

- OBS output FPS vs target  
- OBS skipped / lagged frames (render + encode if available)  
- Reconnect count  
- Free disk  
- Whether background upload/remux was aborted for match priority  

**Not primary:** true game FPS, continuous full CPU/GPU/VRAM for all users. Richer system dump only on failure or opt-in verbose diagnostics.

**File validation**

- Duration (probe)  
- Size  
- Checksum (e.g. sha256 of file or of first/last chunk + size; exact scheme in plan)  
- Probe OK / moov / format notes  

**Upload**

- Start/complete, retries, MB/s, stall aborts, deferrals, multipart concurrency  

**DNF / skip reasons** (explicit enums)

Examples: OBS not ready, Advanced Output still active, disk critical, mode filtered, path fallback used, settle timeout, probe/remux fail, upload abort, quota, too short, capture retarget fail.

### 5.3 Surfaces

1. **Local Last Match Timing sheet** — expand today’s `LastMatchDiagnostic` into sector times + DNF + key OBS/audio/capture fields  
2. **Funnel / ops API events** — extend desktop funnel (or dedicated ops endpoint) with properties above + `match_correlation_id` + machine bucket  
3. **Phase 2 admin cohorts** — p50/p95 sectors and DNF rates by hardware bucket and app version  

## 6. Phase 0: Instrumentation

**New / extended modules (names indicative)**

- `machine-profile.ts` — snapshot + bucket  
- `match-telemetry.ts` — correlation id, sector timers, samples, emit local + API  
- UI: Last Match Timing panel  

**Wire points**

- Game detect / match wait / record start-fail  
- OBS ensure, settings apply vs observe (incl. Advanced)  
- In-match OBS stats poll  
- Stop, path resolve (incl. fallback flag), file settle  
- Remux/compress, upload, analysis accept  
- Match-priority abort/defer  

**API**

- Reuse `/api/funnel-events` with richer properties **or** add `/api/ops-events` if funnel validation is too narrow. Prefer minimal API change first; split if payload/retention needs diverge.  
- Throttle and size-limit properties. No stack traces in funnel (errors stay on existing error reporter).

## 7. Phase 1: Harden (metrics-gated)

Ordered by impact:

1. **Fail-closed on OBS Advanced Output** if Simple/bitrate did not stick  
2. **Persist deferred uploads** to disk (survive restart)  
3. **Match priority earlier** — abort remux/multipart/duel work on `game-started`, not only while `isActivelyRecording()`  
4. **Serialize post-match disk work** — remux → VOD upload → duel clips (avoid dual-read saturation)  
5. **Safer path resolve** — prefer OBS path; fallback requires stronger mtime/size/ownership match; always flag `path_fallback`  
6. Keep emitting Phase 0 events for each of the above  

**Out of Phase 1:** full `index.ts` rewrite, native capture, Sentry overhaul.

## 8. Privacy, consent, retention

Separate classes:

| Class | Examples | Default |
|-------|----------|---------|
| Ops diagnostics | Sectors, DNF, OBS lag, machine bucket, correlation id | On when authenticated desktop (document in privacy policy); allow opt-out if product requires |
| Product analytics | Insight opens, drills | Backlog; consent as needed |
| Coaching intelligence | Behaviour scores | Backlog; purpose-limited |

**Minimisation**

- No continuous high-frequency system telemetry for all users  
- No file paths in cloud events (local logs may keep paths)  
- Hardware: model strings + bucket, not fingerprinting beyond support needs  
- Retention: align with existing funnel/error retention; document TTL for ops events  
- Deletion: ops events tied to user_id must be deletable with account deletion  

Exact consent UX is a product decision; architecture must not assume “collect everything forever.”

## 9. Phase 2: Durable pipeline

1. Disk-backed upload/analyse job queue  
2. Resumable multipart where practical  
3. Single post-match worker (ordered stages)  
4. Admin views: cohorts by bucket, version, game; sector percentiles; DNF rates  

## 10. Phase 3: Native capture (later)

OBS remains until a UpForge capturer can dual-run and match quality bar:

- No audio loss / A-V desync  
- No stray raw cursor when undesired  
- Correct game window (never wrong monitor/desktop)  
- Crash-safe output  
- Encoder parity (NVENC/AMF/QSV)  

Feature-flagged; no hard cutover.

## 11. Platform data backlog (explicitly deferred)

From external review; valuable later, not this initiative:

- Full AI stage timings, tokens, cost, model versions  
- Insight/clip/drill engagement analytics  
- Long-term player attribute store  
- Structured coaching facts as primary training corpus  
- True in-game FPS overlay  

Desktop only commits to **`match_correlation_id`** so those systems can join.

## 12. Risks

| Risk | Mitigation |
|------|------------|
| Over-collection / GDPR | Classes, minimisation, opt-out path, no paths in cloud |
| Noise without action | Local timing sheet + change rule (“name the metric”) |
| Funnel schema too tight | Ops endpoint or loose properties JSON with version field |
| OBS stats unavailable | Degrade gracefully; mark sample gaps |
| Correlation id lost on crash | Persist id with recordings-store row early |

## 13. Verification

- Unit tests: sector timer, DNF enums, path-fallback rules, deferred queue persist/restore, Advanced fail-closed  
- Manual: one match on mid-tier machine → timing sheet filled; events visible server-side  
- Before claiming Phase 1 wins: compare DNF rate and sector p95 for same hardware bucket / app version  

## 14. Related docs

- `docs/superpowers/plans/2026-07-15-match-performance-hardening.md`  
- `docs/UPLOAD-VS-ANALYSIS.md`  
- Exploration notes: OBS-only capture; FFmpeg post-match; upload deferral currently in-memory  

---

## Spec self-review (2026-07-26)

- Placeholders: none intentional  
- Consistency: Phase 0 metrics include ChatGPT gaps we accepted (audio, capture target, crash/interrupt, checksum, GPU driver, correlation id, consent classes)  
- Scope: platform/AI/product coaching data deferred to backlog  
- Ambiguity: funnel vs ops endpoint left as “prefer funnel first”; resolved in implementation plan  
