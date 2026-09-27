# Marketing restart: release checklist

## Deployed and verified

- New Stripe prices: Plus USD 9.99/month (`price_1UKPUjLZjVq5K3ajmIQU9xry`) and Pro USD 19.99/month (`price_1UKPWDLZjVq5K3ajpC75F72n`). Separate products preserve legacy subscribers' terms. Production catalogue reports both available.
- API `1109153`, followed by schema correction `a48cce5`, deployed through Forge. New billing, quota reservations and workspace coaching migrations completed. Queue retry_after 90s exceeds coaching job timeout 80s and provider timeout 65s.
- AI endpoint deployed through Railway. Real desktop question reached the queue, saved a reply and retained history. A failed request returned its allowance. Live testing caught reactive IPC serialization and a nonexistent rank-column query; both corrected.
- Live coaching exposed round-number, event-order and economy overclaims. Added golden fixture and explicit source boundaries, then verified correct R1/R12 labels and unknown event chronology in a live answer. Final economy wording correction is `55c5a84`; prompt tests do not guarantee every generated answer.
- Website `d4e10e4` deployed successfully through GitHub Actions. Includes new prices, real desktop imagery, footage-aligned demo, match rank and checkout-return analytics correction. Website CI passed.
- Production funnel contains first-recording, report-opened, checkout-created and server-confirmed subscription events. Returning from checkout is no longer counted as a purchase.

## Verification

- API full suite: 726 tests, 2,643 assertions, zero failures/errors, three credential-dependent Stripe skips and one deprecation. Follow-up schema regression: 5 tests / 37 assertions passed.
- Desktop: type check and build pass. Full suite: 946 passed, two environment-gated HTTP tests skipped. Those HTTP tests previously passed against an isolated local Laravel database. Restricted sandbox cannot bind their local sockets; unrestricted full suite passed.
- AI: 202 claim-contract tests passed (excluding a pre-existing standalone dry-run script requiring credentials during collection). Four focused workspace tests pass after final economy wording correction.
- Website build and focused seven tests pass. Changed-file lint: zero errors, existing warnings. Type check exits successfully but reports an existing Volar plugin warning; this is not a clean plugin initialization.

## Remaining release checks

- v2.13.0 Windows and macOS installers published and CI passed. Follow-up v2.13.1 corrects same-agent opponent labels; 16 comparison tests, type check and build pass. Confirm its installer publication.
- Run a real Windows install, game detection, OBS recording, upload and review smoke check. User is unavailable to do this now. macOS preview cannot prove this.
- Complete a real checkout/payment-to-entitlement check with user-controlled payment. Live Stripe prices are verified; existing admin account has an active subscription, and no duplicate subscription or real charge was created.
- Enable the fixed comparison launch cutoff only after the new desktop/free notes flow is released and verified. Preview access remains enabled; existing accounts must remain grandfathered.
- Refreshed comparison and coaching screenshots are saved as 06/07 with v2.13.0 and dev controls hidden. Existing website compositions preserve the real footage/tool pixels; old 01–05 files remain historical sources.

## Logs

- `/tmp/upforge-launch-api-full-final.log`
- `/tmp/upforge-launch-desktop-final-unrestricted.log`
- `/tmp/upforge-launch-desktop-final-type.log`
- `/tmp/upforge-desktop-2.13.0-build.log`
- `/tmp/upforge-launch-coach-claims.log`
- `/tmp/upforge-launch-web-final-build.log`

Disposable HTTP test API on 127.0.0.1:18089 uses a temporary SQLite database, not production data.
