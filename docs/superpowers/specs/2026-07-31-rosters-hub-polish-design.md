# Rosters hub polish (approach A)

## Score
- Canonical field: `overall_score` (0–100 from API).
- Display: `overall_score * 10` out of 1000, plus `scoreGrade` (S best).
- Same presentation as Matches / dashboard (number + letter badge).

## Layout
Match desktop chrome used elsewhere:
- `#111111` shell, sticky header bar, `dash-panel` stats strip
- Section labels with gradient rules (dashboard style)
- Match rows: map underlay + agent (or game logo), role/game chips, date, score + grade, CTA
- Coach row: avatar, rank icon, Free/Paid, specialties
- CS2 maps without radar (e.g. Vertigo): game logo thumb + humanized map name

## Out of scope
Map splash card layout (approach B). Bundling Vertigo radar assets.
