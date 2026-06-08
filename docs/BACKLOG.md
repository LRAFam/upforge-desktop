# UpForge backlog

## Internationalization (Spanish → French) — target: next month

**Status:** Planned (not started)  
**Trigger to ship:** English non-branded GSC clicks ≥30/month for 2 consecutive months, OR clear LATAM inbound demand.

### Principles

- **Fully isolated locales** — no mixed-language pages or shared blog lists.
- English stays at root (`upforge.gg/...`).
- Spanish at `upforge.gg/es/...`, French at `upforge.gg/fr/...` when added.
- Each locale has its own content, coaching prompts, sitemap slice, and analytics.

### Phase 1 — Spanish validation (week 1–2)

- [ ] Add `locale` column to `blogs` table (`en` default; API filter by locale).
- [ ] Nuxt: `@nuxtjs/i18n` with `strategy: 'prefix_except_default'`.
- [ ] Spanish landings only (no full app translation yet):
  - `/es/valorant/analyze`
  - `/es/valorant/como-subir-de-rango`
  - `/es/desktop`
  - `/es/valorant/submit`
- [ ] 5–10 native Spanish blog posts (not machine-translated).
- [ ] Coaching reports: Spanish prompt template + account language preference.
- [ ] `sitemap-es.xml` (separate from English sitemap).
- [ ] GSC: track `/es/` path performance separately.

### Phase 2 — Spanish expansion (week 3–4)

- [ ] Spanish dashboard copy (high-traffic screens only).
- [ ] 20+ Spanish blog posts if Phase 1 shows impressions → signups.
- [ ] Footer + hreflang on equivalent EN/ES pages.
- [ ] Discord `#español` or segmented channel.

### Phase 3 — French (after Spanish metrics reviewed)

- [ ] Same isolated pattern at `/fr/` — separate content queue, not shared with ES.

### Success metrics (90-day review)

- Spanish organic impressions in GSC.
- Spanish signups attributed to `/es/` paths.
- Spanish free → paid conversion vs English baseline.
- Do **not** proceed to full UI i18n until Spanish **paid** conversions exist.

### Explicitly out of scope for Phase 1

- Machine-translating existing English blogs.
- Brazilian Portuguese (separate locale later — likely bigger than ES for Valorant).
- Subdomains (`es.upforge.gg`) — use subfolders for domain authority.

---

## Desktop — local recording deduplication

**Status:** Fixed (pending release)  
**Issue:** Startup orphan scan re-imported raw OBS files when a `_upforge` compressed sibling already existed on disk / dashboard.

**Fix:** Sibling-aware known paths, prefer compressed file for import, dedupe `recordings.json` on load, update store path after compression.
