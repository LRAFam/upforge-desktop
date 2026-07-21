/** User-facing OBS WebSocket connection helpers. */

export function explainObsConnectionFailure(opts: {
  processRunning: boolean
  connectError?: string | null
  launched?: boolean
}): string {
  const raw = opts.connectError?.trim()
  if (!opts.processRunning) {
    if (opts.launched) {
      return 'OBS did not finish starting. Open OBS Studio manually from your apps menu, wait until it fully loads, then click Connect.'
    }
    return 'OBS is not running. Click Launch OBS + Connect, or open OBS Studio yourself first.'
  }

  if (raw && /authentication|password|401/i.test(raw)) {
    return formatObsConnectError(raw)
  }

  return 'OBS is open but not responding — UpForge will try to restart it. If that fails, end obs64.exe in Task Manager, then click Launch OBS + Connect.'
}

export function formatObsConnectError(raw: string): string {
  const msg = raw.toLowerCase()
  if (msg.includes('authentication') || msg.includes('password') || msg.includes('401')) {
    return 'WebSocket password incorrect — copy it from OBS → Tools → WebSocket Server Settings → Show Connect Info'
  }
  if (msg.includes('econnrefused') || msg.includes('connection refused') || msg.includes('connect failed')) {
    return 'Cannot reach OBS WebSocket — enable the server in OBS → Tools → WebSocket Server Settings (default port 4455)'
  }
  if (msg.includes('enotfound') || msg.includes('getaddrinfo')) {
    return 'Invalid WebSocket host — use 127.0.0.1 if OBS is on this PC'
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'OBS WebSocket timed out — confirm OBS is running and the server is enabled'
  }
  return raw
}

/** Hosts to try — localhost often resolves to IPv6 on Windows while OBS listens on IPv4. */
export function obsConnectHosts(configuredHost: string): string[] {
  const trimmed = configuredHost.trim() || '127.0.0.1'
  const hosts: string[] = [trimmed]
  if (trimmed === 'localhost') hosts.push('127.0.0.1')
  if (trimmed === '127.0.0.1') hosts.push('localhost')
  return [...new Set(hosts)]
}
