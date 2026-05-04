/**
 * Static Valorant helpers for the desktop renderer.
 * Mirrors the pure-function portions of the website's useValorant composable.
 * No Vue reactivity — safe to import anywhere in the Electron renderer.
 */

// ── Agent images ──────────────────────────────────────────────────────────────

/** valorant-api.com content UUIDs used for CDN media URLs */
const AGENT_CDN_UUIDS: Record<string, string> = {
  astra: '41fb69c1-4189-7b37-f117-bcaf1e96f1bf',
  breach: '5f8d3a7f-467b-97f3-062c-13acf203c006',
  brimstone: '9f0d8ba9-4140-b941-57d3-a7ad57c6b417',
  chamber: '22697a3d-45bf-8dd7-4fec-84a9e28c69d7',
  clove: '1dbf2edd-4729-0984-3115-daa5eed44993',
  cypher: '117ed9e3-49f3-6512-3ccf-0cada7e3823b',
  deadlock: 'cc8b64c8-4b25-4ff9-6e7f-37b4da43d235',
  fade: 'dade69b4-4f5a-8528-247b-219e5a1facd6',
  gekko: 'e370fa57-4757-3604-3648-499e1f642d3f',
  harbor: '95b78ed7-4637-86d9-7e41-71ba8c293152',
  iso: '0e38b510-41a8-5780-5e8f-568b2a4f2d6c',
  jett: 'add6443a-41bd-e414-f6ad-e58d267f4e95',
  kayo: '601dbbe7-43ce-be57-2a40-4abd24953621',
  killjoy: '1e58de9c-4950-5125-93e9-a0aee9f98746',
  miks: '7c8a4701-4de6-9355-b254-e09bc2a34b72',
  neon: 'bb2a4828-46eb-8cd1-e765-15848195d751',
  omen: '8e253930-4c05-31dd-1b6c-968525494517',
  phoenix: 'eb93336a-449b-9c1b-0a54-a891f7921d69',
  raze: 'f94c3b30-42be-e959-889c-5aa313dba261',
  reyna: 'a3bfb853-43b2-7238-a4f1-ad90e9e46bcc',
  sage: '569fdd95-4d10-43ab-ca70-79becc718b46',
  skye: '6f2a04ca-43e0-be17-7f36-b3908627744d',
  sova: '320b2a48-4d9b-a075-30f1-1f93a9b638fa',
  tejo: 'b444168c-4e35-8076-db47-ef9bf368f384',
  veto: '92eeef5d-43b5-1d4a-8d03-b3927a09034b',
  viper: '707eab51-4836-f488-046a-cda6bf494859',
  vyse: 'efba5359-4016-a1e5-7626-b1ae76895940',
  waylay: 'df1cb487-4902-002e-5c17-d28e83e78588',
  yoru: '7f94d92c-4234-0a36-9646-3a87eb8b5c89',
}

/**
 * Returns a CDN display-icon URL for the given agent name.
 */
export function getAgentImage(agentName: string | null | undefined): string {
  if (!agentName) return ''
  const key = agentName.toLowerCase().replace(/[/\s]/g, '')
  const uuid = AGENT_CDN_UUIDS[key]
  if (uuid) return `https://media.valorant-api.com/agents/${uuid}/displayicon.png`
  return ''
}

// ── Agent roles ───────────────────────────────────────────────────────────────

const AGENT_ROLES: Record<string, string> = {
  jett: 'Duelist',
  phoenix: 'Duelist',
  reyna: 'Duelist',
  raze: 'Duelist',
  yoru: 'Duelist',
  neon: 'Duelist',
  iso: 'Duelist',
  waylay: 'Duelist',
  brimstone: 'Controller',
  omen: 'Controller',
  viper: 'Controller',
  astra: 'Controller',
  harbor: 'Controller',
  harbour: 'Controller',
  clove: 'Controller',
  miks: 'Controller',
  breach: 'Initiator',
  sova: 'Initiator',
  skye: 'Initiator',
  fade: 'Initiator',
  gekko: 'Initiator',
  tejo: 'Initiator',
  kayo: 'Initiator',
  killjoy: 'Sentinel',
  cypher: 'Sentinel',
  sage: 'Sentinel',
  chamber: 'Sentinel',
  deadlock: 'Sentinel',
  vyse: 'Sentinel',
  veto: 'Sentinel',
}

/** Returns the role string for a given agent name. */
export function getAgentRole(agentName: string | null | undefined): string {
  if (!agentName) return 'Agent'
  const key = agentName.toLowerCase().replace(/[/\s]/g, '')
  return AGENT_ROLES[key] ?? 'Agent'
}

// ── Agent colours ─────────────────────────────────────────────────────────────

const AGENT_COLORS: Record<string, string> = {
  astra: '#9b6dff',
  breach: '#e07030',
  brimstone: '#d94f1e',
  chamber: '#c8a227',
  clove: '#c87de8',
  cypher: '#4ca3d4',
  deadlock: '#3bcfb4',
  fade: '#7b3fa8',
  gekko: '#4ec94e',
  harbor: '#17b0a0',
  iso: '#3a85d4',
  jett: '#91c9f0',
  kayo: '#d43a3a',
  killjoy: '#f0c330',
  miks: '#462b75',
  neon: '#5baaff',
  omen: '#9052c8',
  phoenix: '#f05a1e',
  raze: '#e88020',
  reyna: '#bf47c8',
  sage: '#24c69e',
  skye: '#42cc6a',
  sova: '#2b6cc4',
  tejo: '#8ecf5a',
  viper: '#36c46a',
  vyse: '#8898aa',
  yoru: '#5c3cc8',
  waylay: '#f03060',
  veto: '#6a8aa8',
}

/** Returns a hex accent colour for a given agent name (for glows, borders, etc.). */
export function getAgentColor(agentName: string | null | undefined): string {
  if (!agentName) return '#6366f1'
  const key = agentName.toLowerCase().replace(/[/\s]/g, '')
  return AGENT_COLORS[key] ?? '#6366f1'
}

// ── Map images ────────────────────────────────────────────────────────────────

const MAP_SPLASH_URLS: Record<string, string> = {
  abyss: 'https://media.valorant-api.com/maps/224b0a95-48b9-f703-1bd8-67aca101a61f/splash.png',
  ascent: 'https://media.valorant-api.com/maps/7eaecc1b-4337-bbf6-6ab9-04b8f06b3319/splash.png',
  bind: 'https://media.valorant-api.com/maps/2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba/splash.png',
  breeze: 'https://media.valorant-api.com/maps/2fb9a4fd-47b8-4e7d-a969-74b4046ebd53/splash.png',
  corrode: 'https://media.valorant-api.com/maps/1c18ab1f-420d-0d8b-71d0-77ad3c439115/splash.png',
  drift: 'https://media.valorant-api.com/maps/2c09d728-42d5-30d8-43dc-96a05cc7ee9d/splash.png',
  fracture: 'https://media.valorant-api.com/maps/b529448b-4d60-346e-e89e-00a4c527a405/splash.png',
  haven: 'https://media.valorant-api.com/maps/2bee0dc9-4ffe-519b-1cbd-7fbe763a6047/splash.png',
  icebox: 'https://media.valorant-api.com/maps/e2ad5c54-4114-a870-9641-8ea21279579a/splash.png',
  lotus: 'https://media.valorant-api.com/maps/2fe4ed3a-450a-948b-6d6b-e89a78e680a9/splash.png',
  pearl: 'https://media.valorant-api.com/maps/fd267378-4d1d-484f-ff52-77821ed10dc2/splash.png',
  split: 'https://media.valorant-api.com/maps/d960549e-485c-e861-8d71-aa9d1aed12a2/splash.png',
  sunset: 'https://media.valorant-api.com/maps/92584fbe-486a-b1b2-9faa-39b0f486b498/splash.png',
}

const MAP_MINIMAP_URLS: Record<string, string> = {
  abyss: 'https://media.valorant-api.com/maps/224b0a95-48b9-f703-1bd8-67aca101a61f/displayicon.png',
  ascent: 'https://media.valorant-api.com/maps/7eaecc1b-4337-bbf6-6ab9-04b8f06b3319/displayicon.png',
  bind: 'https://media.valorant-api.com/maps/2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba/displayicon.png',
  breeze: 'https://media.valorant-api.com/maps/2fb9a4fd-47b8-4e7d-a969-74b4046ebd53/displayicon.png',
  corrode: 'https://media.valorant-api.com/maps/1c18ab1f-420d-0d8b-71d0-77ad3c439115/displayicon.png',
  drift: 'https://media.valorant-api.com/maps/2c09d728-42d5-30d8-43dc-96a05cc7ee9d/displayicon.png',
  fracture: 'https://media.valorant-api.com/maps/b529448b-4d60-346e-e89e-00a4c527a405/displayicon.png',
  haven: 'https://media.valorant-api.com/maps/2bee0dc9-4ffe-519b-1cbd-7fbe763a6047/displayicon.png',
  icebox: 'https://media.valorant-api.com/maps/e2ad5c54-4114-a870-9641-8ea21279579a/displayicon.png',
  lotus: 'https://media.valorant-api.com/maps/2fe4ed3a-450a-948b-6d6b-e89a78e680a9/displayicon.png',
  pearl: 'https://media.valorant-api.com/maps/fd267378-4d1d-484f-ff52-77821ed10dc2/displayicon.png',
  split: 'https://media.valorant-api.com/maps/d960549e-485c-e861-8d71-aa9d1aed12a2/displayicon.png',
  sunset: 'https://media.valorant-api.com/maps/92584fbe-486a-b1b2-9faa-39b0f486b498/displayicon.png',
}

/** Returns the full-art splash URL for a Valorant map. */
export function getMapImage(mapName: string | null | undefined): string {
  if (!mapName) return ''
  const key = mapName.toLowerCase().replace(/\s/g, '')
  return MAP_SPLASH_URLS[key] ?? ''
}

/** Returns the minimap / display-icon URL for a Valorant map. */
export function getMapMinimap(mapName: string | null | undefined): string {
  if (!mapName) return ''
  const key = mapName.toLowerCase().replace(/\s/g, '')
  return MAP_MINIMAP_URLS[key] ?? ''
}

// ── Rank colours ──────────────────────────────────────────────────────────────

/** Returns a hex accent colour for a given rank string (e.g. "Immortal 3"). */
export function getRankHexColor(rank: string | null | undefined): string {
  if (!rank) return '#6b7280'
  const lower = rank.toLowerCase()
  if (lower.includes('radiant')) return '#fde68a'
  if (lower.includes('immortal')) return '#f87171'
  if (lower.includes('ascendant')) return '#34d399'
  if (lower.includes('diamond')) return '#60a5fa'
  if (lower.includes('platinum')) return '#22d3ee'
  if (lower.includes('gold')) return '#fbbf24'
  if (lower.includes('silver')) return '#d1d5db'
  if (lower.includes('bronze')) return '#fb923c'
  if (lower.includes('iron')) return '#6b7280'
  return '#6b7280'
}

// ── Role colours ──────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  Duelist: '#f87171',
  Sentinel: '#fbbf24',
  Controller: '#a78bfa',
  Initiator: '#60a5fa',
  Agent: '#9ca3af',
}

/** Returns the hex colour for a role label. */
export function getRoleColor(role: string): string {
  return ROLE_COLORS[role] ?? '#9ca3af'
}

// ── Tier helpers ──────────────────────────────────────────────────────────────

/** Returns Tailwind classes for a subscription tier badge. */
export function getTierClass(tier: string | null | undefined): string {
  switch (tier?.toLowerCase()) {
    case 'pro':     return 'border-purple-500/30 text-purple-400 bg-purple-500/[0.08]'
    case 'elite':   return 'border-yellow-500/30 text-yellow-500 bg-yellow-500/[0.08]'
    case 'premium': return 'border-red-500/30 text-red-400 bg-red-500/[0.08]'
    default:        return 'border-white/[0.08] text-gray-500 bg-white/[0.03]'
  }
}

/** Returns Tailwind classes for a small tier badge (mini version). */
export function getTierBadgeClass(tier: string | null | undefined): string {
  switch (tier?.toLowerCase()) {
    case 'pro':     return 'bg-purple-500/20 text-purple-400'
    case 'elite':   return 'bg-yellow-500/20 text-yellow-400'
    case 'premium': return 'bg-red-500/20 text-red-400'
    default:        return 'bg-white/10 text-gray-400'
  }
}

// ── Mode label ────────────────────────────────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  COMPETITIVE: 'Competitive',
  PREMIER: 'Premier',
  CLASSIC: 'Unrated',
  DEATHMATCH: 'Deathmatch',
  TEAMDEATHMATCH: 'Team Deathmatch',
  SPIKERUSH: 'Spike Rush',
  SWIFTPLAY: 'Swift Play',
  SNOWBALL: 'Snowball Fight',
}

/** Returns a human-readable label for a Valorant queue/mode ID. */
export function formatGameMode(mode: string): string {
  return MODE_LABELS[mode] ?? mode
}
