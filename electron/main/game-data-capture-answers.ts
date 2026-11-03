/**
 * Turn one captured match into answers for the open questions in
 * docs/research/cs2-deadlock-data-sources-2026-11-03.md §5 (keyed by question number).
 * Pure functions: no fs, no network. Used by game-data-capture.ts.
 */

export interface AfterMatchEvent {
  at: number
  kind: string
  data: unknown
}

export type Answers = Record<string, Record<string, unknown>>

type Body = Record<string, unknown>
type PlayerBlock = {
  steamid?: string
  team?: string
  state?: { health?: number; round_kills?: number; round_killhs?: number }
  match_stats?: { kills?: number; deaths?: number }
  weapons?: Record<string, { name?: string; state?: string }>
  position?: string
}

const MAX_KILL_EVENTS = 200
const MAX_SAMPLES = 50

function nonEmptyObj(v: unknown): boolean {
  return v != null && typeof v === 'object' && Object.keys(v as object).length > 0
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

function activeWeapon(p: PlayerBlock): string | null {
  for (const w of Object.values(p.weapons ?? {})) if (w?.state === 'active') return w.name ?? null
  return null
}

/** Streams GSI bodies; `answers()` summarises CS2 questions 1–9. */
export class Cs2AnswerAnalyzer {
  private providerIds = new Set<string>()
  private times: number[] = []
  private liveRoundTimes: number[] = []
  private postsPerRound: Record<string, number> = {}
  // Q1
  private selfAlive = 0
  private selfAliveWithPos = 0
  private selfPositions = new Set<string>()
  private lastSelfPos: string | null = null
  private selfPosChanges = 0
  // Q2
  private bomb: Record<string, { bodies: number; withBomb: number; withBombPosition: number; states: Set<string> }> = {}
  // Q3 / Q4
  private roundWinsBodies = 0
  private roundWinReasons = new Set<string>()
  private countdownBodies = 0
  private countdownPhases = new Set<string>()
  // Q5
  private alive = { bodies: 0, allplayers: 0, grenades: 0 }
  private deadOrSpectating = { bodies: 0, allplayers: 0, grenades: 0 }
  // Q6
  private spectatingBodies = 0
  private deathsSeen: Array<{ at: number; switchedAfterMs: number | null }> = []
  private pendingDeathAt: number | null = null
  // Q8 / Q9
  private prevSelf: PlayerBlock | null = null
  private kills: Array<Record<string, unknown>> = []

  ingest(body: unknown, at: number): void {
    if (!body || typeof body !== 'object') return
    const b = body as Body
    const provider = (b.provider ?? {}) as { steamid?: string; timestamp?: number }
    const map = (b.map ?? {}) as { round?: number; round_wins?: Record<string, string> }
    const round = (b.round ?? {}) as { phase?: string }
    const player = (b.player ?? null) as PlayerBlock | null
    if (provider.steamid) this.providerIds.add(provider.steamid)

    this.times.push(at)
    if (round.phase === 'live') this.liveRoundTimes.push(at)
    if (typeof map.round === 'number') this.postsPerRound[String(map.round)] = (this.postsPerRound[String(map.round)] ?? 0) + 1

    const isSelf = !!player && !!provider.steamid && player.steamid === provider.steamid
    const health = player?.state?.health
    const selfAlive = isSelf && typeof health === 'number' && health > 0

    // Q1 — own position while alive.
    if (selfAlive) {
      this.selfAlive++
      if (player?.position) {
        this.selfAliveWithPos++
        if (this.selfPositions.size < 5000) this.selfPositions.add(player.position)
        if (this.lastSelfPos != null && this.lastSelfPos !== player.position) this.selfPosChanges++
        this.lastSelfPos = player.position
      }
    }

    // Q2 — bomb block by own team.
    if (isSelf && player?.team) {
      const t = this.bomb[player.team] ??= { bodies: 0, withBomb: 0, withBombPosition: 0, states: new Set() }
      t.bodies++
      const bomb = b.bomb as { state?: string; position?: string } | undefined
      if (nonEmptyObj(bomb)) {
        t.withBomb++
        if (bomb?.position) t.withBombPosition++
        if (bomb?.state) t.states.add(bomb.state)
      }
    }

    // Q3 / Q4
    if (nonEmptyObj(map.round_wins)) {
      this.roundWinsBodies++
      for (const r of Object.values(map.round_wins ?? {})) this.roundWinReasons.add(String(r))
    }
    const pc = b.phase_countdowns as { phase?: string } | undefined
    if (nonEmptyObj(pc)) {
      this.countdownBodies++
      if (pc?.phase) this.countdownPhases.add(pc.phase)
    }

    // Q5
    const bucket = selfAlive ? this.alive : this.deadOrSpectating
    bucket.bodies++
    if (nonEmptyObj(b.allplayers)) bucket.allplayers++
    if (nonEmptyObj(b.grenades)) bucket.grenades++

    // Q6 — after own death, does `player` switch to a teammate?
    if (player?.steamid && provider.steamid && player.steamid !== provider.steamid) {
      this.spectatingBodies++
      if (this.pendingDeathAt != null) {
        this.deathsSeen.push({ at: this.pendingDeathAt, switchedAfterMs: at - this.pendingDeathAt })
        this.pendingDeathAt = null
      }
    }
    if (isSelf && this.prevSelf) {
      const prevHealth = this.prevSelf.state?.health ?? 0
      if (prevHealth > 0 && health === 0) {
        if (this.pendingDeathAt != null) this.deathsSeen.push({ at: this.pendingDeathAt, switchedAfterMs: null })
        this.pendingDeathAt = at
      }
    }

    // Q8 / Q9 — kill deltas within one payload (own player only, same steamid as last body).
    if (isSelf && player) {
      const prev = this.prevSelf
      const k = player.match_stats?.kills
      const pk = prev?.match_stats?.kills
      if (prev && typeof k === 'number' && typeof pk === 'number' && k > pk && this.kills.length < MAX_KILL_EVENTS) {
        const rk = player.state?.round_kills
        const prk = prev.state?.round_kills
        const hs = player.state?.round_killhs
        const phs = prev.state?.round_killhs
        this.kills.push({
          receivedAt: at,
          providerTimestamp: provider.timestamp ?? null,
          round: map.round ?? null,
          killsDelta: k - pk,
          roundKillsDelta: typeof rk === 'number' && typeof prk === 'number' ? rk - prk : null,
          roundKillHsDelta: typeof hs === 'number' && typeof phs === 'number' ? hs - phs : null,
          activeWeapon: activeWeapon(player),
        })
      }
      this.prevSelf = player
    }
  }

  answers(throttleSeconds: number): Answers {
    if (this.pendingDeathAt != null) {
      this.deathsSeen.push({ at: this.pendingDeathAt, switchedAfterMs: null })
      this.pendingDeathAt = null
    }
    const gaps = this.times.slice(1).map((t, i) => t - this.times[i]).sort((a, b) => a - b)
    const liveGaps = this.liveRoundTimes.slice(1).map((t, i) => t - this.liveRoundTimes[i])
    const killsWithHs = this.kills.filter((k) => k.roundKillHsDelta != null).length
    const bomb = Object.fromEntries(Object.entries(this.bomb).map(([team, v]) => [team, { ...v, states: [...v.states] }]))
    return {
      1: {
        selfAliveBodies: this.selfAlive,
        selfAliveBodiesWithPosition: this.selfAliveWithPos,
        distinctSelfPositions: this.selfPositions.size,
        selfPositionChanges: this.selfPosChanges,
        frozen: this.selfAliveWithPos > 10 && this.selfPositions.size <= 1,
      },
      2: { byOwnTeam: bomb },
      3: { bodiesWithRoundWins: this.roundWinsBodies, reasons: [...this.roundWinReasons] },
      4: { bodiesWithPhaseCountdowns: this.countdownBodies, phases: [...this.countdownPhases] },
      5: { whileAlive: this.alive, whileDeadOrSpectating: this.deadOrSpectating },
      6: {
        spectatingBodies: this.spectatingBodies,
        providerSteamIdStable: this.providerIds.size <= 1,
        ownDeaths: this.deathsSeen.length,
        deathsFollowedBySwitch: this.deathsSeen.filter((d) => d.switchedAfterMs != null).length,
        switchDelaysMs: this.deathsSeen.map((d) => d.switchedAfterMs).slice(0, MAX_SAMPLES),
      },
      7: {
        throttleSeconds,
        posts: this.times.length,
        medianGapMs: percentile(gaps, 0.5),
        p95GapMs: percentile(gaps, 0.95),
        maxGapMs: gaps.length ? gaps[gaps.length - 1] : null,
        gapsOver2sWhileRoundLive: liveGaps.filter((g) => g > 2000).length,
        postsPerRound: this.postsPerRound,
        note: 'Compare with a second capture at the normal 0.5 s throttle for the 0.5 vs 0.1 question.',
      },
      8: {
        killsSeen: this.kills.length,
        killsWithRoundKillsDelta: this.kills.filter((k) => k.roundKillsDelta != null).length,
        killsWithHeadshotDelta: killsWithHs,
        killsWithActiveWeapon: this.kills.filter((k) => k.activeWeapon != null).length,
      },
      9: {
        killWallClock: this.kills,
        note: 'Compare these receivedAt times with the same kills\' demo ticks (demo saved via the app) to measure GSI vs demo offset.',
      },
    }
  }
}

/** Line-type census of a Deadlock console.log slice (question 13). */
export function classifyDeadlockConsole(text: string): Record<string, unknown> {
  const lines = text.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('# '))
  const tags: Record<string, number> = {}
  const keywords: Record<string, { count: number; samples: string[] }> = {}
  const KEYWORDS: Record<string, RegExp> = {
    kill: /\bkill(ed|s)?\b/i,
    death: /\b(died|death|dead)\b/i,
    souls: /\bsouls?\b/i,
    item: /\b(item|purchase|bought|upgrade)\b/i,
    matchStart: /\b(match start|game start|loading|connected to|map load)\b/i,
    matchEnd: /\b(match end|game over|gameover|disconnect|victory|defeat)\b/i,
  }
  for (const line of lines) {
    const tag = /^\s*(?:\d[\d/:. -]*\s+)?\[([^\]]{1,40})\]/.exec(line)?.[1] ?? '(no tag)'
    tags[tag] = (tags[tag] ?? 0) + 1
    for (const [name, re] of Object.entries(KEYWORDS)) {
      if (!re.test(line)) continue
      const k = keywords[name] ??= { count: 0, samples: [] }
      k.count++
      if (k.samples.length < 5) k.samples.push(line.slice(0, 200))
    }
  }
  const topTags = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 40)
  return { written: lines.length > 0, lines: lines.length, topTags: Object.fromEntries(topTags), keywords }
}

/** CS2 questions 10–12 from after-match events the app's own pipeline reports. */
export function cs2AfterMatchAnswers(endedAt: number | null, events: AfterMatchEvent[]): Answers {
  const since = (at: number): number | null => (endedAt != null ? at - endedAt : null)
  const lookups = events.filter((e) => e.kind === 'cs2-valve-demo')
  const found = lookups.find((e) => (e.data as { ok?: boolean }).ok)
  const parses = events.filter((e) => e.kind === 'cs2-demo-parse')
  const localDemos = events.filter((e) => e.kind === 'cs2-local-demos')
  return {
    10: {
      gcLookups: lookups.map((e) => ({ msAfterMatchEnd: since(e.at), ...(e.data as object) })),
      firstMatchWithDemoUrlMsAfterEnd: found ? since(found.at) : null,
      shareCode: 'not observable — the app does not call GetNextMatchSharingCode (needs the owner\'s auth code + Web API key).',
      note: 'Timed from the app\'s own Valve lookups (its normal retry schedule). The lookup needs CS2 closed.',
    },
    11: {
      parses: parses.map((e) => e.data),
      note: 'Positions-per-tick bundle is not built by the app yet; parse it offline from the saved demo.',
    },
    12: {
      localDemos: localDemos.map((e) => e.data),
      note: 'Ten players vs local view needs a parse of the listed demo.',
    },
  }
}

/** Deadlock questions 14–17. */
export function deadlockAfterMatchAnswers(opts: {
  endedAt: number | null
  lastReplayGrowthAt: number | null
  firstReplaySaltAt: number | null
  events: AfterMatchEvent[]
}): Answers {
  const base = opts.lastReplayGrowthAt ?? opts.endedAt
  const since = (at: number | null): number | null => (at != null && base != null ? at - base : null)
  const api = opts.events.filter((e) => e.kind === 'deadlock-api-metadata')
  const cdn = opts.events.filter((e) => e.kind === 'deadlock-replay-head')
  const okApi = api.find((e) => (e.data as { status?: number }).status === 200)
  const okCdn = cdn.find((e) => (e.data as { status?: number }).status === 200)
  return {
    14: { observable: false, note: 'The app does not read Steam rich presence; check the Steam friends list / localconfig by hand.' },
    15: {
      timedFrom: opts.lastReplayGrowthAt != null ? 'last .dem.partial growth' : 'capture end',
      replaySaltMsAfterEnd: since(opts.firstReplaySaltAt),
      metadataAttempts: api.map((e) => ({ msAfterEnd: since(e.at), ...(e.data as object) })),
      metadataOkMsAfterEnd: okApi ? since(okApi.at) : null,
      replayHeadAttempts: cdn.map((e) => ({ msAfterEnd: since(e.at), ...(e.data as object) })),
      replayDownloadableMsAfterEnd: okCdn ? since(okCdn.at) : null,
    },
    16: { observable: false, note: 'Compare death_details.death_pos in the saved deadlock-api metadata with the demo and /v1/assets/map offline.' },
    17: { observable: false, note: 'Re-run a HEAD on the replay URL at +7 and +30 days (URL is in deadlock-signals as clusterId/matchId/replaySalt).' },
  }
}
