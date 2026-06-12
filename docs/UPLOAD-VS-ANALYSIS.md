# Upload vs analysis — product model

**Status:** Target architecture (partially implemented)  
**Principle:** Cloud storage and AI analysis are **separate actions** with **separate quotas**. Users choose what they want per VOD or clip.

Do not treat “upload” and “analyse” as one bundled verb in copy, API design, or UI defaults.

---

## Two quotas, two purposes

| Action | Purpose | Quota | User gets |
|--------|---------|-------|-----------|
| **Save to cloud** | Backup, playback, retention, share | Storage / archive quota (tiered by plan) | VOD or clip playable from cloud; local file can be removed |
| **Analyse** | AI coaching report | Analysis quota (monthly + PPA) | Insights, scores, post-game review |

Users may want **cloud only**, **analyse only**, or **both**. All three are valid.

---

## VOD flows (match recordings)

### Intended user choices

1. **Save to cloud** — Upload VOD for review/playback. Does **not** consume analysis quota. Frees disk when `autoDelete` is on.
2. **Analyse** — Run full-match coaching. Consumes **one analysis**. Requires the server to have the video (upload as part of analyse, or analyse an already-archived cloud VOD).
3. **Save + analyse** — Convenience one-click (today’s post-game default when auto-analyse is on).

### Analyse without long-term cloud

If the user only wants coaching, not a cloud library entry:

- Upload transiently for processing, **or**
- Analyse from an already-archived recording without re-upload.

Backend should support `analyse_only` on existing `recording_id` / `archive_id` so repeat analyse or “coaching only” does not imply permanent cloud retention beyond policy.

### Current desktop behaviour (gap)

| Path | Today | Target |
|------|-------|--------|
| Post-game auto-analyse | Upload + `complete()` queues analysis | Unchanged as **both**; add explicit “Save to cloud only” |
| Dashboard “Analyse” on pending | `doUploadAndAnalyse` | **Analyse** (uses analysis quota) |
| Settings / Dashboard “Upload to cloud” | `doUploadAndAnalyse` — **wrong** | **Archive only** — storage quota, no analysis |
| Cloud playback | Via `analysisId` on analysis job | Also via `archiveId` when saved without analysis |

### API sketch (backend)

```
POST /api/recordings/archive/presign   → archive_id, upload_url
POST /api/recordings/archive/complete  → recording stored, no analysis queued

POST /api/desktop-submissions/presign  → existing (analysis path)
POST /api/desktop-submissions/complete → add optional intent: "analyse" | "archive_only"

POST /api/recordings/{archive_id}/analyse  → queue analysis on existing cloud VOD (1 analysis quota)
```

Profile should expose **both** counters, e.g. `archive_stats` (used/limit) and `analysis_stats` (used/limit).

---

## Clip flows

### Intended user choices

1. **Upload** — Clip on cloud / feed-ready. Storage or clip-hosting quota. No AI coaching.
2. **Analyse** — AI coaching on clip. Analysis (or clip-analysis) quota. Requires clip on server (`apiClipId`).
3. **Upload + analyse** — Optional shortcut, not the default.

### Current desktop behaviour

| Layer | Today | Target |
|-------|-------|--------|
| IPC | `clips:upload` and `clips:request-analysis` are **separate** | Keep |
| UI | `uploadClip()` chains upload → analyse automatically | **Decoupled** — Upload only; separate Analyse action |

---

## UI copy guidelines

| Avoid | Prefer |
|-------|--------|
| “Upload for analysis” (when user only wants cloud) | “Save to cloud” / “Upload to cloud” |
| “Upload and analyse” as the only button | Separate **Upload** and **Analyse**; optional **Upload & analyse** |
| “Upload all to cloud” that burns analysis quota | “Save all to cloud” (archive) vs “Analyse all pending” |
| Single “analyses used” for all upload actions | Show **cloud storage** and **analyses** separately in Settings |

---

## Settings defaults (future)

- **Auto-analyse after game** — unchanged; explicit opt-in to **both**.
- **Auto-save to cloud after game** — new; archive only, no analysis burn.
- **Default post-game action** — radio: Off | Cloud only | Analyse | Both.

---

## Relation to AI model strategy

See [AI-MODEL-STRATEGY.md](./AI-MODEL-STRATEGY.md).

- **Cloud-only uploads** still grow the consented VOD corpus (with training opt-in).
- **Analysis-only** still produces labels and feedback without forcing long retention.
- Decoupling increases upload volume (disk relief) without punishing users who are out of analysis quota.

---

## Implementation checklist

### Backend
- [x] Archive-only presign/complete for VODs (`RecordingArchiveController`)
- [x] `POST /recordings/archive/{archiveId}/analyse` on archived VODs
- [x] `archive_stats` on user profile + tier limits in `config/tiers.php`
- [ ] Clip analyse quota independent of clip upload limits (if not already)

### Desktop
- [x] Clips: decouple upload UI from automatic analyse
- [x] VOD: `archiveUpload()` in upload-manager
- [x] `storage:upload-pending` uses archive path (no analysis quota burn)
- [x] Post-game: “Save to cloud” vs “Analyse”
- [x] Dashboard pending row: separate **Save** and **Analyse** actions
- [x] Settings: show archive quota + analysis quota
- [x] `recordings-store`: `archiveId` distinct from `analysisId`
