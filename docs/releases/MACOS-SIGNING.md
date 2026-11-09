# macOS code signing + notarisation

Without this, the Mac app ships **unsigned**: Gatekeeper blocks the first launch ("cannot be opened") and Macs **cannot auto-update** (Squirrel.Mac only installs signed updates).

## The rule

- Tagged releases (`vX.Y.Z`) sign and notarise the Mac app when **all five** secrets below are set. **Verify macOS signature** then checks `codesign`, Gatekeeper (`spctl`) and the notarisation ticket (`stapler`); any failure blocks the release.
- **None** set → unsigned build, warning on the run.
- **Some** set → the release fails (signing half set up).
- Branch builds (pushes to `main`) are never signed.
- `build/macos-release.test.ts` fails CI if this is removed or weakened.

## What you need

1. **Apple Developer Program** membership (USD 99/year), individual or organisation.
2. A **Developer ID Application** certificate (Xcode → Settings → Accounts → Manage Certificates, or developer.apple.com → Certificates). Export it with its private key from Keychain Access as a `.p12` with a password.
3. An **app-specific password** for your Apple ID (appleid.apple.com → Sign-In and Security).
4. Your **Team ID** (developer.apple.com → Membership).

## GitHub secrets (`upforge-desktop` → Settings → Secrets and variables → Actions)

| Secret | Value |
|---|---|
| `MAC_CSC_LINK` | The `.p12` as base64: `base64 -i cert.p12 \| pbcopy` |
| `MAC_CSC_KEY_PASSWORD` | The `.p12` export password |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | 10-character Team ID |

## ffmpeg

The Mac app bundles a static arm64 ffmpeg 7.1.1 (GPL build from ffmpeg.martin-riedl.de, pinned by SHA-256 in `release.yml`). The build fails if it links anything outside macOS itself or lacks `h264_videotoolbox` / `avfoundation`. Mac builds are Apple Silicon only.
