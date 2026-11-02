# Notes: Discord link, "More on upforge.gg", notifications bell (2026-11-02)

Coverage gaps #5 (P1), #2 (P2) and #8 (P3) from `coverage-2026-11-02.md`.

## 1. Discord link (Settings › Account › Discord)
- New row `src/components/settings/SettingsDiscordLink.vue`, mounted under Game accounts in `SettingsAccountPane.vue` (v3 only). Section id `discord-link` (added to `src/lib/settings-nav.ts`).
- Linked: "Linked as <name>" + "Change on upforge.gg →" (unlink stays on the web `/profile`).
- Not linked: "Link Discord" → new IPC `profile:link-discord` (`electron/main/discord-link.ts`): GET `/api/auth/discord/redirect` with the desktop token, accept only `https://discord.com/oauth2/authorize…`, open it in the system browser. The state token carries the identity, so the web callback (`/auth/discord/callback`) links it without a web login.
- On return: re-reads `/api/profile` on window focus and every 10 s for up to 3 min (`/api/user` has no `discord_username`).
- `useSettings` user now keeps `discord_username` from `/api/profile` (2 lines).
- Skip message: `discord_not_linked` now says "Link Discord in Settings › Account…" and the briefs panel shows a "Link Discord →" button to `/settings?tab=account&section=discord-link`.
- Not clicked in the live app. Verified by unit tests (`discord-link.test.ts` ×2, `coaching-preferences.test.ts`, `settings-nav.test.ts`) and a screenshot showing "Linked as …".

## 2. More on upforge.gg
- `src/components/v3/shell/WebLinksMenuV3.vue`: one quiet item above Settings in `SidebarV3` that opens a small menu; each item uses `openWebFeature`.
- `webMoreLinks(game)` in `src/lib/web-explore-links.ts`:
  - Valorant: Roadmap, Weekly goals, Skill profile, Rank challenge, Trends, Playstyle, Mental, Lineups, Playbooks, Guides.
  - CS2/Deadlock: Guides only (the other pages read Valorant analyses; `/brain` only says "ships later" for CS2/Deadlock).
  - League: none, so the menu is hidden.
- Dropped: Progress (the app has its own), Map insights / My guides / Leaderboard / Highlights (not core).
- Fixed: the Playstyle link was `/valorant/playstyle`, which 301s to `/brain`. It now points straight at `/brain`.
- A test checks every link exists in `upforge-frontend/app/pages` when the web repo is next to the desktop.

## 3. Notifications bell
- The API exists (`/api/notifications`, 60/hour list limit). The coach poller already fetches the list every minute. It now caches that answer (`getLatestNotifications`), and the bell reads it over IPC `notifications:inbox`, so the bell adds no API list calls.
- `NotificationBellV3.vue` in the title bar shows an unread count and the 20 newest items. Clicking an item marks it read (`notifications:mark-read`) and opens it via `inboxTarget()`. Coach reviews and roster replies open in the app; results, bookings and guides open on upforge.gg. The routing mirrors the web `NotificationDropdown`.
- No "mark all read" and no delete (kept small).

## Needs follow-up
- **The app must restart** to load the new main/preload IPC (`profile:link-discord`, `notifications:*`). Until then the bell shows "Checking…" and Link Discord shows an error.
- **Existing issue (not mine):** the coach poller calls `GET /api/notifications` every 60 s, which is exactly the API's 60/hour throttle. Suggest polling `/notifications/unread-count` (180/hour) and fetching the list only when the count changes.
- **Cache after sign-out:** the cache is hidden after sign-out (auth check), but after an account switch it can show the previous user's list until the first poll, which runs immediately on login. A user-id key would close that gap.
- The bell was not clicked through to an item in the live app (clicking marks read, which is a production write).
