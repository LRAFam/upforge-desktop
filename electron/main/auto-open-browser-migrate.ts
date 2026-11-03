/**
 * One-time migration: "Open results in browser" (autoOpenBrowser) defaulted to on before v2.5.61, so old
 * installs still have `true` stored and every finished analysis opened the website. Results are now viewed
 * in the app, and an old default can't be told apart from a real choice, so turn it off once. The toggle
 * stays in Settings for anyone who wants it back; after this runs their choice is kept.
 */
export type AutoOpenBrowserMigrateInput = {
  autoOpenBrowser?: boolean
  autoOpenBrowserInAppV1?: boolean
}

export function migrateAutoOpenBrowserInApp<T extends AutoOpenBrowserMigrateInput>(parsed: T): { settings: T; migrated: boolean } {
  if (parsed.autoOpenBrowserInAppV1 === true) return { settings: parsed, migrated: false }
  return { settings: { ...parsed, autoOpenBrowser: false, autoOpenBrowserInAppV1: true }, migrated: true }
}
