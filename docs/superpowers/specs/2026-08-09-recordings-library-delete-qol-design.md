# Recordings library: delete + QoL design

**Date:** 2026-08-09  
**Service:** `upforge-desktop`  
**Status:** Approved  
**Surface:** `/recordings` (`RecordingsView.vue`)

## Goal

Let users remove stale or unwanted VODs from the Recordings tab, and make the library easier to scan (grouping, status filters, storage, multi-select) without turning it into a second Dashboard.

## Decisions

| Topic | Choice |
|-------|--------|
| Delete scope | Local file + library by default; cloud archive never deleted in this pass |
| Cloud-backed | Offer **Delete local only** vs **Remove from library** |
| Pass size | Delete + high-impact QoL (not full Dashboard parity) |
| Grouping | Date groups + status filter chips |
| Approach | Thin upgrade on existing IPC; no shared Clips chrome extraction |

## §1 Delete behavior

Reuse and extend `recordings:dismiss` (or a thin wrapper) so cloud-backed locals can delete files when requested.

| State | Confirm | Result |
|-------|---------|--------|
| Local only | “Delete this recording?” | Remove catalog + delete local MP4 variants |
| Cloud-backed + local | Two choices | **Delete local only** (keep library entry as Cloud) · **Remove from library** (delete local, keep cloud archive) |
| Cloud only (no local) | “Remove from library?” | Catalog gone; cloud untouched |
| Uploading / Analysing | Confirm abort | Abort in-flight (existing), then dismiss |

### Modes (IPC)

- `remove` — drop catalog; delete local file when present (local-only or cloud-backed)
- `localOnly` — delete local files; keep catalog; clear `path` (and related local-only fields) so the badge reads Cloud

Return `{ ok, deletedLocal, freedBytes }` for UI feedback.

### Multi-select

Same per-item rules. One confirm with summary (e.g. “3 local, 1 cloud-backed”). Process items sequentially; on failure, continue the rest and show a single summary of successes + failures.

## §2 Library chrome

Toolbar under the header:

- Status chips: `All` · `Needs attention` · `Ready` · `Analysed` · `Cloud`
- Existing game pills when multiple games present
- Count + compact storage (`storage.getUsage`) + **Open folder** (`storage.openFolder`)
- **Select** enters multi-select mode

List:

- Date groups: `Today` / `Yesterday` / `This Week` / `This Month` / `Older` (same buckets as Clips)
- Newest group expanded; older collapsed by default
- Large groups: first ~12 cards, then **Show more**
- Cards keep map art + status badge; checkbox in select mode; trash/overflow for delete

### Needs attention

Any of: Failed, unavailable/missing local+cloud, stuck Syncing/Finalizing, or Analyse blocked with a retry path (e.g. Riot stats retry).

## §3 Card actions

Normal mode:

- Primary: `Watch` / `Review` (unchanged)
- Secondary: `Analyse` / `Retry sync` when useful (unchanged)
- New: `Delete…` → §1 confirm
- Failed / missing / stuck: short status line + `Retry` and/or `Delete`

Selection mode:

- Checkboxes; sticky bar: `N selected` · `Delete` · `Cancel`
- Hide Watch/Analyse while selecting

Copy: prefer “Delete recording” / “Remove from library” over “Dismiss”. After delete, show freed space when known.

## §4 Architecture

### Main

- Extend dismiss IPC with modes above; keep abort-in-flight for uploading/analysing
- Reuse `deleteLocalRecordingFiles`, `storage.getUsage`, `storage.openFolder`
- No new cloud-delete API

### Renderer

- Primary edits in `RecordingsView.vue`
- Small helpers: date grouping, status chip classifier, delete confirm flow
  (e.g. `recording-library-groups.ts`)
- Do not extract shared Clips toolbar components in this pass

### Tests

- Unit: date grouping, status chip classification, delete-mode choice from recording state
- IPC/store: `remove` vs `localOnly` free bytes / keep cloud / catalog updates
- Type-check desktop after UI wiring

## Out of scope

- Deleting cloud archives from the API
- Save to cloud, demo attach, pipeline abort UI beyond existing dismiss abort
- Shared Clips/Recordings component extraction
- Raising or surfacing the 50-entry catalog cap (optional tip later)
- Clips-only sessions still excluded from this library

## Success criteria

1. User can delete unwanted/stale VODs from `/recordings` without visiting Dashboard or Settings.
2. Cloud archives are never deleted from this tab; users can only free local disk and/or hide the library row.
3. Library is scannable via date groups + status chips; storage and open-folder are one click away.
4. Multi-select cleanup works for mixed local/cloud batches with one clear confirm.
