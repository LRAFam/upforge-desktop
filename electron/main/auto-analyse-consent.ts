export const AUTO_ANALYSE_CONSENT_VERSION = 1 as const

export function migrateAutoAnalyseConsent<T extends Record<string, unknown>>(
  input: T,
): { settings: T & { autoAnalyse: boolean; autoAnalyseConsentVersion: 1 }; migrated: boolean } {
  if (input.autoAnalyseConsentVersion === AUTO_ANALYSE_CONSENT_VERSION) {
    return {
      settings: {
        ...input,
        autoAnalyse: input.autoAnalyse === true,
        autoAnalyseConsentVersion: AUTO_ANALYSE_CONSENT_VERSION,
      },
      migrated: false,
    }
  }
  return {
    settings: {
      ...input,
      autoAnalyse: false,
      autoAnalyseConsentVersion: AUTO_ANALYSE_CONSENT_VERSION,
    },
    migrated: true,
  }
}
