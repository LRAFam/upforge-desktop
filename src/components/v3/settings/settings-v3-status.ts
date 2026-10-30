/** The v3 Settings header status: what's working, in plain words. */
export interface SettingsStatusInput {
  recordingReady: boolean
  planLabel: string
}

export interface SettingsStatusItem {
  label: string
  value: string
  tone: 'ok' | 'warn' | 'neutral'
}

export function settingsStatusLine(input: SettingsStatusInput): SettingsStatusItem[] {
  return [
    {
      label: 'Recorder',
      value: input.recordingReady ? 'Ready' : 'Not connected',
      tone: input.recordingReady ? 'ok' : 'warn',
    },
    { label: 'Plan', value: input.planLabel || 'Free', tone: 'neutral' },
  ]
}
