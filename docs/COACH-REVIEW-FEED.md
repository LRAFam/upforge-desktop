# Coach Review Feed

**Status:** v1 shipped (web)  
**Route:** `/coach-dashboard/reviews/feed`  
**API:** `GET /api/coach/review-feed`

Full-VOD coach queue with AI briefing, chapter markers, and quick timeline notes — designed for clearing roster reviews fast (Shorts-style throughput, full-match depth).

Aligns with [COACH-HUB-V1.md](./COACH-HUB-V1.md) and the Coach Pro coaching suite positioning.

---

## Product model

| Layer | Behaviour |
|-------|-----------|
| **Queue rail** | Pending roster reviews, one card per student submission |
| **Main workspace** | Full VOD player + AI pre-pass panel + chapter scrubber |
| **Quick notes** | Preset chips + custom note at playhead (timestamp + inferred round) |
| **Sidebar** | Notes this session, expand to full VOD Review / classic inbox item |
| **Complete & next** | Marks roster review done, notifies student, advances queue |

**Scope v1:** Roster reviews only (`source = roster`). Paid micro-coaching stays on classic inbox (`/coach-dashboard/reviews/:id`).

---

## API

### `GET /api/coach/review-feed`

Coach auth required. Returns pending + in-progress roster reviews enriched with analysis context.

```json
{
  "success": true,
  "items": [
    {
      "review": {
        "id": 12,
        "status": "pending",
        "source": "roster",
        "student_question": "Why did I keep losing mid?",
        "round_numbers": [14],
        "requested_at": "2026-06-22T12:00:00Z",
        "annotation_count": 0
      },
      "student": { "id": 5, "name": "Alex" },
      "analysis": {
        "id": 99,
        "map": "Ascent",
        "agent": "Jett",
        "video_url": "https://…",
        "overall_score": 62,
        "top_issue": "Over-peeking B site",
        "priority_improvements": ["…"],
        "coaching_tags": ["over_peeking"],
        "match_highlights": [{ "id": "…", "kind": "mistake", "video_offset_ms": 842000, "round": 13 }],
        "duration_sec": 2400
      },
      "annotations": [],
      "queue_position": 1,
      "suggested_start_ms": 842000
    }
  ],
  "meta": {
    "pending_count": 1,
    "roster_reviews_this_month": 4,
    "roster_reviews_limit": 30,
    "has_active_coach_pro": false
  }
}
```

**Implementation:** `CoachReviewFeedService` (`upforge-api`) — uses `MatchHighlightsService` + `VODAnalysisService::resolveMatchDataForAnalysisLog`.

**Reused endpoints for actions:**
- `POST /api/coach/reviews/{id}/annotations`
- `POST /api/coach/reviews/{id}/complete-roster`

---

## Frontend (upforge-frontend)

| File | Role |
|------|------|
| `app/pages/coach-dashboard/reviews/feed.vue` | Page shell + queue state |
| `app/components/coach-feed/CoachReviewFeedQueue.vue` | Left pending rail |
| `app/components/coach-feed/CoachReviewFeedWorkspace.vue` | VOD + AI brief + chapters + chips |
| `app/components/coach-feed/CoachReviewFeedSidebar.vue` | Notes + expand links |
| `app/composables/useCoachHub.ts` | `getReviewFeed()` |
| `app/types/coach-hub.ts` | Feed types |

**Entry points:**
- Review Inbox → **Open feed**
- Desktop coach notification → opens feed URL

---

## Keyboard shortcuts (web)

| Shortcut | Action |
|----------|--------|
| `⌘/Ctrl + ↑` | Previous queue item |
| `⌘/Ctrl + ↓` | Next queue item |

---

## Local demo data (one command)

After `LocalTestSeeder`, seed a pending roster review without running the full analysis pipeline:

```bash
cd upforge-api
php artisan db:seed --class=CoachHubFeedDemoSeeder
```

Creates roster membership (student → Pro Coach Sarah) + pending review on an Ascent/Jett analysis. Log in as `coach2@test.com` / `password` → `/coach-dashboard/reviews/feed`.

Re-run safely — idempotent via `firstOrCreate`.

---

## E2E checklist

1. Coach enables roster, student joins
2. Student analyses match → **Ask my coach**
3. Coach opens `/coach-dashboard/reviews/feed`
4. VOD autoplays from AI suggested moment (when highlights exist)
5. Coach adds quick notes → **Complete & next**
6. Student receives notification → VOD Review shows coach notes

```bash
cd upforge-api && php artisan test --filter=test_coach_review_feed
```

---

## Later

- [ ] Mobile PWA: vertical swipe between queue items
- [ ] Paid review support in feed (structured submit flow)
- [ ] `?review=12` deep link from desktop notification
- [ ] Auto-queue analysed roster games (student opt-in)
- [ ] Coach markers on shared timeline scrubber in feed player

---

## Related

- [COACH-HUB-V1.md](./COACH-HUB-V1.md)
- [COACH-HUB-E2E.md](./COACH-HUB-E2E.md)
