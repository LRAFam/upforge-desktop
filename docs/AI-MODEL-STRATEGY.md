# UpForge proprietary AI model — strategy

**Status:** Long-term north star (pre-funding)  
**Trigger to invest:** Sustained revenue + consented corpus at meaningful scale (see metrics below).

UpForge plans to train a **domain-specific gameplay model** (Valorant first, CS2 second) once funding and content are available. Near-term product work should grow revenue **and** accumulate structured, consented training signal — not raw MP4 hoarding alone.

---

## Why this matters

Generic foundation models lack UpForge’s edge:

- Match-linked context (agent, map, rank, outcome, timeline)
- Coach and user corrections on analysis
- Clips grounded to rounds and kill events
- Rank-specific “what good looks like”

Funding buys compute. **Content, consent, and structure** are what we must build through the product now.

---

## Principles

1. **Consent is separate from storage** — “Save to cloud for playback” ≠ “use for model training.” Require explicit opt-in for training use; document in privacy policy and Settings.
2. **Structure beats volume** — Prefer uploads with Riot-linked metadata, timeline JSON, and analysis outputs over orphan files.
3. **Human signal is gold** — Coach reviews, “wrong call” / “missed this” feedback, and accepted/rejected insights become supervision data later.
4. **Retention = asset durability** — Short retention deletes future training/eval sets; tiered retention is both revenue and corpus policy.
5. **Quality gates** — Rank floor, minimum duration, confirmed match ID, deduped recordings; avoid poisoning the dataset with broken or duplicate VODs.
6. **Upload ≠ analyse** — Cloud backup and AI coaching are separate user choices with separate quotas. See [UPLOAD-VS-ANALYSIS.md](./UPLOAD-VS-ANALYSIS.md).

---

## Data we should capture (desktop + API)

| Signal | Source today | Model value |
|--------|--------------|-------------|
| Full-match VOD | OBS → upload pipeline | Visual + audio grounding |
| Match metadata | Riot local API, presign payload | Conditioning (agent, map, rank) |
| Timeline / events | `MatchData`, round events | Temporal alignment for clips and critiques |
| Analysis JSON | Post-upload job result | Initial labels; baseline to improve |
| User/coach edits | *Planned* feedback on insights | High-quality supervision |
| Clips | Local clip store; API upload optional | Short labeled moments (3k, ace, clutch) |
| Outcomes | Win/loss, RR change when available | Outcome-linked reasoning |

Desktop paths worth preserving on every cloud save (with or without analysis): `recordingId`, `archiveId`, `analysisId` (when analysed), `game`, `map`, `agent`, Riot ID, match/timeline payload, upload timestamp, user tier, consent flags.

---

## Product roadmap aligned to model prep

### Phase 1 — Corpus foundation (now → funding)

- [ ] **Decoupled upload vs analyse** — See [UPLOAD-VS-ANALYSIS.md](./UPLOAD-VS-ANALYSIS.md). Archive API + separate analyse-on-cloud; clips UI decoupled first.
- [ ] **Cloud archive without analysis** — `POST /api/recordings/archive`; Pro unlimited, Free capped; does not burn analysis quota.
- [ ] **Tiered cloud retention** — Free 7–14d, Pro extended/unlimited; enforce on API, surface in Settings.
- [ ] **Training opt-in toggle** — Settings + first-upload consent; store `training_consent_at` on user/API.
- [ ] **Richer upload metadata** — Ensure every cloud object has match ID, rank snapshot, game version when available.
- [ ] **Analysis feedback UI** — Thumbs up/down or “missed X” on post-game insights (store with `analysisId`).

### Phase 2 — Labeling flywheel (post-archive API)

- [ ] **Clip cloud sync (Pro)** — Cloud library + share links; link clips to `analysisJobId` and round.
- [ ] **Coach review workflow** — Expert labels on subset of VODs (B2B / creator revenue + gold labels).
- [ ] **Export pipeline (internal)** — Curated splits: train / val / holdout by rank, agent, patch version.
- [ ] **Dedup + quality scoring** — Orphan scan, sibling compression, minimum duration (120s analysis floor already exists).

### Phase 3 — Model program (funding secured)

- [ ] Legal review of consent corpus and regional requirements.
- [ ] Baseline eval set (frozen holdout) before any training.
- [ ] Fine-tune / train on structured gameplay tasks: moment ID, mistake classification, rank-appropriate coaching.
- [ ] Replace or augment external analysis API with UpForge model where quality meets bar.

---

## Revenue features that double as model prep

| Feature | Revenue | Corpus |
|---------|---------|--------|
| Archive-only upload | Pro / PPA | More retained VODs without quota friction |
| Extended retention | Pro upgrade | Long-lived eval and fine-tune sets |
| Clip cloud + share | Pro engagement | Moment-level labeled data |
| PPA at quota choke points | One-off revenue | Keeps uploads flowing when subs lag |
| Playstyle profile (web) | Pro bundle | Aggregate behavioral labels |
| CS2 analysis pack | Game-specific tier | Second domain for multi-game model |

When evaluating backlog items, ask: **Does this increase MRR *or* consented structured data?** Prefer items that do both.

---

## Explicitly out of scope (until Phase 3)

- Training on uploads without explicit training consent.
- Scraping third-party VODs or public streams without rights.
- Full app i18n before core English corpus and analysis quality are stable.
- Building training infra in the desktop app (server-side/data pipeline only).

---

## Success metrics (pre-funding)

- **Consented cloud VODs** — count and hours by rank/agent (monthly growth).
- **Labeled analyses** — feedback events per 100 completed analyses.
- **Retention** — % of Pro users with VODs older than 30d still in cloud.
- **Clip linkage** — % of clips with `analysisJobId` + round metadata.
- **Revenue** — Pro + PPA from storage/archive CTAs (validates willingness to pay for corpus-related features).

Review quarterly alongside `docs/BACKLOG.md`.

---

## Related desktop code

- Upload + analysis: `electron/main/upload-manager.ts`, `doUploadAndAnalyse` in `electron/main/index.ts`
- Recording metadata: `electron/main/recordings-store.ts`, `electron/main/user-data-paths.ts`
- Clips: `electron/main/clip-store.ts`
- Cloud playback: `electron/main/recording-playback.ts`
- Storage cleanup: `electron/main/storage-cleanup.ts`, `electron/main/disk-space.ts`
