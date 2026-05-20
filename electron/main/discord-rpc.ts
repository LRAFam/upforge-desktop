import { Client } from 'discord-rpc'

// UpForge Discord application client ID
// Register at https://discord.com/developers/applications
const CLIENT_ID = '1374432218801086504'

type PresenceState =
  | { type: 'idle' }
  | { type: 'in-game'; game: string }
  | { type: 'recording'; game: string; startTimestamp: Date }
  | { type: 'reviewing' }

export class DiscordRPC {
  private client: Client | null = null
  private ready = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private currentState: PresenceState = { type: 'idle' }

  constructor() {
    this.connect()
  }

  private connect(): void {
    if (this.destroyed) return

    try {
      this.client = new Client({ transport: 'ipc' })

      this.client.on('ready', () => {
        console.log('[DiscordRPC] Connected')
        this.ready = true
        this.applyState(this.currentState)
      })

      this.client.on('disconnected', () => {
        console.log('[DiscordRPC] Disconnected — will retry in 30s')
        this.ready = false
        this.scheduleReconnect()
      })

      this.client.login({ clientId: CLIENT_ID }).catch(() => {
        // Discord not running or RPC unavailable — retry silently
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

  private applyState(state: PresenceState): void {
    if (!this.ready || !this.client) return

    if (state.type === 'idle') {
      this.client.setActivity({
        details: 'In the dashboard',
        largeImageKey: 'upforge_logo',
        largeImageText: 'UpForge — AI Valorant Coaching',
        instance: false,
      }).catch(() => {})
      return
    }

    if (state.type === 'in-game') {
      const gameLabel = this.gameLabel(state.game)
      this.client.setActivity({
        details: `Playing ${gameLabel}`,
        state: 'Waiting for match',
        largeImageKey: 'upforge_logo',
        largeImageText: 'UpForge — AI Coaching',
        smallImageKey: this.gameIcon(state.game),
        smallImageText: gameLabel,
        instance: false,
      }).catch(() => {})
      return
    }

    if (state.type === 'recording') {
      const gameLabel = this.gameLabel(state.game)
      this.client.setActivity({
        details: `Recording ${gameLabel}`,
        state: 'Match in progress',
        largeImageKey: 'upforge_logo',
        largeImageText: 'UpForge — AI Coaching',
        smallImageKey: this.gameIcon(state.game),
        smallImageText: gameLabel,
        startTimestamp: state.startTimestamp,
        instance: false,
      }).catch(() => {})
      return
    }

    if (state.type === 'reviewing') {
      this.client.setActivity({
        details: 'Reviewing coaching report',
        largeImageKey: 'upforge_logo',
        largeImageText: 'UpForge — AI Coaching',
        instance: false,
      }).catch(() => {})
    }
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

  setIdle(): void {
    this.currentState = { type: 'idle' }
    this.applyState(this.currentState)
  }

  setInGame(game: string): void {
    this.currentState = { type: 'in-game', game }
    this.applyState(this.currentState)
  }

  setRecording(game: string, startTimestamp?: Date): void {
    this.currentState = { type: 'recording', game, startTimestamp: startTimestamp ?? new Date() }
    this.applyState(this.currentState)
  }

  setReviewing(): void {
    this.currentState = { type: 'reviewing' }
    this.applyState(this.currentState)
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
