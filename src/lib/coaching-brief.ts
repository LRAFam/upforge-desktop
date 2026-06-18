export type CoachingSeverity = 'critical' | 'high' | 'moderate' | 'low' | 'warning'

export interface CoachingEvidence {
  roundNumber: number
  roundLabel: string
  timeLabel: string
  timeSeconds: number
  text: string
}

export interface TacticalIntelBrief {
  severity: CoachingSeverity | null
  headline: string
  fix: string | null
  evidence: CoachingEvidence[]
  improvements: string[]
  tags: string[]
  source: 'coaching' | 'heatmap'
}

const SEVERITY_PATTERN = /^(CRITICAL|HIGH|MODERATE|LOW|WARNING)\s*[—–-]\s*/i
const FIX_PATTERN = /\s+Fix:\s*(.+)$/i
const EVIDENCE_PATTERN = /R(\d+)\s*\[(\d{1,2}):(\d{2})\]\s*[—–-]\s*/gi

function normalizeSeverity(raw: string): CoachingSeverity {
  const key = raw.toLowerCase()
  if (key === 'warning') return 'warning'
  if (key === 'critical') return 'critical'
  if (key === 'high') return 'high'
  if (key === 'moderate') return 'moderate'
  return 'low'
}

function trimSentence(text: string): string {
  return text.trim().replace(/\.\s*$/, '')
}

function parseEvidenceSegments(text: string): { headline: string; evidence: CoachingEvidence[] } {
  const matches = [...text.matchAll(new RegExp(EVIDENCE_PATTERN.source, 'gi'))]
  if (!matches.length) {
    return { headline: trimSentence(text), evidence: [] }
  }

  const headline = trimSentence(text.slice(0, matches[0].index ?? 0))
  const evidence: CoachingEvidence[] = []

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i]
    const start = (match.index ?? 0) + match[0].length
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length
    const roundDisplay = Number.parseInt(match[1], 10)
    const minutes = Number.parseInt(match[2], 10)
    const seconds = Number.parseInt(match[3], 10)

    evidence.push({
      roundNumber: Math.max(0, roundDisplay - 1),
      roundLabel: `R${roundDisplay}`,
      timeLabel: `${match[2]}:${match[3]}`,
      timeSeconds: minutes * 60 + seconds,
      text: trimSentence(text.slice(start, end)),
    })
  }

  return { headline, evidence }
}

export function buildTacticalIntelBrief(
  raw: string,
  opts?: {
    improvements?: string[]
    tags?: string[]
    source?: TacticalIntelBrief['source']
  },
): TacticalIntelBrief {
  let text = raw.trim()
  let severity: CoachingSeverity | null = null

  const severityMatch = text.match(SEVERITY_PATTERN)
  if (severityMatch) {
    severity = normalizeSeverity(severityMatch[1])
    text = text.slice(severityMatch[0].length)
  }

  let fix: string | null = null
  const fixMatch = text.match(FIX_PATTERN)
  if (fixMatch?.[1]) {
    fix = trimSentence(fixMatch[1])
    text = text.slice(0, fixMatch.index).trim()
  }

  const { headline, evidence } = parseEvidenceSegments(text)
  const improvements = (opts?.improvements ?? []).filter(Boolean)

  return {
    severity,
    headline: headline || (evidence.length ? '' : trimSentence(text)),
    fix,
    evidence,
    improvements,
    tags: opts?.tags ?? [],
    source: opts?.source ?? 'coaching',
  }
}

export function severityLabel(severity: CoachingSeverity | null): string | null {
  if (!severity) return null
  if (severity === 'warning') return 'Warning'
  return severity.charAt(0).toUpperCase() + severity.slice(1)
}
