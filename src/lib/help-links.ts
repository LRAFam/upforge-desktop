/**
 * Links from the app to the help page on upforge.gg. Opened in the system browser through the
 * main process's trusted-URL check (app:open-url), never inside the app.
 */
// No imports: the main process loads this through analysis-failure-messages.
export const HELP_URL = 'https://upforge.gg/help'
/** Fixes for failed uploads, analysis and recording problems. */
export const HELP_TROUBLESHOOTING_URL = `${HELP_URL}#troubleshooting`
/** What the stat names in reports mean. */
export const HELP_GLOSSARY_URL = `${HELP_URL}#glossary`

export async function openHelp(url: string = HELP_URL): Promise<void> {
  try {
    await window.api?.app?.openUrl?.(url)
  } catch {
    // Opening a browser is best effort; the link text says where help lives.
  }
}
