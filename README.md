# UpForge Desktop

Lightweight system-tray app for automatic gameplay recording and AI coaching analysis.

## How It Works

1. Launches to system tray
2. Detects supported games (Valorant, CS2, Deadlock, LoL)
3. Records via **OBS Studio** (WebSocket) with crash-safe settings UpForge applies
4. After the match: FFmpeg remux/compress/clip extract, then upload to the UpForge API
5. AI analysis completes — notification + post-game preview
6. Open full results on upforge.gg

Ops telemetry (sector times, hardware bucket, DNFs) is described in  
`docs/superpowers/specs/2026-07-26-desktop-recording-reliability-telemetry-design.md`.

## Stack

- **Electron** + **Vue 3** + **Tailwind CSS**
- **OBS Studio** + `obs-websocket-js` for live capture
- Bundled **FFmpeg** for post-match probe / remux / clips (not live capture)
- **electron-vite** for fast dev builds
- **electron-builder** for installers
- Same auth as upforge.gg — one account, both clients

## Development

```bash
npm install
npm run dev
```

> OBS Studio must be installed and connectable (Settings → Recording). Windows is the primary recording platform.

## Building for Windows

```bash
# Place ffmpeg.exe in resources/ffmpeg/ffmpeg.exe first
npm run dist:win
```

Output: `dist/UpForge Setup x.x.x.exe`

## Auto-Updates

Uses `electron-updater` via GitHub Releases.

**Release flow:** bump version → push `main` → CI auto-tags and builds.

```bash
npm run patch          # 2.3.42 → 2.3.43 (no local git tag)
git add package.json package-lock.json
git commit -m "chore: release v2.3.43"
git push origin main   # auto-tag.yml creates v* tag and runs release.yml
```

Do not create tags locally or run `electron-builder --publish` by hand unless debugging.

## Project Structure

```
electron/
  main/
    index.ts           # App entry, window management, tray
    game-detector.ts   # Process watcher (VALORANT-Win64-Shipping.exe)
    recorder.ts        # ffmpeg hardware recording
    riot-local-api.ts  # localhost:2999 polling
    auth-manager.ts    # Laravel API auth (token stored in keytar)
    upload-manager.ts  # Multipart upload + job polling
    ipc-handlers.ts    # IPC bridge setup
  preload/
    index.ts           # Secure context bridge
src/
  views/
    LoginView.vue      # Auth screen
    DashboardView.vue  # Recent analyses, recording status
    PostGameView.vue   # Auto-popup after game ends
    SettingsView.vue   # Quality, behaviour, account
  App.vue              # Root — title bar, nav, router-view
  main.ts              # Vue app + router + pinia bootstrap
```
