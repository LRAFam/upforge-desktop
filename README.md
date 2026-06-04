# UpForge Desktop

Lightweight Windows system-tray app for automatic Valorant gameplay recording and AI coaching analysis.

## How It Works

1. Launches silently to system tray on startup
2. Detects when Valorant launches — starts hardware-encoded recording (NVENC/VCE/QuickSync, ~0% game impact)
3. Reads live match data from Riot's Local Game Client API (`localhost:2999`)
4. When game ends — stops recording, uploads to UpForge API, shows post-game window with progress
5. AI analysis completes — desktop notification + post-game window shows results preview
6. Click "View Full Analysis" to open full results on upforge.gg

## Stack

- **Electron** + **Vue 3** + **Tailwind CSS**
- **electron-vite** for fast dev builds
- **electron-builder** for Windows installer distribution
- Same auth as upforge.gg — one account, both clients

## Development

```bash
npm install
npm run dev
```

> Requires ffmpeg in PATH for dev. For recording to work, run on Windows with Valorant installed.

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
