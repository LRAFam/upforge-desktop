import { ref } from 'vue'

export interface AchievementDef {
  id: string
  name: string
  description: string
  icon: string
  category: 'training' | 'coaching' | 'streak' | 'mastery'
  secret?: boolean
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-drill',      name: 'First Blood',       description: 'Complete your first aim training drill',        icon: '🎯', category: 'training' },
  { id: 'ten-drills',       name: 'Grind Mode',        description: 'Complete 10 training drills',                   icon: '💪', category: 'training' },
  { id: 'fifty-drills',     name: 'Dedicated',         description: 'Complete 50 training drills',                   icon: '🏋️', category: 'training' },
  { id: 'hundred-drills',   name: 'Iron Grind',        description: 'Complete 100 training drills',                  icon: '⚡', category: 'training' },
  { id: 'streak-3',         name: 'Hot Streak',        description: 'Train 3 days in a row',                         icon: '🔥', category: 'streak' },
  { id: 'streak-7',         name: 'On Fire',           description: 'Train 7 days in a row',                         icon: '🔥', category: 'streak',  secret: true },
  { id: 'streak-30',        name: 'Unstoppable',       description: 'Train 30 days in a row',                        icon: '🌟', category: 'streak',  secret: true },
  { id: 'score-90',         name: 'Elite Aim',         description: 'Score 90+ on any training drill',               icon: '🏆', category: 'mastery' },
  { id: 'score-100',        name: 'Perfect',           description: 'Score 100 on a training drill',                 icon: '👑', category: 'mastery', secret: true },
  { id: 'accuracy-90',      name: 'Sharpshooter',      description: 'Achieve 90%+ accuracy on any drill',            icon: '🎯', category: 'mastery' },
  { id: 'reaction-200',     name: 'Reaction King',     description: 'Average reaction time under 200ms on any drill', icon: '⚡', category: 'mastery' },
  { id: 'first-analysis',   name: 'Student of the Game', description: 'Submit your first VOD for AI analysis',       icon: '🤖', category: 'coaching' },
]

export function useAchievements() {
  const unlocked = ref<Record<string, string>>({}) // id → ISO date string

  async function load() {
    const s = await window.api.settings.get().catch(() => null)
    unlocked.value = (s as any)?.achievements ?? {}
  }

  async function unlock(id: string): Promise<boolean> {
    if (unlocked.value[id]) return false
    unlocked.value[id] = new Date().toISOString()
    await window.api.settings.save({ achievements: unlocked.value }).catch(() => {})
    return true
  }

  async function check(ctx: {
    totalDrills?: number
    streak?: number
    lastScore?: number
    lastAccuracy?: number
    lastReactionMs?: number
    hasAnalysis?: boolean
  }): Promise<string[]> {
    const newlyUnlocked: string[] = []

    const tryUnlock = async (id: string) => {
      const wasNew = await unlock(id)
      if (wasNew) newlyUnlocked.push(id)
    }

    if (ctx.totalDrills !== undefined) {
      if (ctx.totalDrills >= 1)   await tryUnlock('first-drill')
      if (ctx.totalDrills >= 10)  await tryUnlock('ten-drills')
      if (ctx.totalDrills >= 50)  await tryUnlock('fifty-drills')
      if (ctx.totalDrills >= 100) await tryUnlock('hundred-drills')
    }
    if (ctx.streak !== undefined) {
      if (ctx.streak >= 3)  await tryUnlock('streak-3')
      if (ctx.streak >= 7)  await tryUnlock('streak-7')
      if (ctx.streak >= 30) await tryUnlock('streak-30')
    }
    if (ctx.lastScore !== undefined) {
      if (ctx.lastScore >= 90)  await tryUnlock('score-90')
      if (ctx.lastScore >= 100) await tryUnlock('score-100')
    }
    if (ctx.lastAccuracy !== undefined && ctx.lastAccuracy >= 90) {
      await tryUnlock('accuracy-90')
    }
    if (ctx.lastReactionMs !== undefined && ctx.lastReactionMs < 200) {
      await tryUnlock('reaction-200')
    }
    if (ctx.hasAnalysis) {
      await tryUnlock('first-analysis')
    }

    return newlyUnlocked
  }

  return { unlocked, load, unlock, check }
}
