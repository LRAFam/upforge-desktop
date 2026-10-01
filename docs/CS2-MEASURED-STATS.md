# CS2 measured statistics contract

Desktop demo parsing now supplies optional `match_stats` with `schema_version: 1`. The upload preserves it, the AI service includes it in coaching context and report output, and the web adapter retains its groups and round count. No API database migration is needed: the existing JSON payload carries the object.

## Measurement definitions

- Only completed, non-warmup rounds beginning at freeze end are included. Missing player participation snapshots prevent a report from presenting a partial selection as full-match statistics. Player identity is the Steam ID resolved by the existing timeline parser.
- Side membership comes from per-round snapshots and event-time team fields, not the player's final team. Kills exclude self/team kills. Deaths include all local deaths. K/D uses kills divided by max(deaths, 1).
- ADR counts enemy health removed, capped at the victim's remaining health. It excludes overkill, friendly damage and damage outside the live-round interval. Incomplete health evidence makes damage metrics unavailable.
- Headshot percentage is headshot kills divided by kills; zero kills produces zero. It is not head hits divided by shots.
- KAST: a round with a kill, assist, survival at round end, or the player's killer eliminated by a teammate within five seconds. Missing survival snapshots make KAST unavailable.
- Opening duels use the first enemy kill of the round. Multikills count rounds with at least two enemy kills. Zero-impact rounds currently means no kill or assist, not a claim that utility or information had no value.
- A clutch attempt occurs when the player becomes the last teammate alive with opponents remaining. A win requires that side to win the round.
- Grenade throws come from grenade `weapon_fire` events, not projectile position samples or detonations. Total includes decoys; Molotov count includes incendiaries. Flash counts count positive-duration victim events, exclude self flashes, and distinguish teams. These are event counts, not unique players across the match.
- Equipment is measured at freeze end. Legacy field names `full_buys`, `force_buys`, `eco_rounds` are bands of >=4000, 1500–3999, <1500 respectively. They do not establish buy intent or team coordination. The coach context and web UI explain this.
- `avg_saved` is mean equipment retained at round end across played rounds, with zero for rounds in which the player died. Missing end equipment data leaves this unavailable.
- Null means unavailable; zero is a measured value. Extraction failures are logged. Older desktop captures use their explicitly supported finalStats contract and do not gain invented extended metrics.

## Verification

- Full desktop suite: 954 passed. The sandbox initially blocked tests that start localhost servers; rerunning with localhost access passed.
- Desktop type check passed. Focused final extraction/parser/upload checks: 15 passed.
- AI pipeline/context/routing tests: 35 passed.
- Web adapter/routing/cache tests: 14 passed. Web type check exited successfully with the existing Vue tooling warning. Changed web files lint cleanly.
- Local Anubis demo re-parsed offline: 19 rounds, 19/14/0, ADR 109.95, HS 52.63%, KAST 57.89%, 27 grenades. Measured groups survived the Python report builder and web adapter unchanged. No model call or production write was needed.

## Shipping and old reports

Desktop extraction and upload changes are included in v2.14.3. The corresponding AI service and frontend changes require separate deployments. No production report data was modified.

Report 649 cannot be filled from its existing sparse submission. Its original Cache demo is required for a backfill. The locally available Anubis and Inferno demos are different matches and must not be substituted. The redesign remains a mock preview; it does not pretend those new statistics belong to report 649.
