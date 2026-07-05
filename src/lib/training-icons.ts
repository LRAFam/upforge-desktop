import type { TrainerScenarioKey } from './trainer-scenarios'

import flickIcon from '../assets/training/icons-png/flick.png'
import gridshotIcon from '../assets/training/icons-png/gridshot.png'
import sixshotIcon from '../assets/training/icons-png/sixshot.png'
import microadjustIcon from '../assets/training/icons-png/microadjust.png'
import microflickIcon from '../assets/training/icons-png/microflick.png'
import trackingIcon from '../assets/training/icons-png/tracking.png'
import strafeTrackIcon from '../assets/training/icons-png/strafe_track.png'
import switchingIcon from '../assets/training/icons-png/switching.png'
import strafeAimIcon from '../assets/training/icons-png/strafe_aim.png'
import duelIcon from '../assets/training/icons-png/duel.png'

import tabTrainIcon from '../assets/training/icons-png/tab-train.png'
import tabAnalyticsIcon from '../assets/training/icons-png/tab-analytics.png'
import tabLeaderboardsIcon from '../assets/training/icons-png/tab-leaderboards.png'
import tabLoadoutsIcon from '../assets/training/icons-png/tab-loadouts.png'

import categoryAimIcon from '../assets/training/icons-png/category-aim.png'
import categoryReactionIcon from '../assets/training/icons-png/category-reaction.png'
import categoryPrecisionIcon from '../assets/training/icons-png/category-precision.png'
import categoryDuelIcon from '../assets/training/icons-png/category-duel.png'
import dailyChallengeIcon from '../assets/training/icons-png/daily-challenge.png'

import guidedSessionHero from '../assets/training/guided-session-hero.png'
import loadoutArt from '../assets/training/loadout-crosshair-art.png'
import leaderboardEmptyArt from '../assets/training/leaderboard-empty.png'
import vodRecommendIcon from '../assets/training/vod-recommend-icon.png'

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
