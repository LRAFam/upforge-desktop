/** Where a taken upforge:// action goes in the renderer. Pure, so it can be tested without a router. */
export type DeepLinkTarget =
  | { type: 'route'; location: { path: string; query: Record<string, string> } }
  | { type: 'web'; path: string }

export function deepLinkRoute(action: unknown, uiV3: boolean): DeepLinkTarget | null {
  const a = action as { kind?: unknown; coachId?: unknown } | null | undefined
  if (!a || a.kind !== 'roster-join') return null
  const id = a.coachId
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || id > 999_999_999) return null
  // v3 joins in-app (Coaches looks the coach up and asks before joining); the old UI uses the web invite page.
  return uiV3
    ? { type: 'route', location: { path: '/rosters', query: { join: '1', invite: String(id) } } }
    : { type: 'web', path: `/coaches/${id}#join-roster` }
}
