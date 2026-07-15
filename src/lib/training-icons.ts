import type { TrainerScenarioKey } from './trainer-scenarios'

import flickIcon from '../assets/training/icons-png/flick.webp'
import gridshotIcon from '../assets/training/icons-png/gridshot.webp'
import sixshotIcon from '../assets/training/icons-png/sixshot.webp'
import microadjustIcon from '../assets/training/icons-png/microadjust.webp'
import microflickIcon from '../assets/training/icons-png/microflick.webp'
import trackingIcon from '../assets/training/icons-png/tracking.webp'
import strafeTrackIcon from '../assets/training/icons-png/strafe_track.webp'
import switchingIcon from '../assets/training/icons-png/switching.webp'
import strafeAimIcon from '../assets/training/icons-png/strafe_aim.webp'
import duelIcon from '../assets/training/icons-png/duel.webp'

import tabTrainIcon from '../assets/training/icons-png/tab-train.webp'
import tabAnalyticsIcon from '../assets/training/icons-png/tab-analytics.webp'
import tabLeaderboardsIcon from '../assets/training/icons-png/tab-leaderboards.webp'
import tabLoadoutsIcon from '../assets/training/icons-png/tab-loadouts.webp'

import categoryAimIcon from '../assets/training/icons-png/category-aim.webp'
import categoryReactionIcon from '../assets/training/icons-png/category-reaction.webp'
import categoryPrecisionIcon from '../assets/training/icons-png/category-precision.webp'
import categoryDuelIcon from '../assets/training/icons-png/category-duel.webp'
import dailyChallengeIcon from '../assets/training/icons-png/daily-challenge.webp'

import guidedSessionHero from '../assets/training/guided-session-hero.webp'
import loadoutArt from '../assets/training/loadout-crosshair-art.webp'
import leaderboardEmptyArt from '../assets/training/leaderboard-empty.webp'
import vodRecommendIcon from '../assets/training/vod-recommend-icon.webp'

export const TRAINING_SCENARIO_ICONS: Record<TrainerScenarioKey, string> = {
  flick: flickIcon,
  gridshot: gridshotIcon,
  sixshot: sixshotIcon,
  microadjust: microadjustIcon,
  microflick: microflickIcon,
  tracking: trackingIcon,
  strafe_track: strafeTrackIcon,
  switching: switchingIcon,
  strafe_aim: strafeAimIcon,
  duel: duelIcon,
}

export type TrainingTabKey = 'train' | 'analytics' | 'leaderboards' | 'loadouts'

export const TRAINING_TAB_ICONS: Record<TrainingTabKey, string> = {
  train: tabTrainIcon,
  analytics: tabAnalyticsIcon,
  leaderboards: tabLeaderboardsIcon,
  loadouts: tabLoadoutsIcon,
}

export type TrainingCategoryKey = 'aim' | 'reaction' | 'precision' | 'duel'

export const TRAINING_CATEGORY_ICONS: Record<TrainingCategoryKey, string> = {
  aim: categoryAimIcon,
  reaction: categoryReactionIcon,
  precision: categoryPrecisionIcon,
  duel: categoryDuelIcon,
}

export const TRAINING_ARTWORK = {
  guidedSessionHero,
  loadoutArt,
  leaderboardEmpty: leaderboardEmptyArt,
  vodRecommend: vodRecommendIcon,
  dailyChallenge: dailyChallengeIcon,
} as const

export function scenarioIconUrl(key: string): string {
  return TRAINING_SCENARIO_ICONS[key as TrainerScenarioKey] ?? flickIcon
}
