import { Client } from 'discord-rpc'

// UpForge Discord application — Rich Presence art assets must be uploaded at:
// https://discord.com/developers/applications → Art Assets
// Keys: upforge_logo, valorant_icon, cs2_icon, deadlock_icon
const CLIENT_ID = '1374432218801086504'

const DOWNLOAD_URL = 'https://upforge.gg/desktop'
const COACHING_URL = 'https://upforge.gg/valorant/analyze'
const DASHBOARD_URL = 'https://upforge.gg/dashboard'

const DEFAULT_BUTTONS = [
  { label: 'Download UpForge', url: DOWNLOAD_URL },
  { label: 'Get coached', url: COACHING_URL },
] as const

const REVIEW_BUTTONS = [
  { label: 'View dashboard', url: DASHBOARD_URL },
  { label: 'Get coached', url: COACHING_URL },
] as const

export type MatchPresenceContext = {
  map?: string | null
  agent?: string | null
}

type PresenceState =
  | { type: 'idle' }
  | { type: 'in-game'; game: string; context?: MatchPresenceContext }
  | { type: 'recording'; game: string; startTimestamp: Date; context?: MatchPresenceContext }
  | { type: 'reviewing' }

export class DiscordRPC {
  private client: Client | null = null
  private ready = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private currentState: PresenceState = { type: 'idle' }
  private lastPayloadKey = ''

  constructor(private readonly isEnabled: () => boolean) {
    this.connect()
  }

  private connect(): void {
    if (this.destroyed) return

    try {
      this.client = new Client({ transport: 'ipc' })

      this.client.on('ready', () => {
        console.log('[DiscordRPC] Connected')
        this.ready = true
        this.lastPayloadKey = ''
        this.applyState(this.currentState)
      })

      this.client.on('disconnected', () => {
        console.log('[DiscordRPC] Disconnected — will retry in 30s')
        this.ready = false
        this.scheduleReconnect()
      })

      this.client.login({ clientId: CLIENT_ID }).catch(() => {
        this.ready = false
        this.scheduleReconnect()
      })
    } catch {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.client?.destroy().catch(() => {})
      this.client = null
      this.connect()
    }, 30_000)
  }

  private enabled(): boolean {
    return this.isEnabled()
  }

  private matchSubtitle(context?: MatchPresenceContext): string | undefined {
    const parts: string[] = []
    if (context?.map) parts.push(context.map)
    if (context?.agent) parts.push(context.agent)
    return parts.length ? parts.join(' · ') : undefined
  }

  private buildActivity(state: PresenceState): Record<string, unknown> | null {
    if (!this.enabled()) return null

    if (state.type === 'idle') {
      return {
        details: 'In the dashboard',
        state: 'Fill the gap between games and coaching',
        largeImageKey: 'upforge_logo',
        largeImageText: 'UpForge — AI Coaching',
        buttons: [...DEFAULT_BUTTONS],
        instance: false,
      }
    }

    if (state.type === 'in-game') {
      const gameLabel = this.gameLabel(state.game)
      const subtitle = this.matchSubtitle(state.context)
      return {
        details: `In ${gameLabel} with UpForge`,
        state: subtitle ?? 'Waiting for match',
        largeImageKey: this.gameIcon(state.game),
        largeImageText: gameLabel,
        smallImageKey: 'upforge_logo',
        smallImageText: 'UpForge',
        buttons: [...DEFAULT_BUTTONS],
        instance: false,
      }
    }

    if (state.type === 'recording') {
      const gameLabel = this.gameLabel(state.game)
      const subtitle = this.matchSubtitle(state.context)
      return {
        details: `Recording ${gameLabel} with UpForge`,
        state: subtitle ?? 'Match in progress',
        largeImageKey: this.gameIcon(state.game),
        largeImageText: gameLabel,
        smallImageKey: 'upforge_logo',
        smallImageText: 'UpForge',
        startTimestamp: state.startTimestamp,
        buttons: [...DEFAULT_BUTTONS],
        instance: false,
      }
    }

    if (state.type === 'reviewing') {
      return {
        details: 'Reviewing coaching report',
        state: 'UpForge desktop',
        largeImageKey: 'upforge_logo',
        largeImageText: 'UpForge — AI Coaching',
        buttons: [...REVIEW_BUTTONS],
        instance: false,
      }
    }

    return null
  }

  private applyState(state: PresenceState): void {
    this.currentState = state

    if (!this.ready || !this.client) return

    if (!this.enabled()) {
      this.lastPayloadKey = ''
      this.client.clearActivity().catch(() => {})
      return
    }

    const activity = this.buildActivity(state)
    if (!activity) {
      this.client.clearActivity().catch(() => {})
      return
    }

    const payloadKey = JSON.stringify(activity)
    if (payloadKey === this.lastPayloadKey) return
    this.lastPayloadKey = payloadKey

    this.client.setActivity(activity).catch(() => {})
  }

  private gameLabel(game: string): string {
    if (game === 'cs2') return 'CS2'
    if (game === 'deadlock') return 'Deadlock'
    return 'VALORANT'
  }

  private gameIcon(game: string): string {
    if (game === 'cs2') return 'cs2_icon'
    if (game === 'deadlock') return 'deadlock_icon'
    return 'valorant_icon'
  }

  refresh(): void {
    this.lastPayloadKey = ''
    this.applyState(this.currentState)
  }

  setIdle(): void {
    this.applyState({ type: 'idle' })
  }

  setInGame(game: string, context?: MatchPresenceContext): void {
    this.applyState({ type: 'in-game', game, context })
  }

  setRecording(game: string, startTimestamp?: Date, context?: MatchPresenceContext): void {
    const ts =
      this.currentState.type === 'recording'
        ? this.currentState.startTimestamp
        : (startTimestamp ?? new Date())
    this.applyState({ type: 'recording', game, startTimestamp: ts, context })
  }

  setReviewing(): void {
    this.applyState({ type: 'reviewing' })
  }

  destroy(): void {
    this.destroyed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.client?.clearActivity().catch(() => {})
    this.client?.destroy().catch(() => {})
    this.client = null
  }
}
