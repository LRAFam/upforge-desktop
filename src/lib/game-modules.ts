import type { Component } from 'vue'
import type { AnalysisItem } from '../env.d.ts'
import type { PrimaryGame } from './games'
import { mapDeadlockToAnalysisItem } from './deadlock-analyses'
import { mapCs2ToAnalysisItem } from './cs2-analyses'
import { mapLolToAnalysisItem } from './lol-analyses'
import CS2StatsPanel from '../components/CS2StatsPanel.vue'
import Cs2ValveStatsPanel from '../components/Cs2ValveStatsPanel.vue'
import CS2SetupPanel from '../components/CS2SetupPanel.vue'
import DeadlockStatsPanel from '../components/DeadlockStatsPanel.vue'
import DeadlockDemoPanel from '../components/DeadlockDemoPanel.vue'
import LolStatsPanel from '../components/LolStatsPanel.vue'

export interface GameFeatures {
  /** Valorant VOD timeline in-app */
  vodReviewTimeline: boolean
  /** Aim trainer nav tab */
  aimTraining: boolean
  /** Valorant RR / agent stats page */
  performanceStats: boolean
  /** Map filter pills on history */
  mapFilters: boolean
  /** Inline coaching detail from analyses.getDetail */
  coachingDetail: boolean
  /** Win/loss streak in dashboard status bar */
  rankStreak: boolean
}

export interface GameModule {
  id: PrimaryGame
  centerPanels: Component[]
  navRoutes: readonly string[]
  features: GameFeatures
  loadAnalyses: (limit?: number) => Promise<AnalysisItem[]>
  openAnalyze: () => void
  openHistoryWeb: () => void
}

const VALORANT_NAV = ['/dashboard', '/training', '/clips', '/recordings', '/squad', '/stats', '/history', '/performance', '/settings'] as const
const DEMO_GAME_NAV = ['/dashboard', '/clips', '/recordings', '/history', '/settings'] as const

const VALORANT_FEATURES: GameFeatures = {
  vodReviewTimeline: true,
  aimTraining: true,
  performanceStats: true,
  mapFilters: true,
  coachingDetail: true,
  rankStreak: true,
}

const DEMO_GAME_FEATURES: GameFeatures = {
  vodReviewTimeline: false,
  aimTraining: false,
  performanceStats: false,
  mapFilters: false,
  coachingDetail: false,
  rankStreak: false,
}

const CS2_FEATURES: GameFeatures = {
  ...DEMO_GAME_FEATURES,
  vodReviewTimeline: true,
  coachingDetail: true,
}

const DEADLOCK_FEATURES: GameFeatures = {
  ...DEMO_GAME_FEATURES,
  coachingDetail: true,
}

async function loadValorantAnalyses(limit = 10): Promise<AnalysisItem[]> {
  return window.api.analyses.get(limit).catch(() => [])
}

async function loadDeadlockAnalyses(limit = 10): Promise<AnalysisItem[]> {
  const items = await window.api.deadlock.getAnalyses(limit).catch(() => [])
  return items.map(mapDeadlockToAnalysisItem)
}

async function loadCs2Analyses(limit = 10): Promise<AnalysisItem[]> {
  const items = await window.api.cs2.getAnalyses(limit).catch(() => [])
  return items
    .filter(a => a.status === 'completed')
    .map(mapCs2ToAnalysisItem)
}

async function loadLolAnalyses(limit = 10): Promise<AnalysisItem[]> {
  const items = await window.api.lol.getAnalyses(limit).catch(() => [])
  return items
    .filter(a => a.status === 'completed')
    .map(mapLolToAnalysisItem)
}

export const GAME_MODULES: Record<PrimaryGame, GameModule> = {
  valorant: {
    id: 'valorant',
    centerPanels: [],
    navRoutes: VALORANT_NAV,
    features: VALORANT_FEATURES,
    loadAnalyses: loadValorantAnalyses,
    openAnalyze: () => { window.open('https://upforge.gg/valorant/analyze', '_blank') },
    openHistoryWeb: () => { window.open('https://upforge.gg/valorant/history', '_blank') },
  },
  cs2: {
    id: 'cs2',
    centerPanels: [Cs2ValveStatsPanel, CS2StatsPanel, CS2SetupPanel],
    navRoutes: DEMO_GAME_NAV,
    features: CS2_FEATURES,
    loadAnalyses: loadCs2Analyses,
    openAnalyze: () => { void window.api.cs2.openAnalyze() },
    openHistoryWeb: () => { window.open('https://upforge.gg/cs2/history', '_blank') },
  },
  deadlock: {
    id: 'deadlock',
    centerPanels: [DeadlockStatsPanel, DeadlockDemoPanel],
    navRoutes: DEMO_GAME_NAV,
    features: DEADLOCK_FEATURES,
    loadAnalyses: loadDeadlockAnalyses,
    openAnalyze: () => { void window.api.deadlock.openAnalyze() },
    openHistoryWeb: () => { window.open('https://upforge.gg/deadlock/history', '_blank') },
  },
  lol: {
    id: 'lol',
    centerPanels: [LolStatsPanel],
    navRoutes: DEMO_GAME_NAV,
    features: DEMO_GAME_FEATURES,
    loadAnalyses: loadLolAnalyses,
    openAnalyze: () => { window.open('https://upforge.gg/lol/analyze', '_blank') },
    openHistoryWeb: () => { window.open('https://upforge.gg/lol/history', '_blank') },
  },
}

export function gameModule(game: PrimaryGame): GameModule {
  return GAME_MODULES[game] ?? GAME_MODULES.valorant
}

export function gameNavRoutes(game: PrimaryGame): readonly string[] {
  return gameModule(game).navRoutes
}

export function gameCenterPanels(game: PrimaryGame): Component[] {
  return gameModule(game).centerPanels
}

export async function loadGameAnalyses(game: PrimaryGame, limit = 10): Promise<AnalysisItem[]> {
  return gameModule(game).loadAnalyses(limit)
}

export { openGameAnalysis } from './open-game-analysis'

export function openGameHistoryWeb(game: PrimaryGame): void {
  gameModule(game).openHistoryWeb()
}

export function openGameAnalyze(game: PrimaryGame): void {
  gameModule(game).openAnalyze()
}

/** @deprecated use gameCenterPanels */
export const DASHBOARD_CENTER_PANELS = {
  get valorant() { return GAME_MODULES.valorant.centerPanels },
  get cs2() { return GAME_MODULES.cs2.centerPanels },
  get deadlock() { return GAME_MODULES.deadlock.centerPanels },
  get lol() { return GAME_MODULES.lol.centerPanels },
}
