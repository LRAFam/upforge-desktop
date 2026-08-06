/**
 * Shared analyse eligibility rules for renderer surfaces.
 * Main process still enforces via ensureAnalysisReadinessForAnalyse + match hold.
 */

import { POST_MATCH_COPY } from './post-match-copy'

export type AnalyseGateRecording = {
  analysisReadiness?: { ready?: boolean; state?: string; message?: string } | null
  pipelineDeferReason?: 'recording' | null
  clipsOnly?: boolean
  lastAnalysisError?: string | null
  jobId?: string | null
}

export function isAnalyseReady(rec: AnalyseGateRecording): boolean {
  return rec.analysisReadiness?.ready === true
}

export function isAnalyseDeferredForMatch(rec: AnalyseGateRecording): boolean {
  return rec.pipelineDeferReason === 'recording' && !rec.clipsOnly
}

/** True when the Analyse CTA should be enabled (ignores in-flight / busy UI flags). */
export function canOfferAnalyse(rec: AnalyseGateRecording): boolean {
  if (rec.clipsOnly) return false
  if (isAnalyseDeferredForMatch(rec)) return false
  if (rec.lastAnalysisError && rec.jobId) return true
  return isAnalyseReady(rec)
}

export function analyseBlockedMessage(rec: AnalyseGateRecording): string {
  if (isAnalyseDeferredForMatch(rec)) return POST_MATCH_COPY.pausedAnalyseBlocked
  if (rec.analysisReadiness?.message) return rec.analysisReadiness.message
  const state = rec.analysisReadiness?.state
  if (state === 'syncing') return 'Syncing match stats…'
  if (state === 'finalizing') return 'Finalizing recording…'
  if (state === 'file_missing') return 'Recording file missing'
  if (state === 'mode_unsupported') return 'Mode not supported for coaching'
  if (state === 'file_unreadable') return 'Recording unreadable'
  return 'Not ready to analyse'
}

export function analyseDeferredShortLabel(): string {
  return 'Paused'
}

export function analyseDeferredTitle(): string {
  return POST_MATCH_COPY.pausedShort
}
