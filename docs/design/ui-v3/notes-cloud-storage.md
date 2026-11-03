# Cloud storage · cloud retention (desktop, branch feat/cloud-retention)

The v3 cloud storage flow was already in the app. It has the Cloud storage page (`CloudStorageView` v3 branch), the usage bar, `StorageAddonPicker` v3 (buy, change and cancel through the existing Stripe checkout), Settings › Account usage, the Matches "Manage storage" link and `CloudUsageNotice`. This work does not rebuild it. It checks that flow against the approved retention rules and adds what was missing: countdowns, warnings, "Keep it in the cloud", "Download", "Full video no longer stored", playing the copy on this PC first, and the `upforge://cloud-storage` link. All new UI depends on data. With an older API (no `retention` field, `/account/cloud-retention` 404) every screen looks the same as before.

## What changed
- **`src/lib/cloud-retention.ts` (new, pure, tested):** parses the `retention` object and the summary. It also builds the countdown text ("Removed from cloud in 9 days / 1 day / today"), the over-quota and plan-ended copy, the plan's keep time ("Free: each video kept 14 days" / "Kept while you're subscribed"), the expiring-soon warning and the post-game line. `chooseVideoSource` picks the video: this PC first, then the cloud, then none.
- **`src/composables/useCloudRetention.ts` (new):** one shared, cache-first load of `GET /account/cloud-retention` per window, using `useStaleLoad` with key `cloud-retention`. It refreshes at most every 30 s and resets on sign-out or user change. Exposes `keepTime`, `savesPaused`, `savesPausedMessage` and `expiringLine`.
- **IPC (`cloud-storage-ipc.ts`):** new channel `cloud-storage:retention`. It is required for the summary, so it breaks the "no new IPC" rule on purpose and needs the lead's OK. `playback`/`download` now accept `analysis_video`: `GET /account/cloud-videos/analysis/{id}` returns `download_url`. HTTP 410, or a null URL, now returns `removed: true` and "Full video no longer stored…". Preload and `env.d.ts` are updated.
- **`cloud-storage.ts`:** `CloudFile.kind` accepts `analysis_video` (id = numeric analysis id or UUID) and an optional `retention`. This fixes a real gap: the new API's `analysis_video` items would have made the whole page fail with "Cloud library could not be verified".
- **Cloud storage page (v3 branch only):**
  - Shows the keep time under the bar, and the over-quota message with "Add space".
  - Each row shows its countdown, with "Keep it in the cloud" (scrolls to the pack picker) and "Download".
  - Removed videos show "Full video no longer stored" and open the match's notes (via `analysis_id`) instead of a dead player.
  - "Keep in paid storage" is hidden once `retention` exists, because under the new rules the pack keeps everything. "Remove cloud copy" is hidden for analysis videos, which have no API for it.
  - The retention notice and the "How storage works" text follow the new rules once `started`.
  - `?keep=1` scrolls to the storage options.
- **`StorageAddonPicker`:** the v3 copy explains the pack rule when the new prop `retention-started` is true. Packs stay 50/100/250/500.
- **Matches:**
  - One warning line under the header: saves paused, or "N videos leave the cloud soon · first in X days", linking to `/cloud-storage?keep=1`.
  - Each row's status column has one cloud line: the countdown (links to keep options), "Save to cloud" for idle matches that are only on this PC, or "Full video no longer stored".
  - "Save to cloud" uses the existing `recordings:save-to-cloud`. When the quota is full it opens a `UfDialog` with the message and "Add space" instead of uploading.
  - `footageUnavailable`/`openBest`: a removed but analysed match still opens (notes, clips, stats). The copy on this PC always wins.
- **Match page:** new `CloudRetentionBarV3` shows the countdown, "Keep it in the cloud" and "Download". If the video is removed and nothing is on this PC, it says "Full video no longer stored". It stays silent when the video plays from this PC. Archive timelines carry `cloudRetention` from `/recordings/archive/{id}.retention`, and analysis timelines carry it from `analysis.cloud_video`.
- **Video source (both UIs):** `resolveCloudFirstPlaybackUrl` now plays a browser-playable file on this PC first. A raw `.mkv` is still the last resort, which keeps the v2.5.49 fix. Tested.
- **Post-game (v3):** "Free plan: this video stays in the cloud for 14 days." (or the full-space line) plus "Keep it in the cloud" (opens main → `/cloud-storage?keep=1`). It shows only when ready and analysed.
- **Deep link:** `upforge://cloud-storage` is allow-listed → `{ kind: 'open-cloud-storage' }` → `/cloud-storage` in both UIs. In-app bell: `cloud_video_expiring`, or `data.deep_link === 'upforge://cloud-storage'`, opens Cloud storage.

## Follow-up: `keep_time` state (removal dates switched off)
- The API returns `{ state: "keep_time", expires_at: null, days_left: null, keep_days, reason }` while deletion is off. The summary has `removal_dates_shown: false` and an empty `expiring_soon`.
- `parseRetention` reads `keep_days`. If it is missing, it falls back to 14 days, or 30 after a plan ends.
- `retentionLine` gives soft copy with no date. "Kept for 14 days on Free" (rows read "… · Keep it in the cloud"), "Kept for 30 days after your plan ended", "Cloud space full · kept for 14 days".
- Tone is quiet. Keep and Download stay. The video still plays from the cloud.
- `expiring_soon` keeps only dated `countdown` items, and is empty when `removal_dates_shown === false`. The Matches warning line, built from it, therefore shows only for real countdowns. The Cloud storage notice count uses `tone: 'warn'`, which keep_time never has.

## Flow map (entry point → screen → action) · existed / changed
| Entry point | Screen | Action | Status |
|---|---|---|---|
| Settings › Account usage "Manage storage" | Cloud storage | bar, pack picker | existed |
| Matches header "Manage storage" | Cloud storage | — | existed |
| Matches warning line (expiring / full) | Cloud storage `?keep=1` | scroll to pack picker | **new** |
| Matches row countdown | Cloud storage `?keep=1` | keep (pack / plans), download on the row there | **new** |
| Matches row "Save to cloud" | (in place) | upload, or full-quota dialog → Add space | **new** in v3 (existed in classic dashboard) |
| Matches row, removed video | Match page via analysis | notes and clips, no video; this PC's copy plays if present | **changed** |
| Match page countdown bar | Cloud storage `?keep=1` / Download | keep, download | **new** |
| Post-game (v3) keep line | main window → Cloud storage `?keep=1` | keep | **new** |
| Bell notification `cloud_video_expiring` | Cloud storage | — | **new** |
| Email / notification `upforge://cloud-storage` | Cloud storage | — | **new** |
| Cloud storage row countdown | same page | Keep it in the cloud → pack picker; Download | **new** |
| Pack picker buy / change / cancel | Stripe (existing checkout) | unchanged flow, copy updated | existed / copy changed |
| Compare plans | pricing (existing `startCheckout browse`) | — | existed |

## Lead-owned / base changes needed
- None in `v3.css` or the base components.
- New IPC channel `cloud-storage:retention`. Please approve it.

## Open risks
- Nothing was screenshotted (this worktree isn't running). Everything is checked by unit tests and type-check only. Nothing was bought or saved in the live app.
- Playing the file on this PC first changes behaviour for analysed matches in both UIs whenever a playable `.mp4` is on the PC. If an uploaded copy was trimmed relative to the local file, offsets could differ. Watch the first review after deploy.
- The analysis-video download id is assumed to be the analysis id, as the lead stated; the API accepts the job UUID too.
- Countdowns on rows depend on the API putting `retention` on `/account/cloud-storage` items. If the matches list (kind=recording) leaves it out, rows stay quiet.
- The OS toast poller (`coach-notification-poller.ts`) doesn't turn `cloud_video_expiring` into a desktop toast. Only the bell and email do.
- The classic post-game "Free keeps cloud VODs for X days… Plus keeps them 90 days" text is unreachable (`compactPostGameUi = true`) and was left alone, though it doesn't match the new rules.
- Clips view (`ClipsV3`) has no countdown. Clips are never removed by this, so none is needed.
