import { ref } from 'vue'

export interface AchievementDef {
  id: string
  name: string
  description: string
  icon: string
  category: 'training' | 'coaching' | 'streak' | 'mastery'
  secret?: boolean
}

const svg = (inner: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">${inner}</svg>`

const ICON_CROSSHAIR = svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>')
const ICON_BOLT      = svg('<path d="M13 2 4.09 12.96A1 1 0 0 0 5 14.5h6.5L10 22l10-11h-7z"/>')
const ICON_TROPHY    = svg('<path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2"/><path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>')
const ICON_STAR      = svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>')
const ICON_ACTIVITY  = svg('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>')
const ICON_CPU       = svg('<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M9 2v2M2 15h2M2 9h2M22 15h-2M22 9h-2M15 22v-2M9 22v-2"/>')

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-drill',      name: 'First Blood',         description: 'Complete your first aim training drill',         icon: ICON_CROSSHAIR, category: 'training' },
  { id: 'ten-drills',       name: 'Grind Mode',           description: 'Complete 10 training drills',                    icon: ICON_ACTIVITY,  category: 'training' },
  { id: 'fifty-drills',     name: 'Dedicated',            description: 'Complete 50 training drills',                    icon: ICON_ACTIVITY,  category: 'training' },
  { id: 'hundred-drills',   name: 'Iron Grind',           description: 'Complete 100 training drills',                   icon: ICON_BOLT,      category: 'training' },
  { id: 'streak-3',         name: 'Hot Streak',           description: 'Train 3 days in a row',                          icon: ICON_BOLT,      category: 'streak' },
  { id: 'streak-7',         name: 'On Fire',              description: 'Train 7 days in a row',                          icon: ICON_BOLT,      category: 'streak',  secret: true },
  { id: 'streak-30',        name: 'Unstoppable',          description: 'Train 30 days in a row',                         icon: ICON_STAR,      category: 'streak',  secret: true },
  { id: 'score-90',         name: 'Elite Aim',            description: 'Score 90+ on any training drill',                icon: ICON_TROPHY,    category: 'mastery' },
  { id: 'score-100',        name: 'Perfect',              description: 'Score 100 on a training drill',                  icon: ICON_STAR,      category: 'mastery', secret: true },
  { id: 'accuracy-90',      name: 'Sharpshooter',         description: 'Achieve 90%+ accuracy on any drill',             icon: ICON_CROSSHAIR, category: 'mastery' },
  { id: 'reaction-200',     name: 'Reaction King',        description: 'Average reaction time under 200ms on any drill',  icon: ICON_BOLT,      category: 'mastery' },
  { id: 'first-analysis',   name: 'Student of the Game',  description: 'Submit your first VOD for AI analysis',          icon: ICON_CPU,       category: 'coaching' },
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
    // Spread to a plain object — Vue reactive proxies can't be serialized by
    // Electron's structured clone algorithm and will throw "object could not be cloned".
    await window.api.settings.save({ achievements: { ...unlocked.value } }).catch(() => {})
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
