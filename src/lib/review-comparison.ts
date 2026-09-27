import { boundedMediaTime } from './review-media'

export type ComparisonSide = 0 | 1
export interface ComparisonMedia {
  currentTime: number
  duration: number
  paused: boolean
  readyState: number
  playbackRate: number
  play(): Promise<void>
  pause(): void
}

/** Owns only the two comparison players, never the review session or its source loader. */
export class ReviewComparison {
  linked = false
  anchors: [number, number] = [0, 0]
  private generations = [0, 0]
  constructor(private media: (side: ComparisonSide) => ComparisonMedia | null) {}

  pause(side?: ComparisonSide) {
    const sides: ComparisonSide[] = side === undefined ? [0, 1] : [side]
    for (const i of sides) { this.generations[i]++; this.media(i)?.pause() }
  }

  align(starts?: [number, number]) {
    this.pause()
    const a = this.media(0), b = this.media(1)
    if (!a || !b || a.readyState < 1 || b.readyState < 1) return false
    const anchors: [number, number] = starts ?? [a.currentTime, b.currentTime]
    if (boundedMediaTime(anchors[0], a.duration) !== anchors[0] || boundedMediaTime(anchors[1], b.duration) !== anchors[1]) return false
    this.anchors = [...anchors]
    this.linked = true
    return true
  }

  unlink() { this.pause(); this.linked = false }

  seek(side: ComparisonSide, seconds: number) {
    const player = this.media(side)
    if (!player) return
    const target = boundedMediaTime(seconds, player.duration)
    if (target == null) return
    this.pause(this.linked ? undefined : side)
    if (!this.linked) { player.currentTime = target; return }
    const a = this.media(0), b = this.media(1)
    if (!a || !b) return
    // Clamp the shared offset, not each player independently (which loses alignment).
    const low = Math.max(-this.anchors[0], -this.anchors[1])
    const high = Math.min(a.duration - this.anchors[0], b.duration - this.anchors[1])
    const offset = Math.max(low, Math.min(high, target - this.anchors[side]))
    a.currentTime = this.anchors[0] + offset
    b.currentTime = this.anchors[1] + offset
  }

  async play(side: ComparisonSide): Promise<boolean> {
    return this.playSides(this.linked ? [0, 1] : [side])
  }

  async playBoth(): Promise<boolean> { return this.playSides([0, 1]) }

  private async playSides(sides: ComparisonSide[]): Promise<boolean> {
    for (const side of sides) this.pause(side)
    const generations = sides.map(s => this.generations[s])
    const players = sides.map(s => this.media(s))
    if (players.some(p => !p || p.readyState < 3 || p.currentTime >= p.duration)) return false
    try {
      await Promise.all(players.map(async (player, index) => {
        await player!.play()
        if (generations[index] !== this.generations[sides[index]]) player!.pause()
      }))
      return sides.every((s, i) => generations[i] === this.generations[s])
    } catch {
      for (const side of sides) this.pause(side)
      return false
    }
  }

  setSpeed(rate: number) {
    if (![0.25, 0.5, 1, 1.5, 2].includes(rate)) return
    for (const side of [0, 1] as const) {
      const player = this.media(side)
      if (player) player.playbackRate = rate
    }
  }

  interrupt() { if (this.linked) this.pause() }
}

/** Loop offsets are relative to the explicit A/B start points. */
export function validComparisonLoop(starts: [number, number], durations: [number, number], from: number, to: number): boolean {
  return [...starts, ...durations, from, to].every(Number.isFinite)
    && starts.every((start, side) => start >= 0 && durations[side] > start)
    && from >= 0 && to > from
    && to <= Math.min(durations[0] - starts[0], durations[1] - starts[1])
}

/** Agent names can repeat across teams; only a canonical player ID establishes identity. */
export function comparisonPlayerLabel(name: string | null | undefined, puuid: string | undefined, ownPuuid: string | null, players: Array<{ puuid?: string | null; summonerName?: string; agent?: string | null }>): string {
  if (puuid && puuid === ownPuuid) return 'You'
  const player = puuid ? players.find(p => p.puuid === puuid) : undefined
  if (player?.agent) return player.agent
  if (player?.summonerName) return player.summonerName
  if (!name) return ''
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) return 'Unknown player'
  return name
}
