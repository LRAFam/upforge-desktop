import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface SessionResult {
  scenario: string
  duration_seconds: number
  score: number
  accuracy_pct: number
  avg_reaction_ms: number
  consistency_score: number
  targets_hit: number
  targets_missed: number
  heatmap?: Array<{ x: number; y: number; hit: boolean }>
  completed_at: string
}

export interface LaunchConfig {
  scenario: string
  duration_seconds: number
  difficulty: string
  context?: Record<string, unknown>
}

export const useTrainerResultStore = defineStore('trainerResult', () => {
  const result = ref<SessionResult | null>(null)
  const isPB = ref(false)
  const launchConfig = ref<LaunchConfig | null>(null)
  const prevBestScore = ref<number | null>(null)

  function setResult(r: SessionResult, config: LaunchConfig | null, prevBest: number | null) {
    result.value = r
    launchConfig.value = config
    prevBestScore.value = prevBest
    isPB.value = false
  }

  function setPB(value: boolean) {
    isPB.value = value
  }

  function clear() {
    result.value = null
    isPB.value = false
    launchConfig.value = null
    prevBestScore.value = null
  }

  return { result, isPB, launchConfig, prevBestScore, setResult, setPB, clear }
})
