# Practice redesign (Nov 2026)

The Practice screen read as a generic dashboard: a caps label on every block, steps numbered
01/02/03, eight blocks of equal weight, generated artwork behind the hero and one table of every
drill. This pass rebuilds Today and adds a Drills tab, on the existing v3 parts and type roles.
No new API endpoints or IPC channels; every number shown comes from data the screen already had.

A first version was all text. The feedback was that it needed real imagery and life, and that
generated artwork and a still of a wall did not do it. So the screen now shows the trainer itself:
run-through clips and real frames of each drill.

## What changed

- **Tabs.** Today · Drills · Results · Leaderboards · Setup. The ids are unchanged (`train`,
  `analytics`, `leaderboards`, `loadouts`); `drills` is new. `practiceOwnsTab()` says which bodies
  the screen draws itself (Today, Drills). Results, Leaderboards and Setup still use the shared
  bodies in `TrainingHubView.vue`.
- **Hero** (`PracticeHeroV3.vue`). Real footage of the drill behind the copy: its run-through clip
  where it has one (muted loop; the still when the player asks for reduced motion), else a frame
  of the drill with the aim point marked by a red line and a square reticle. Never artwork.
- **One hero, decided once.** The four cases and their wording are the ones the screen already had
  (match report, focus, drill from matches, session plan), plus an empty state that offers the
  first warm-up. Two fixes: a focus leads only when it has a trainer drill to start (a focus with
  none used to take the hero and leave it with nothing to do); and the hero holds a placeholder
  until the focus and the drill rulebook are known, instead of drawing the match drill and
  swapping to the focus a few seconds later. The rulebook is now remembered between runs
  (`src/lib/drill-rulebook.ts`, stale cache), so the wait is seen on a first run only.
- **The routine line.** The session's steps along one hairline, with the plan's own phase names and
  durations; the focus step is red. Replaces the 01/02/03 list.
- **In your matches.** The active focus as measured since it was set: starting point, average
  since, the verdict from `focusVerdict`, and one bar per checked match against the starting point
  (`focusBars`). Wording says what was measured, never what caused it
  (`src/lib/coaching-copy-safety.test.ts`). Other games show the "Trainer vs matches" lines only.
- **Drills as picture tiles** (`PracticeDrillTileV3.vue`): a real frame with the target marked,
  the name, the best, the state. The whole tile starts the drill. Where the drill has its own
  clip, pointing at the tile plays it. Used on Today ("Play one on its own", with the daily
  challenge as a tile) and on the Drills tab.
- **Drills tab.** The catalogue grouped by what a drill is for: Your drill (picked from the match
  report, the focus plan or the coach's match drills), Warm-up, Beta lab, More drills
  (`groupDrills`). The category filter is gone; the view's `activeCategory` stays on `all`.
- **Coach drills** ("From your matches") stay as hairline rows, with the drill's frame, or
  "In game" for a task done in the game. Steps are reachable on every row that has them.
- **Removed from this screen.** Quick play (the Drills tab covers it), the right-hand column, the
  drill icons and the generated hero artwork.

## Footage (`drill-frames.ts`)

- `src/assets/training/frames/<scenario>.webp`: one 1600×900 frame per drill, captured from the
  trainer in play with the HUD hidden (21 files, about 200 KB in total), and where the target is
  in each. Drills that open on cover (Angle Clearing, Jiggle Peek, Hold the Angle, 3D Duel,
  Retake Crossfire) are photographed from a spot, or at a moment, where the enemy is in view.
- `src/assets/training/clips/<name>.mp4` + `.webp`: run-through clips recorded in the trainer with
  a scripted hand that waits a beat, eases onto the target and clicks (5 clips, about 2 MB in
  total): Head Height, Micro Flick, Gridshot, Strafe Track, Flick.
- `frameLayout()` places a picture so its aim point sits right of the copy at any window width.
- **No stand-ins.** A clip only ever pictures its own drill, and only a drill this app can start
  (`drill-frames.test.ts` fails otherwise). The map drill's clip was used for Angle Clearing and
  Clear the Site while this was being built; it was taken out before release and comes back with
  the map drill itself. With no drill to picture, the hero plays the Head Height clip under its
  own name.
- Re-capture a frame or clip when a drill's scene changes.

## Checks

- `npm run type-check` clean; `npx eslint` clean on the changed files; `npm test` passes.
- Tests: tabs, routine line, drill groups, focus bars (`practice-v3.test.ts`); frames, clips,
  stand-ins and picture placement (`drill-frames.test.ts`).
- Looked at in a browser with sample data at 940, 1232 and 1640 px wide, and in the running app:
  Today (match drill, focus bars, coach rows, tiles) and Drills. The hero was watched through a
  reload: one state from the first frame.

## Gaps

- **No weekly benchmark.** The concept has one; the app has no such data, so nothing is shown.
- Flash & Swing and Operator Hold still have frames with no enemy in view.
- Results, Leaderboards and Setup still use the legacy markup inside the v3 frame.
- The classic (non-v3) Practice screen is unchanged.
- A drill's "last played" date is not available to this screen, so tiles show today's state, the
  best and the rank only.
