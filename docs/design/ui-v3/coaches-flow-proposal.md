# Coaches flow — research + proposal (phase 1, no code changed)

2 Nov 2026. Scope: desktop v3 **Coaches** (`/rosters`) plus every place that sends people there. Squad (`/squad`, paid group plan) is out of scope and stays separate (rulebook "Squad vs Coaches").

Screens checked on the real account (read-only; the only change was the local Coach/Student view toggle, set back to "coach"):
`scratchpad/shots/agents/coaches-flow-a-1.png` (coach view), `coaches-flow-student-1/2.png`, `coaches-flow-find-1.png`, `coaches-flow-book-1.png`.

---

## 1. What each user sees today

The one rule that decides it all (`RostersView.vue` `load()`): `isCoachAccount = GET /api/coach/roster` returns a coach. That endpoint returns a coach for **any user with a `Coach` row**, i.e. anyone approved on `/become-coach` for the 1:1 marketplace, whether they ever set up a roster or not. Coach accounts open in **coach view** by default (and always when they are on no roster).

| User | First screen in Coaches | Notes |
|---|---|---|
| **(a) Player, no coach, not a coach** | H1 "Your coaches", tabs *Your coaches · Find a coach · Bookings*, then "No coach yet · Join a coach community and send them a match", an invite-link field, and two links: "Find a coach" (in-app marketplace) and "Browse coaches on upforge.gg" (web `/coaches`). | Two "find" links go to two different places. The hero is a paste field that only works if you already have a link. "Community" appears once and nowhere else. |
| **(b) Student on 1+ rosters** | Same H1 + tabs, then a 4-number stat row (Coaches · With your coach · Notes ready · Ready to send), coach rows with two limit bars each, "Send a match" (every analysed match, each with "Ask my coach"), "With your coach", "Recent notes", footer link to `upforge.gg/my-coaches`. | Real account: 8 "Ask my coach" buttons, **all disabled** ("You already have a review in progress"). The stat row repeats the lists below it. Nothing says what a coach gives back (notes on the match timeline) until after you send. |
| **(c) Coach who is also a student** (this account: 2 members, on 2 rosters) | Coach view: H1 "Your roster", small *Coach · Student 2* toggle top-right, LIVE status line, Copy invite, "Roster open" switch, stats (Members · In queue · Reviews this month), Needs review, Members, Community settings. | Sidebar badge says **2** while the queue on screen says **0**: the badge adds student-side waiting reviews to coach-side requests. The toggle that explains it is the smallest thing on screen. Same H1 slot flips between "Your roster" and "Your coaches". |
| **(d) Coach with no members yet** | Same coach view: "0 Members", "Queue is clear", "Share your invite link so players can join", settings collapsed with "needs setup" if not live. | A marketplace-only coach (1:1 sessions, never wanted a roster) lands here first and must find the small "Student" toggle to reach their own coaches. Their 1:1 bookings/earnings are not in the app at all (web `/coach-dashboard`). |
| **(e) Wants to become a coach** | Nothing. No desktop entry point. | Web `/become-coach` pitches only 1:1 sessions ("Keep 80% of every session"); it never mentions rosters/communities (0 matches for "roster"/"community"). |

Other entry points:
- **Home**: "Working with a coach? · Join your coach" (only if onboarding tick "I have a coach. Remind me to join their roster." was set) and "Your coach replied" (human notes).
- **Post-game**: "Your coach" label above the **AI** summary, then "Send to {coach} →" (human) under it.
- **Match page**: "Send to coach" sheet (`SendToCoachV3` → `RosterSendSheet`).
- **Deep link** `upforge://coaches/{id}` → `/rosters?join=1&invite={id}`.
- **Web**: `/my-coaches` (manage/leave membership), `/coach-dashboard/roster` (coach), `/coaches/{id}#join-roster` (invite).

## 2. Where the confusion is

1. **"Coach" means three things.** Nav has **Coach** (Home = the AI coach) right above **Coaches** (humans). Post-game "Your coach" = AI; Home "Your coach replied" = human; match rows say "Coach rating 6/10" = AI. A new user can't tell which coach "Ask my coach" goes to.
2. **Two kinds of human coaching share one tab with no explanation.** *Roster/community* (ongoing: join, send matches, get timeline notes, free or $/mo) and *marketplace* (one-off paid 1:1 sessions, Bookings). The same person can be both: astar and Crystalf1sh are this account's roster coaches **and** appear in "Find a coach" with an hourly rate, with nothing linking the two. "Find a coach" sells sessions; it never offers "join their roster".
3. **Jargon assumes you already know the feature.** "Roster", "community", "Roster open", "Community settings", "Join with invite link", "Free member", "Open with coach 1/1", "This month 0/3", "free coach plan cap". None of these is explained in one line where it first appears.
4. **The coach/student split is a tiny toggle.** Being a coach and being coached are different jobs, but they share one H1 slot, one badge and one remembered toggle. Coaches land in coach view even when the thing waiting for them is on the student side.
5. **Dead ends and duplicates.**
   - 8 disabled "Ask my coach" buttons (limit reached) instead of one line saying why and when it frees up.
   - "Find a coach" vs "Find another" vs "Browse coaches on upforge.gg" (3 links, 2 destinations).
   - Stat rows repeat the lists right below (both views).
   - "Full feed →" and "Manage membership" bounce to the web with no hint that they leave the app.
   - Marketplace-only coaches get a roster screen they never asked for; there is no path to *become* a coach.
6. **Badge mixes two jobs** (coach requests + student replies) into one number.

## 3. How others do it (short)

- **Metafy**: a marketplace. Students book a coach's listed sessions (VOD review, live, bundles); a coach must accept within 48 h. Coaches run things from a separate coach dashboard and apply via "become a coach". The student side is "find → book → my sessions"; selling is a separate area. ([booking help](https://help.metafy.gg/en/articles/5215212-how-do-i-book-a-coaching-session), [student session guide](https://help.metafy.gg/en/articles/16750656-sessions-on-platform-student-guide), [session settings](https://help.metafy.gg/en/articles/5247599-sessions-session-settings))
- **ProGuides / GamerSensei**: "matchmaking platforms" that pair learners with pro coaches who are independent contractors; the learner side is the product, coaching others is a separate sign-up. I couldn't find public docs on their dashboards. ([ProGuides overview](https://topai.tools/t/proguides), [CB Insights compare](https://www.cbinsights.com/compare/gamer-sensei-vs-proguides))
- **Leetify**: no public coach-sharing feature found. Treat it as not a reference.
- **Discord coaching** (common pattern, not one product): a coach's server *is* the roster. Students join with an invite link and post VODs in a review channel; the coach replies in the thread. Players already understand "join my coach's server, post your game, get feedback". This is the closest real model for UpForge rosters.
- **Fitness coaching apps** (TrueCoach, Skillest): a separate coach app or coach area. The client never sees coach tools. ([TrueCoach public profile](https://help.truecoach.co/en/articles/10827765-coach-public-profile-feature), [Skillest coach profile](https://skillest.com/features/coach-profile))

Pattern: **getting coached** and **coaching others** are always separate places. The student side names the person and the action ("send your game to X"), not the container.

## 4. Proposal

Plain words (use everywhere):

| Today | Student says | Coach says |
|---|---|---|
| Roster / community | "Join {coach}" · "Your coaches" | "Your students" |
| Roster membership (free/paid) | "Free plan" / "$9.99 a month plan" with {coach} | "Student plan: free / $X a month" |
| Ask my coach / Send to coach | "Send to {name}" (name, never "coach") | — |
| With your coach | "Waiting for {name}" | "Needs your notes" |
| Roster open | — | "Taking new students" |
| Community settings | — | "Plan and price" |
| Open with coach 1/1 · This month 0/3 | One line: "1 match with {name} now · 3 left this month" | — |
| Find a coach (marketplace) | "Find a coach" — each coach shows *Join* (ongoing notes) and/or *Book a session* (live 1:1) | — |

One-line explanation, shown once on the student page: **"Join a coach, send them your matches, and they write notes on your match timeline."**

AI vs human: human coaches are always shown by **name**. The word "coach" alone stays for the AI (nav "Coach", post-game "Your coach"). This needs no rename of the AI side.

### Option A — split by job (recommended)

- Nav **Coaches** (everyone): the student side only. Sections: your coaches + what's waiting, then Find a coach. Bookings becomes a "Sessions" list inside Your coaches, shown only when there are any.
- Nav **Students** (only accounts with a coach profile): coach tools. No toggle anywhere. Each nav item has its own badge (Coaches = notes ready for you; Students = matches waiting for your notes).
- Coach profile without a live roster: Students shows a one-screen setup ("Coach players between sessions").
- Not a coach: one quiet line at the bottom of Find a coach: "Coach players yourself? Apply on upforge.gg →" (`/become-coach`).

### Option B — one tab, two sections

- Keep one **Coaches** nav item. Remove the toggle. The page shows **what's waiting first**: if students sent you matches, "Needs your notes" sits on top; your own coaches come below. Coach tools (members, plan and price, invite) fold into one "Your students" section at the bottom, shown only to coaches.
- One combined badge, as today (but labelled per section on the page).
- Cheaper to build; the page gets long for people who are both, and student-only users still never see coach jargon.

**Recommendation: A.** It matches every reference product, kills the toggle and the mixed badge, and keeps the student page short for the 99% who will never coach. Coach tools are a different job with a different daily loop (queue → notes), so they earn their own nav item. B is the fallback if the nav must stay at 6 items.

### First screens (Option A)

**(a) Player, no coach**
```
COACHES
Get notes from a real coach                                (H1)
Join a coach, send them your matches, and they write notes
on your match timeline.

[ Paste your coach's invite link ............ ] [Join]

FIND A COACH                                    Top rated ▾
 A  astar      Radiant · Duelist     Join · free   Book $25/h
 C  Crystalf1sh Asc 2 · Controller   Join · $9.99  Book $15/h
 ...
Coach players yourself? Apply on upforge.gg →
```
Hero = the one-line promise. The invite field is one row, not the hero. One "find" list (in-app); the web link goes away.

**(b) Student with coaches**
```
COACHES
2 matches waiting for notes                                 (H1 = real state)
astar has your Summit match · Crystalf1sh is reviewing Lotus

YOUR COACHES
 A  astar        $9.99 plan · 1 with astar now · 2 left this month
 C  Crystalf1sh  Free plan  · 1 with Crystalf1sh now · 3 left
                                         Join another coach · Find a coach
NOTES READY            (only when there are any)
 [map] Lotus 8–13   Crystalf1sh · 4 notes          Open notes →
SEND A MATCH
 You can send again when astar finishes Summit.     (one line, no dead buttons)
 — or, when allowed —
 [map] Summit 13–10   [Send to astar]
SESSIONS               (only when booked 1:1 sessions exist)
 Tue 17 Feb · 60 min · astar · Done
Leave or change a plan on upforge.gg →
```
H1 is the one thing that matters now (notes ready > waiting > "Send your last match to astar"). No stat row. Send list shows the last 5 analysed matches, not every one.

**(c) Coach (also a student)** — opens on whichever nav item has a badge; no toggle.
```
STUDENTS
Queue is clear                                              (H1, or "2 matches need your notes")
2 students · free plan · 0 of 8 reviews used this month

NEEDS YOUR NOTES
 (empty) Students send matches from the app after a game.
YOUR STUDENTS
 I  Iwaru   Iwaru#EUNE · 15 analysed · active 9 Aug
 A  Alfie   战场之鬼#0001 · 20 analysed · active 24 Oct
[Copy invite link]   Taking new students (switch)   Plan and price ▸
```
Their own coaches stay under **Coaches** (screen b).

**(d) Coach profile, no students / roster not live**
```
STUDENTS
Coach players between sessions                              (H1)
Players join you, send their matches, and you write notes on
their timeline. Free or paid plan, your price.

1  Pick a plan:   ( ) Free   (•) $9.99 a month  · 3 reviews each
2  Turn on        Taking new students (switch)
3  Share          [Copy invite link]
Paid plans need payouts set up on upforge.gg →
```

**(e) Wants to coach** — no new screen. One line at the bottom of Find a coach (screen a) → web `/become-coach`. After approval, the **Students** nav item appears and shows screen (d).

### Entry points (both options)

- **Post-game**: keep "Send to {name} →" under the AI summary (already names the person). If 2+ coaches: "Send to a coach →". Hide when blocked.
- **Match page**: button "Send to {name}" (one coach) / "Send to a coach" (2+). The blocked text stays a single line.
- **Home**: "Your coach replied" → "{name} left notes on Lotus". "Working with a coach?" prompt unchanged except link text "Join your coach" → "Paste invite link".
- **Deep link**: unchanged (`/rosters?join=1&invite=` opens the invite row prefilled).
- **Sidebar**: Option A: two badges, each counting its own job. Option B: one badge.

### What stays on / moves to the web

Stays web (payment, legal, rare): paid plan checkout and leave/change plan (`/my-coaches`), 1:1 booking + payment, payouts/Stripe Connect, Coach Pro, become-a-coach application, availability and earnings. Every link that leaves the app ends in "on upforge.gg →".
Moves out of the app: nothing new. "Full feed →" can go once desktop notes cover the queue (they already do for roster reviews).
Web copy gap (spec only): `/become-coach` should add one line about student plans ("Or run a student plan: players join you and send matches for notes").

### API needs (listed separately; none required for the first pass)

1. **Optional:** marketplace list/detail does not say whether a coach has a live roster plan. First pass can call the existing `GET /api/coaches/{id}/hub` when a coach is opened (JoinCoachV3 already does). Showing "Join · $9.99" on every list row would need `roster_is_live` + price on `/api/coaches` list items.
2. **Already noted elsewhere:** roster member rank / agent / card in `CoachRosterController::buildStudentAggregate`.
3. Separate badges need no API change: student counts come from `/api/coach/student-hub`, coach counts from `/api/coach/roster`.
4. "Coach profile but roster never set up" is detectable from existing `/api/coach/roster/settings` (`roster_enabled`, draft reason).

### Code touch list (phase 2, for planning)

`src/views/RostersView.vue` (mode logic → route split), `src/views/v3/RostersV3.vue` (student page), new `StudentsV3` view hosting `CoachRosterV3`, `SidebarV3.vue` (nav item + badges, Option A), `game-modules.ts` nav lists, `useCoachReplyWatch.ts` (badge split), `FindCoachV3.vue` (Join vs Book on detail + become-a-coach line), `MyBookingsV3.vue` (folded into Your coaches), `SendToCoachV3.vue` / `PostGameV3.vue` / `CoachRepliesV3.vue` (names instead of "coach"), `coach-format.ts` (+tests) for the new wording. Old (non-v3) UI untouched.
