import type { PendingRecording } from '../env.d.ts'

const now = Date.now()

/** Mock pending recordings for `/dashboard-needs-you-preview` (offline UI review). */
export const MOCK_NEEDS_YOU_RECORDINGS: PendingRecording[] = [
  {
    id: 'preview-ready',
    path: '/mock/bind-jett.mkv',
    game: 'valorant',
    map: 'Bind',
    agent: 'Jett',
    gameMode: 'competitive',
    recordedAt: now - 12 * 60_000,
    analysed: false,
    fileSizeBytes: 1_450_000_000,
    hasLocalFile: true,
    cloudUploaded: false,
    analysisReadiness: {
      ready: true,
      state: 'ready',
      message: 'Ready for AI coaching',
      duelMomentCount: 14,
    },
    timeline: {
      finalStats: { kills: 18, deaths: 14, assists: 6, score: 312, headshotPct: 28, won: true },
      finalScore: { allyScore: 13, enemyScore: 11 },
      playerKills: [{ killerName: 'You', victimName: 'Enemy', round: 1, videoOffsetMs: 45_000 }],
      playerDeaths: [{ killerName: 'Enemy', victimName: 'You', round: 2, videoOffsetMs: 90_000 }],
    },
  },
  {
    id: 'preview-syncing',
    path: '/mock/ascent-reyna.mkv',
    game: 'valorant',
    map: 'Ascent',
    agent: 'Reyna',
    gameMode: 'competitive',
    recordedAt: now - 28 * 60_000,
    analysed: false,
    fileSizeBytes: 1_820_000_000,
    hasLocalFile: true,
    cloudUploaded: false,
    analysisReadiness: {
      ready: false,
      state: 'syncing',
      message: 'Syncing match stats from Riot…',
      duelMomentCount: 0,
    },
    timeline: {
      finalStats: { kills: 22, deaths: 19, assists: 3, score: 298, headshotPct: 31, won: false },
      finalScore: { allyScore: 10, enemyScore: 13 },
      playerKills: [],
      playerDeaths: [],
    },
  },
  {
    id: 'preview-cloud-save',
    path: '/mock/haven-sova.mkv',
    game: 'valorant',
    map: 'Haven',
    agent: 'Sova',
    gameMode: 'unrated',
    recordedAt: now - 2 * 3_600_000,
    analysed: false,
    fileSizeBytes: 980_000_000,
    hasLocalFile: true,
    cloudUploaded: false,
    analysisReadiness: {
      ready: false,
      state: 'finalizing',
      message: 'Finalizing recording…',
      duelMomentCount: 0,
    },
    timeline: {
      finalStats: { kills: 12, deaths: 15, assists: 9, score: 201, headshotPct: 19, won: true },
      finalScore: { allyScore: 13, enemyScore: 12 },
      playerKills: [{ killerName: 'You', victimName: 'Enemy', round: 3 }],
    },
  },
]
