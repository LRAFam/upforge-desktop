# Random sign-outs: causes, fixes, tests

Source: investigation in `scratchpad/support/signout.md`. Desktop = `upforge-wt/rework` (feat/ui-v3),
API = `upforge-wt/api-fixes` (fix/game-support-bugs). Nothing committed or deployed.

| # | Cause | Fix | Test |
|---|---|---|---|
| 1 | **Slow/offline launch → /login.** At launch there is no user yet, so a failed `/api/user` left `isAuthenticated()` false. | New `electron/main/session-store.ts` saves the last user (non-secret fields only: no email, no PUUIDs) to `auth-user.json`. `fetchUser` falls back to it when the server can't be reached and retries in the background (10 s, 30 s, 2 min, 5 min, 15 min), plus straight away on wake/unlock (`powerMonitor` in `index.ts`). Only a 401/403 ends the session. | `auth-session.test.ts`: offline launch opens signed in with the saved user, token file kept, recovers when the server answers; no saved user keeps the token; mid-session timeout keeps the session. |
| 2 | **Shipped 2.15.4 wipes the session on any `fetchUser` failure.** | Already fixed in rework (`sessionRejected`); now also covers launch (row 1). | Same tests. **Existing users only stop seeing this after the desktop update ships** (version bump + tag). |
| 3 | **Signing in on a second PC signs out the first.** Every desktop used `device_name: 'desktop'` and login deletes tokens with that name. | Desktop sends `desktop-<install id>` (uuid in `userData/install-id`). API `AccessTokenLifetime::deviceName()` gives each its own slot; old builds sending `desktop` keep the shared legacy slot. Desktop tokens are capped at the **newest 5 per user** (older revoked at login). | API `AccessTokenLifetimeTest`: two installs stay valid; re-login on A replaces only A; legacy slot; name normalisation; cap keeps newest 5. Desktop: device name is `desktop-<uuid>` and stable across sign-ins. |
| 4 | **Hard 30-day expiry from login**, however active. | `config/sanctum.php` `expiration => null`; tokens get `expires_at = now + 30 days`; new `ExtendAccessTokenExpiry` middleware (api group, runs after the response) pushes it forward at most once a day. Pre-existing tokens without `expires_at` start sliding on next use; `auth:prune-idle-tokens` deletes ones unused for 30 days. Scheduled daily: `sanctum:prune-expired --hours=24` (03:30) and `auth:prune-idle-tokens` (03:35) in `routes/console.php`. | Active token still works 58 days after login; idle token is 401 after 31 days; expiry extended at most once a day; old tokens start sliding and idle ones are pruned. |
| 5 | **Keychain/safeStorage can't decrypt** (unsigned mac builds after update; Linux plaintext saved before a keyring). | `loadToken()` reads a plain-text token if decryption fails and the data looks like a token; otherwise logs and records `decrypt_failed`. Real fix for mac is signing + notarising (release config, not in this change). | Decrypt refusal with a previous session records `decrypt_failed`; plain-text token still loads. |
| 6 | **Stale 401** from an older token cleared a fresh sign-in. | The 401 interceptor only ends the session if the request carried the current token; `fetchUser` ignores a rejection if the token changed while it ran. | Late 401 for an older token keeps the session. |
| 7 | **Router sent signed-in users to /login when the status IPC failed.** | `src/main.ts` retries `getStatus` once; on failure continues instead of redirecting (a rejected token still signs out via `auth:session-expired`). | Covered by review; no router harness exists. |
| 8 | **Token save failures were silent-ish.** | `saveToken` returns false and logs a plain reason ("disk full", error code). | (log only) |

## Telemetry
- One `endSession(reason)` in `AuthManager` for every sign-out: `http_401`, `user_403`, `user_logout`; plus launch-time
  `no_token_file` / `decrypt_failed` when there was a session before (saved user present).
- Each event: reason, time, endpoint path (no query string), status/code, token age in days (`auth-meta.json`),
  app version, OS. **Never** the token, headers or email. Logged via electron-log and queued in
  `userData/signout-events.json` (newest 20).
- Sent as funnel event `desktop_signed_out` (channel `desktop`) right after the next successful `/api/user`;
  failed sends are re-queued. API: `desktop_signed_out` added to `UserFunnelEvent::EVENTS` (store already accepted it).
- API logs how many tokens a login revoked (`[Auth] login revoked tokens`).

## Files
- Desktop: `electron/main/auth-manager.ts`, `electron/main/session-store.ts` (+test), `electron/main/auth-session.test.ts`,
  `electron/main/index.ts` (wake/unlock re-check), `src/main.ts` (guard).
- API: `app/Support/AccessTokenLifetime.php`, `app/Http/Middleware/ExtendAccessTokenExpiry.php`,
  `app/Console/Commands/PruneIdleAccessTokens.php`, `app/Http/Controllers/API/AuthController.php` (login + the two
  `createToken('web')` calls get an expiry), `config/sanctum.php`, `bootstrap/app.php`, `routes/console.php`,
  `app/Models/UserFunnelEvent.php`, `tests/Feature/AccessTokenLifetimeTest.php`.

## Checks
- Desktop: type-check clean, eslint clean on changed files, `npm test` 1652 passed / 9 skipped.
- API: `php artisan test` 1062 passed, 1 failed (`DeadlockSteamSearchTest` "keeps deadlock api ranked results",
  pre-existing on origin/main). New `AccessTokenLifetimeTest`: 9 passed.

## Deploy order
1. **API first** (no migration): login slots, sliding expiry, schedules. Safe for old desktops (they keep sending `desktop`).
   Make sure the scheduler runs on prod (`schedule:run` cron) for the two prune commands.
2. **Desktop version bump + tag.** Until users update, the shipped `fetchUser` bug (any failure signs out) and the shared
   `desktop` slot still apply to them.

## Known limits
- First launch after updating has no saved user yet; an offline first launch still shows /login (but keeps the token,
  and the next launch works). From then on the saved user covers it.
- If the token recovers in the background while the window already shows /login (no saved user case), the window
  stays on /login until the user signs in or restarts; no renderer event was added (App.vue is outside this change).
- Password reset still doesn't revoke tokens (security gap noted in the investigation, not a sign-out cause).
