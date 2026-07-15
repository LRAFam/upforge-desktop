import firstAnalysis from '../assets/ranks/badges/first-analysis.png'
import analyst10 from '../assets/ranks/badges/analyst-10.png'
import analyst25 from '../assets/ranks/badges/analyst-25.png'
import analyst50 from '../assets/ranks/badges/analyst-50.png'
import analyst100 from '../assets/ranks/badges/analyst-100.png'
import riotVerified from '../assets/ranks/badges/riot-verified.png'
import discordLinked from '../assets/ranks/badges/discord-linked.png'
import firstGuide from '../assets/ranks/badges/first-guide.png'
import recruiter from '../assets/ranks/badges/recruiter.png'
import squadLeader from '../assets/ranks/badges/squad-leader.png'
import loyal from '../assets/ranks/badges/loyal.png'
import betaTester from '../assets/ranks/badges/beta-tester.png'
import coached from '../assets/ranks/badges/coached.png'
import approvedCoach from '../assets/ranks/badges/approved-coach.png'
import topRatedCoach from '../assets/ranks/badges/top-rated-coach.png'
import founderBadge from '../assets/ranks/badges/founder.png'
import ambassador from '../assets/ranks/badges/ambassador.png'
import influencer from '../assets/ranks/badges/influencer.png'
import plusIcon from '../assets/ranks/subscription/plus.png'
import proIcon from '../assets/ranks/subscription/pro.png'
import founderIcon from '../assets/ranks/subscription/founder.png'

/** Profile badge slug → icon URL (matches API BadgeSeeder slugs). */
export const BADGE_ICONS: Record<string, string> = {
  first_analysis: firstAnalysis,
  analyst_10: analyst10,
  analyst_25: analyst25,
  analyst_50: analyst50,
  analyst_100: analyst100,
  riot_verified: riotVerified,
  discord_linked: discordLinked,
  first_guide: firstGuide,
  recruiter,
  squad_leader: squadLeader,
  loyal,
  beta_tester: betaTester,
  coached,
  approved_coach: approvedCoach,
  top_rated_coach: topRatedCoach,
  founder: founderBadge,
  ambassador,
  influencer,
  premium_member: plusIcon,
  pro_elite: proIcon,
}

/** Subscription tier → icon URL. */
const SUBSCRIPTION_ICONS: Record<string, string> = {
  premium: plusIcon,
  plus: plusIcon,
  pro: proIcon,
  founder: founderIcon,
}

/** Forge mastery level (1–40) → icon URL. */
const masteryModules = import.meta.glob<string>(
  '../assets/ranks/mastery/levels/mastery-level-*.webp',
  { eager: true, import: 'default' },
)

const MASTERY_ICONS: Record<number, string> = {}
for (const [path, url] of Object.entries(masteryModules)) {
  const match = path.match(/mastery-level-(\d+)\.webp$/)
  if (match) MASTERY_ICONS[Number(match[1])] = url
}

export function getBadgeIconUrl(slug: string): string | null {
  return BADGE_ICONS[slug] ?? null
}

export function getSubscriptionIconUrl(tier: string | null | undefined): string | null {
  return SUBSCRIPTION_ICONS[(tier ?? '').toLowerCase()] ?? null
}

export function getMasteryIconUrl(level: number): string | null {
  return MASTERY_ICONS[level] ?? null
}

/** All imported assets for preview grids. */
export const BADGE_PREVIEW_ITEMS = [
  { slug: 'premium_member', label: 'Plus' },
  { slug: 'pro_elite', label: 'Pro' },
  { slug: 'founder', label: 'Founder' },
  { slug: 'first_analysis', label: 'First Takeoff' },
  { slug: 'analyst_10', label: 'Getting Serious' },
  { slug: 'analyst_25', label: 'Analyst' },
  { slug: 'analyst_50', label: 'VOD Addict' },
  { slug: 'analyst_100', label: 'Elite Analyst' },
  { slug: 'riot_verified', label: 'Verified' },
  { slug: 'discord_linked', label: 'Social Butterfly' },
  { slug: 'first_guide', label: 'Knowledge Seeker' },
  { slug: 'recruiter', label: 'Recruiter' },
  { slug: 'squad_leader', label: 'Squad Leader' },
  { slug: 'loyal', label: 'Loyal' },
  { slug: 'beta_tester', label: 'Beta Tester' },
  { slug: 'coached', label: 'Student' },
  { slug: 'approved_coach', label: 'Certified Coach' },
  { slug: 'top_rated_coach', label: 'Elite Coach' },
  { slug: 'ambassador', label: 'Ambassador' },
  { slug: 'influencer', label: 'Influencer' },
] as const
