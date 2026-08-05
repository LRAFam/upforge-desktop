export type SettingsCategoryId = 'account' | 'recording' | 'trainer' | 'app' | 'advanced'

export type SettingsSectionId =
  | 'obs'
  | 'storage'
  | 'discord'
  | 'developer'
  | 'capture'
  | 'usage'
  | 'hotkeys'

const CATEGORY_IDS: ReadonlySet<string> = new Set([
  'account',
  'recording',
  'trainer',
  'app',
  'advanced',
])

const SECTION_IDS: ReadonlySet<string> = new Set([
  'obs',
  'storage',
  'discord',
  'developer',
  'capture',
  'usage',
  'hotkeys',
])

const LEGACY_TAB_MAP: Record<string, SettingsCategoryId> = {
  general: 'account',
  system: 'advanced',
}

export function isSettingsCategoryId(value: string): value is SettingsCategoryId {
  return CATEGORY_IDS.has(value)
}

export function resolveSettingsCategory(tabQuery: unknown): SettingsCategoryId {
  if (Array.isArray(tabQuery)) return 'account'
  const raw = tabQuery
  if (typeof raw !== 'string' || !raw) return 'account'
  if (isSettingsCategoryId(raw)) return raw
  return LEGACY_TAB_MAP[raw] ?? 'account'
}

export function resolveSettingsSection(sectionQuery: unknown): SettingsSectionId | null {
  const raw = Array.isArray(sectionQuery) ? sectionQuery[0] : sectionQuery
  if (typeof raw !== 'string' || !raw) return null
  return SECTION_IDS.has(raw) ? (raw as SettingsSectionId) : null
}

export const SETTINGS_CATEGORY_META: ReadonlyArray<{
  id: SettingsCategoryId
  label: string
  purpose: string
  icon: string
}> = [
  {
    id: 'account',
    label: 'Account',
    purpose: 'Plan, linked games, and sign-in',
    icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>',
  },
  {
    id: 'recording',
    label: 'Recording',
    purpose: 'Capture, quality, clips, and storage',
    icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>',
  },
  {
    id: 'trainer',
    label: 'Trainer',
    purpose: 'Aim calibration, crosshair, and hotkeys',
    icon: '<circle cx="12" cy="12" r="10" stroke-width="1.5"/><circle cx="12" cy="12" r="4" stroke-width="1.5"/><line x1="12" y1="2" x2="12" y2="6" stroke-width="1.5"/><line x1="12" y1="18" x2="12" y2="22" stroke-width="1.5"/><line x1="2" y1="12" x2="6" y2="12" stroke-width="1.5"/><line x1="18" y1="12" x2="22" y2="12" stroke-width="1.5"/>',
  },
  {
    id: 'app',
    label: 'App',
    purpose: 'Primary game, startup, and automation',
    icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.5 6h9m-9 6h9m-9 6h9M4.5 6h.008v.008H4.5V6zm0 6h.008v.008H4.5V12zm0 6h.008v.008H4.5V18z"/>',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    purpose: 'OBS, diagnostics, updates, and developer tools',
    icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>',
  },
]
