import { Client } from 'discord-rpc'
import log from 'electron-log'

// UpForge Discord application (same app as upforge-discord-bot / DISCORD_CLIENT_ID).
// Rich Presence art assets: https://discord.com/developers/applications → Art Assets
// Keys: upforge_logo, valorant_icon, cs2_icon, deadlock_icon
const CLIENT_ID = '1435393708546592939'

const DOWNLOAD_URL = 'https://upforge.gg/desktop'
const DISCORD_URL = 'https://discord.com/invite/ZntUrewgzx'
const DASHBOARD_URL = 'https://upforge.gg/dashboard'

/** Medal-style CTAs — visible on every presence card. */
const DEFAULT_BUTTONS = [
  { label: 'Join on Discord', url: DISCORD_URL },
  { label: 'Download UpForge', url: DOWNLOAD_URL },
] as const

const REVIEW_BUTTONS = [
  { label: 'View coaching', url: DASHBOARD_URL },
  { label: 'Download UpForge', url: DOWNLOAD_URL },
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

export type DiscordRpcStatus = {
  connected: boolean
  enabled: boolean
  buttonsRegistered: boolean
  buttonLabels: string[]
  details: string | null
  state: string | null
}

export class DiscordRPC {
  private client: Client | null = null
  private ready = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private started = false
  private currentState: PresenceState = { type: 'idle' }
  private lastPayloadKey = ''
  private lastStatus: DiscordRpcStatus = {
    connected: false,
    enabled: true,
    buttonsRegistered: false,
    buttonLabels: [],
    details: null,
    state: null,
  }

  constructor(private readonly isEnabled: () => boolean) {}

  /** Call after settings are loaded so presence respects the user toggle. */
  start(): void {
    if (this.started || this.destroyed) return
    this.started = true
    this.connect()
  }

  getStatus(): DiscordRpcStatus {
    return { ...this.lastStatus, enabled: this.enabled() }
  }

  private updateStatus(patch: Partial<DiscordRpcStatus>): void {
    this.lastStatus = { ...this.lastStatus, ...patch }
  }

  private connect(): void {
    if (this.destroyed) return

    try {
      this.client = new Client({ transport: 'ipc' })

      this.client.on('ready', () => {
        log.info('[DiscordRPC] Connected')
        this.ready = true
        this.lastPayloadKey = ''
        this.updateStatus({ connected: true })
        this.applyState(this.currentState)
      })

      this.client.on('disconnected', () => {
        log.info('[DiscordRPC] Disconnected — will retry in 30s')
        this.ready = false
        this.updateStatus({ connected: false, buttonsRegistered: false, buttonLabels: [] })
        this.scheduleReconnect()
      })

      this.client.on('error', (err: Error) => {
        log.warn('[DiscordRPC] Client error:', err?.message ?? err)
      })

      this.client.login({ clientId: CLIENT_ID }).catch((err: Error) => {
        const msg = err?.message ?? String(err)
        if (msg === 'connection closed') {
          log.warn(
            '[DiscordRPC] Login failed — Discord rejected the application ID. '
              + 'Check CLIENT_ID matches your Discord developer application.',
          )
        } else {
          log.debug('[DiscordRPC] Login failed (Discord may be closed):', msg)
        }
        this.ready = false
        this.updateStatus({ connected: false, buttonsRegistered: false, buttonLabels: [] })
        this.scheduleReconnect()
      })
    } catch (err) {
      log.warn('[DiscordRPC] Connect threw:', err)
      this.updateStatus({ connected: false, buttonsRegistered: false, buttonLabels: [] })
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
    try {
      return this.isEnabled()
    } catch (err) {
      log.warn('[DiscordRPC] isEnabled check failed:', err)
      return true
    }
  }

  private matchSubtitle(context?: MatchPresenceContext): string | undefined {
    const parts: string[] = []
    if (context?.map) parts.push(context.map)
    if (context?.agent) parts.push(context.agent)
    return parts.length ? parts.join(' · ') : undefined
  }

  private brandedGameLine(game: string): string {
    return `${this.gameLabel(game)} with UpForge`
  }

  private buildActivity(state: PresenceState): Record<string, unknown> | null {
    if (!this.enabled()) return null

    if (state.type === 'idle') {
      return {
        details: 'UpForge',
        state: 'Free AI coaching · Record your matches',
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
        details: this.brandedGameLine(state.game),
        state: subtitle ?? `Playing ${gameLabel}`,
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
        details: this.brandedGameLine(state.game),
        state: subtitle ?? `Recording ${gameLabel}`,
        largeImageKey: this.gameIcon(state.game),
        largeImageText: gameLabel,
        smallImageKey: 'upforge_logo',
        smallImageText: 'UpForge',
        // Discord expects Unix seconds; discord-rpc wrongly converts Date → ms.
        startTimestamp: Math.floor(state.startTimestamp.getTime() / 1000),
        buttons: [...DEFAULT_BUTTONS],
        instance: false,
      }
    }

    if (state.type === 'reviewing') {
      return {
        details: 'UpForge',
        state: 'Reviewing AI coaching report',
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
      this.updateStatus({ buttonsRegistered: false, buttonLabels: [], details: null, state: null })
      this.client.clearActivity().catch((err: Error) => {
        log.debug('[DiscordRPC] clearActivity failed:', err?.message ?? err)
      })
      return
    }

    const activity = this.buildActivity(state)
    if (!activity) {
      this.client.clearActivity().catch((err: Error) => {
        log.debug('[DiscordRPC] clearActivity failed:', err?.message ?? err)
      })
      return
    }

    const payloadKey = JSON.stringify(activity)
    if (payloadKey === this.lastPayloadKey) return
    this.lastPayloadKey = payloadKey

    void this.pushActivity(activity)
  }

  private async pushActivity(activity: Record<string, unknown>): Promise<void> {
    if (!this.client) return
    const buttonLabels = Array.isArray(activity.buttons)
      ? activity.buttons.map((b) => (typeof b === 'object' && b && 'label' in b ? String(b.label) : '')).filter(Boolean)
      : []
    try {
      const result = await this.client.setActivity(activity)
      const registered = Boolean(result?.metadata?.button_urls?.length || result?.buttons?.length)
      this.updateStatus({
        buttonsRegistered: registered,
        buttonLabels: registered
          ? (result?.buttons as string[] | undefined) ?? buttonLabels
          : buttonLabels,
        details: typeof activity.details === 'string' ? activity.details : null,
        state: typeof activity.state === 'string' ? activity.state : null,
      })
      if (buttonLabels.length) {
        log.info('[DiscordRPC] Presence updated with buttons:', buttonLabels.join(' · '))
      }
      if (result?.metadata?.button_urls?.length) {
        log.debug('[DiscordRPC] Button URLs registered:', result.metadata.button_urls)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const code = err instanceof Error && 'code' in err ? (err as Error & { code?: number }).code : undefined
      // Only drop buttons when Discord rejects the button payload itself.
      if ('buttons' in activity && code === 5000) {
        log.warn('[DiscordRPC] Buttons rejected by Discord, retrying without:', message)
        const { buttons: _buttons, ...withoutButtons } = activity
        try {
          await this.client.setActivity(withoutButtons)
          return
        } catch (retryErr) {
          log.warn('[DiscordRPC] setActivity failed:', retryErr instanceof Error ? retryErr.message : retryErr)
          return
        }
      }
      log.warn('[DiscordRPC] setActivity failed:', message, code != null ? `(code ${code})` : '')
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
