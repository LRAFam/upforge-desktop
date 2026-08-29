const RANK_LEVEL_SKILL = /\b(?:your\s+)?(aim|mechanics|positioning|game\s+sense|utility)\s+(?:is|looks?)\s+(?:iron|bronze|silver|gold|platinum|diamond|ascendant|immortal|radiant)[-\s]level(?:\s*\(([^)]*?(?:HS%|headshot)[^)]*)\))?/gi
const RANK_CAUSATION = /\b(is|are)\s+keeping\s+you\s+in\s+(?:iron|bronze|silver|gold|platinum|plat|diamond|ascendant|immortal|radiant)(?:\s+[123])?/gi

/** Keep legacy stored coaching from presenting one-match rank claims as facts. */
export function sanitizeUnsupportedRankClaimsForDisplay(text: string | null): string | null {
  if (!text) return text
  return text
    .replace(RANK_LEVEL_SKILL, (_match, skill: string, stat?: string) => (
      stat ? `This match recorded ${stat}` : `This match showed ${skill} evidence`
    ))
    .replace(RANK_CAUSATION, (_match, verb: string) => (
      `${String(verb).toLowerCase()} the clearest issue to review in this match`
    ))
}
