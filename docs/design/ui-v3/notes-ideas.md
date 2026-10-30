# P6 home-run ideas (round 9)

Desktop only; no API/AI changes; no AI spend.

| Idea | Status | Where | Data |
|---|---|---|---|
| Session coach | Built | Home (Valorant, above the main column) and the post-game pop-up (compact) | New local ranked-games log from the Riot client's competitive updates (`electron/main/valorant-ranked-log.ts`, `userData/valorant-ranked-games.json`, per UpForge user + Riot account, capped at 300 games). IPC `valorant:ranked-games`. |
| Focus streaks | Built | Home focus panel: "3 games in a row on target." + badges `focus-streak-3` "Locked In" and `focus-streak-5` "Habit Formed" via the existing achievements | Current focus checks (trailing hits). |
| Smart clip titles | Built (v3 only) | Clip tiles and the clip player title | Trigger, kill count, weapon (only when every kill used it), single-kill victim agent, round (round-based games only). User titles always win; old default otherwise. |
| Rank pace ("forecast") | Built | Valorant Progress under the rank line; League Progress under the rank sentence | Valorant `rr-history` elo; League rank snapshots. Shown only with ≥20 points over ≥14 days AND a clearly upward least-squares trend (slope − 1 SE > 0); a weeks range ≤ 26 weeks to the next division; hidden otherwise. |
| What I'm working on | Built | Home focus panel: "Copy what I'm working on" → clipboard | Active focus only. |
| Duo insights | Not built | — | No party data is kept anywhere locally (`partyId` is not in the uploaded or stored match data). A teammate-name proxy across local recordings is possible later but would be an inference; skipped per "only if the data exists". |

## Rules applied
- Whole numbers in sentences ("3 losses in a row", "won 4 of your next 12 games, against 26 of 50 overall").
- Session coach makes no mood/health claims; the personal line needs ≥10 "next game after two losses" samples, otherwise a neutral suggestion.
- Session = games starting ≤2 h apart; the current session must have a game in the last 3 h.
- Rank pace is a range, never a single date; never shown for flat/falling trends or Radiant/apex.
- Smart titles never invent callouts or times (clip records don't carry them).

## Not seen on screen
- Session coach and the ranked log need Valorant running (Windows). Covered by tests.
- Rank pace: hidden on the signed-in account (trend not clearly upward over the whole history) — correct behaviour.

## Tests
`src/lib/ideas/*.test.ts` (15), `electron/main/valorant-ranked-log.test.ts` (2). Desktop suite: 1,829 passed.
