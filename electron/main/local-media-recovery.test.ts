import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const runtime = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => runtime.root } }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('./app-notifications', () => ({ showAppNotification: vi.fn() }))
vi.mock('./error-reporter', () => ({ reportError: vi.fn() }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn() } }))
vi.mock('./vod-compressor', () => ({
  recordingPathVariants: (value: string) => [value],
  sourcePathForCompressed: () => null,
  deleteLocalRecordingFiles: vi.fn(),
}))

import { ClipPipeline } from './clip-pipeline'
import type { ClipExtractor } from './clip-extractor'
import { prunePendingRecordingsByAge, purgeUntrackedRecordingFiles } from './storage-cleanup'
import { ClipStore, type NewClip } from './clip-store'
import { RecordingsStore, type NewRecording } from './recordings-store'
import { registeredLocalRecordingPaths } from './local-media-paths'
import { CaptureOwnership } from './capture-ownership'
import { localMediaRoot, resolveRecordingSavePath, userRecordingsDir } from './user-data-paths'

beforeEach(() => { runtime.root = fs.mkdtempSync(path.join(os.tmpdir(), 'upforge-local-media-')) })
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(runtime.root, { recursive: true, force: true }) })

function mediaFile(name: string): string {
  const output = path.join(runtime.root, name)
  fs.writeFileSync(output, 'video')
  return output
}
function recording(): NewRecording {
  return {
    path: mediaFile('match.mp4'), riotName: 'Player', riotTag: 'EU', game: 'valorant',
    map: 'Ascent', agent: 'Sage', gameMode: 'competitive', savedOffline: true,
    timeline: { matchId: 'match-123', playerKills: [{ videoOffsetMs: 12000, round: 2 }] } as NewRecording['timeline'],
  }
}
function clip(): NewClip {
  return {
    path: mediaFile('clip.mp4'), thumbPath: mediaFile('thumb.jpg'), trigger: 'hotkey',
    map: 'Ascent', agent: 'Sage', durationSeconds: 30, round: 2, analysisJobId: null,
    killCount: 1, matchId: 'match-123', gameMode: 'competitive', game: 'valorant',
    weapon: 'Vandal', abilitySlot: null, momentOffsetMs: 12000, clipStartMs: 4000,
    clipEvents: [{ event_type: 'kill', clip_offset_ms: 8000, vod_offset_ms: 12000 }],
  }
}

describe('durable logged-out media', () => {
  it('keeps a guest VOD, match timeline, clip, thumbnail and event offsets across restart', () => {
    const match = new RecordingsStore().add({ ...recording(), pendingClipBookmarks: [42000], captureRecordingStartTime: 10000 })
    const highlight = new ClipStore().add(clip())
    expect(new RecordingsStore().getAll()).toEqual([match])
    expect(new ClipStore().getAll()).toEqual([highlight])
    expect(fs.existsSync(path.join(localMediaRoot(null), 'recordings.json'))).toBe(true)
    expect(fs.existsSync(path.join(localMediaRoot(null), 'clips.json'))).toBe(true)
  })

  it('keeps guest media isolated until explicitly claimed, without changing IDs or links', () => {
    const matches = new RecordingsStore()
    const clips = new ClipStore()
    const match = matches.add(recording())
    const highlight = clips.add(clip())
    matches.setUserScope(11); clips.setUserScope(11)
    expect(matches.getAll()).toEqual([])
    expect(clips.getAll()).toEqual([])
    expect(matches.claimGuest(11)).toBe(1)
    expect(clips.claimGuest(11)).toBe(1)
    expect(matches.getAll()).toEqual([match])
    expect(clips.getAll()).toEqual([highlight])
    expect(matches.claimGuest(11)).toBe(0)
    expect(clips.claimGuest(11)).toBe(0)
    expect(new RecordingsStore().getAll()).toEqual([])
    expect(new ClipStore().getAll()).toEqual([])
    expect(new RecordingsStore().forUser(11).getAll()).toEqual([match])
    matches.setUserScope(22); clips.setUserScope(22)
    expect(matches.getAll()).toEqual([])
    expect(clips.getAll()).toEqual([])
  })

  it('pins writes and later clip updates to the capture account through logout and another login', () => {
    const matches = new RecordingsStore()
    const clips = new ClipStore()
    matches.setUserScope(11); clips.setUserScope(11)
    const captureMatches = matches.forUser(11)
    const captureClips = clips.forUser(11)
    const pendingClip = captureClips.add({ ...clip(), path: '' })
    matches.setUserScope(null); clips.setUserScope(null)
    matches.setUserScope(22); clips.setUserScope(22)
    const match = captureMatches.add(recording())
    captureClips.update(pendingClip.id, { path: mediaFile('completed.mp4') })
    expect(matches.getAll()).toEqual([])
    expect(clips.getAll()).toEqual([])
    expect(matches.forUser(null).getAll()).toEqual([])
    expect(clips.forUser(null).getAll()).toEqual([])
    expect(new RecordingsStore().forUser(11).getAll()).toEqual([match])
    expect(new ClipStore().forUser(11).getById(pendingClip.id)?.path).toContain('completed.mp4')
    matches.setUserScope(11); clips.setUserScope(11)
    expect(matches.getAll()).toEqual([match])
    expect(clips.getAll()).toHaveLength(1)
  })

  it('preserves unclaimed captures when claiming cannot write to disk', () => {
    const matches = new RecordingsStore()
    const match = matches.add(recording())
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const rename = fs.renameSync
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(to).includes(`${path.sep}users${path.sep}`)) throw new Error('disk full')
      return rename(from, to)
    })
    expect(() => matches.claimGuest(11)).toThrow('disk full')
    expect(new RecordingsStore().getAll()).toEqual([match])
  })

  it('does not delete guest clips through account retention rules', () => {
    const clips = new ClipStore()
    const highlight = clips.add(clip())
    clips.update(highlight.id, { savedAt: 0, trigger: 'kill' })
    expect(clips.pruneByAge(1)).toBe(0)
    expect(clips.pruneKillClipsByAge(1)).toBe(0)
    expect(fs.existsSync(highlight.path)).toBe(true)
  })

  it('keeps clips-only match data across restart', () => {
    const matches = new RecordingsStore()
    const match = matches.add({ ...recording(), path: '', clipsOnly: true, clipCount: 3 })
    expect(new RecordingsStore().getPending()).toEqual([match])
  })

  it('does not reimport another account or claimed guest media from a shared OBS folder', () => {
    const matches = new RecordingsStore()
    const guest = matches.add(recording())
    const other = matches.forUser(22).add({ ...recording(), path: mediaFile('other.mp4') })
    matches.claimGuest(11)
    expect(registeredLocalRecordingPaths()).toEqual(new Set([guest.path, other.path]))
  })

  it('keeps offline VODs through retention and protects claimed media from guest cleanup', () => {
    const matches = new RecordingsStore()
    const match = matches.forUser(11).add(recording(), 0)
    expect(prunePendingRecordingsByAge(matches.forUser(11), 1, null).removed).toBe(0)
    expect(purgeUntrackedRecordingFiles(matches, runtime.root).removed).toBe(0)
    expect(fs.existsSync(match.path)).toBe(true)
  })

  it('finishes a guest F9 clip in the guest library after login during extraction', async () => {
    const clips = new ClipStore()
    let release!: () => void
    let began!: () => void
    const started = new Promise<void>(resolve => { began = resolve })
    const proceed = new Promise<void>(resolve => { release = resolve })
    const extractor = {
      probeWithRetry: async () => ({ ok: true }),
      probeDurationMs: async () => 120000,
      extract: async ({ outputPath }: { outputPath: string }) => {
        began(); await proceed
        fs.mkdirSync(path.dirname(outputPath), { recursive: true })
        fs.writeFileSync(outputPath, 'clip video')
      },
      thumbnail: async ({ outputPath }: { outputPath: string }) => { fs.writeFileSync(outputPath, 'thumbnail') },
    } as unknown as ClipExtractor
    const pipeline = new ClipPipeline({
      clipStore: clips.forUser(null), clipExtractor: extractor,
      hotkeyBookmarks: [42000], getRecordingStartTime: () => 10000,
      getClipCapture: () => ({ singleKills: true, multiKills: true, aces: true, clutches: true }),
      logActivity: vi.fn(), notifySilent: () => true, notifyMainWindow: vi.fn(),
    })
    const extracting = pipeline.extractMatchClips(mediaFile('source.mp4'), null, null)
    await started
    clips.setUserScope(11)
    release()
    await extracting
    expect(clips.getAll()).toEqual([])
    const guestClips = new ClipStore().getAll()
    expect(guestClips).toHaveLength(1)
    expect(guestClips[0]).toMatchObject({ trigger: 'hotkey', momentOffsetMs: 32000, clipStartMs: 7000 })
    expect(guestClips[0].path).toContain(localMediaRoot(null))
    expect(fs.existsSync(guestClips[0].thumbPath!)).toBe(true)
    clips.claimGuest(11)
    expect(clips.getAll()).toEqual(guestClips)
  })

  it('reports unfinished clip work when the source is temporarily unreadable', async () => {
    const pipeline = new ClipPipeline({
      clipStore: new ClipStore(),
      clipExtractor: { probeWithRetry: async () => ({ ok: false, reason: 'timeout' }) } as unknown as ClipExtractor,
      hotkeyBookmarks: [42000], getRecordingStartTime: () => 10000,
      getClipCapture: () => ({ singleKills: true, multiKills: true, aces: true, clutches: true }),
      logActivity: vi.fn(), notifySilent: () => true, notifyMainWindow: vi.fn(),
    })
    expect(await pipeline.extractMatchClips(mediaFile('unfinished.mp4'), null, null)).toBe(false)
  })

  it('retains the last account through credential expiry/restart, but clears it on explicit logout', () => {
    const ownership = new CaptureOwnership()
    expect(ownership.get()).toBeNull()
    ownership.set(11)
    expect(new CaptureOwnership().get()).toBe(11)
    ownership.set(null)
    expect(new CaptureOwnership().get()).toBeNull()
  })

  it('uses the capture owner directory instead of a previous account default', () => {
    const oldDefault = userRecordingsDir(11)
    expect(resolveRecordingSavePath(oldDefault, null)).toBe(path.join(localMediaRoot(null), 'recordings'))
    expect(resolveRecordingSavePath(oldDefault, 22)).toBe(userRecordingsDir(22))
    const custom = path.join(runtime.root, 'custom-videos')
    expect(resolveRecordingSavePath(custom, null)).toBe(custom)
  })
})
