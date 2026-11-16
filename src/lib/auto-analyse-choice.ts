/**
 * The one explicit "analyse automatically?" choice (onboarding step 4 and the first post-game
 * prompt). Auto-analyse stays off unless the player picks it; either answer is stored with the
 * consent version so neither place asks again.
 */
export const AUTO_ANALYSE_CHOICE_LABEL = 'Analyse my matches automatically'
export const AUTO_ANALYSE_CHOICE_HINT = 'This uploads each recording when the match ends and uses one analysis from your plan.'

export interface AutoAnalyseChoicePatch {
  autoAnalyse: boolean
  autoAnalyseConsentVersion: 1
  autoAnalysePromptAnswered: true
}

export function autoAnalyseChoicePatch(enabled: boolean): AutoAnalyseChoicePatch {
  return { autoAnalyse: enabled, autoAnalyseConsentVersion: 1, autoAnalysePromptAnswered: true }
}

/** Offer the post-game prompt only to players who are off and have never answered. */
export function shouldOfferAutoAnalyse(settings: { autoAnalyse?: boolean; autoAnalysePromptAnswered?: boolean } | null | undefined): boolean {
  if (!settings) return false
  return settings.autoAnalyse !== true && settings.autoAnalysePromptAnswered !== true
}
