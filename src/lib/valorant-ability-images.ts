/**
 * Ability icons from Valorant Wiki (Fandom) — stable URLs for kill-feed display.
 * @see https://valorant.fandom.com/wiki/Category:Ability_Images
 */

export type AbilitySlotKey = 'grenade' | 'ability1' | 'ability2' | 'ultimate'

/** Normalize ability/weapon labels for map lookup */
export function normalizeAbilityKey(value: string | null | undefined): string {
  if (!value) return ''
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Gun names — do not treat as abilities when weapon field matches */
const WEAPON_KEYS = new Set([
  'classic',
  'shorty',
  'frenzy',
  'ghost',
  'sheriff',
  'stinger',
  'spectre',
  'bucky',
  'judge',
  'bulldog',
  'guardian',
  'phantom',
  'vandal',
  'marshal',
  'outlaw',
  'operator',
  'ares',
  'odin',
  'melee',
  'knife',
  'spike',
  'fall',
])

/**
 * Correct agent + API slot → display name (valorant-api slots, not lineup editor slots).
 * Covers cases where match data has abilitySlot but generic weapon "Ability".
 */
const AGENT_SLOT_ABILITY: Record<string, Partial<Record<AbilitySlotKey, string>>> = {
  breach: {
    grenade: 'Aftershock',
    ability1: 'Flashpoint',
    ability2: 'Fault Line',
    ultimate: 'Rolling Thunder',
  },
  brimstone: {
    grenade: 'Stim Beacon',
    ability1: 'Incendiary',
    ability2: 'Sky Smoke',
    ultimate: 'Orbital Strike',
  },
  chamber: {
    grenade: 'Trademark',
    ability1: 'Headhunter',
    ability2: 'Rendezvous',
    ultimate: 'Tour De Force',
  },
  clove: { grenade: 'Meddle', ability1: 'Ruse', ability2: 'Pick-me-up', ultimate: 'Not Dead Yet' },
  cypher: {
    grenade: 'Trapwire',
    ability1: 'Cyber Cage',
    ability2: 'Spycam',
    ultimate: 'Neural Theft',
  },
  fade: { grenade: 'Prowler', ability1: 'Seize', ability2: 'Haunt', ultimate: 'Nightfall' },
  gekko: { grenade: 'Mosh Pit', ability1: 'Wingman', ability2: 'Dizzy', ultimate: 'Thrash' },
  harbor: { grenade: 'Cove', ability1: 'High Tide', ability2: 'Cascade', ultimate: 'Reckoning' },
  jett: {
    grenade: 'Cloudburst',
    ability1: 'Updraft',
    ability2: 'Tailwind',
    ultimate: 'Blade Storm',
  },
  kayo: {
    grenade: 'FRAG/ment',
    ability1: 'FLASH/drive',
    ability2: 'Zero/point',
    ultimate: 'Null/cmd',
  },
  killjoy: { grenade: 'Nanoswarm', ability1: 'Alarmbot', ability2: 'Turret', ultimate: 'Lockdown' },
  omen: {
    grenade: 'Shrouded Step',
    ability1: 'Paranoia',
    ability2: 'Dark Cover',
    ultimate: 'From the Shadows',
  },
  phoenix: {
    grenade: 'Blaze',
    ability1: 'Curveball',
    ability2: 'Hot Hands',
    ultimate: 'Run it Back',
  },
  raze: {
    grenade: 'Boom Bot',
    ability1: 'Blast Pack',
    ability2: 'Paint Shells',
    ultimate: 'Showstopper',
  },
  reyna: { grenade: 'Leer', ability1: 'Devour', ability2: 'Dismiss', ultimate: 'Empress' },
  sage: {
    grenade: 'Barrier Orb',
    ability1: 'Slow Orb',
    ability2: 'Healing Orb',
    ultimate: 'Resurrection',
  },
  skye: {
    grenade: 'Regrowth',
    ability1: 'Trailblazer',
    ability2: 'Guiding Light',
    ultimate: 'Seekers',
  },
  sova: {
    grenade: 'Owl Drone',
    ability1: 'Shock Bolt',
    ability2: 'Recon Bolt',
    ultimate: "Hunter's Fury",
  },
  viper: {
    grenade: 'Poison Cloud',
    ability1: 'Toxic Screen',
    ability2: 'Snake Bite',
    ultimate: "Viper's Pit",
  },
  yoru: {
    grenade: 'Fakeout',
    ability1: 'Blindside',
    ability2: 'Gatecrash',
    ultimate: 'Dimensional Drift',
  },
  astra: {
    grenade: 'Gravity Well',
    ability1: 'Nova Pulse',
    ability2: 'Nebula',
    ultimate: 'Cosmic Divide',
  },
  deadlock: {
    grenade: 'GravNet',
    ability1: 'Sonic Sensor',
    ability2: 'Barrier Mesh',
    ultimate: 'Annihilation',
  },
  iso: {
    grenade: 'Contingency',
    ability1: 'Undercut',
    ability2: 'Double Tap',
    ultimate: 'Kill Contract',
  },
  neon: {
    grenade: 'Fast Lane',
    ability1: 'Relay Bolt',
    ability2: 'High Gear',
    ultimate: 'Overdrive',
  },
  vyse: { grenade: 'Razorvine', ability1: 'Shear', ability2: 'Arc Rose', ultimate: 'Steel Garden' },
  waylay: {
    grenade: 'Saturate',
    ability1: 'Lightspeed',
    ability2: 'Refract',
    ultimate: 'Convergent Paths',
  },
}

/** Fandom CDN URLs (valorant.fandom.com Category:Ability_Images) */
export const FANDOM_ABILITY_IMAGES: Record<string, string> = {
  aftershock:
    'https://static.wikia.nocookie.net/valorant/images/3/32/Aftershock.png/revision/latest?cb=20200405184838',
  alarmbot:
    'https://static.wikia.nocookie.net/valorant/images/d/d9/Alarmbot.png/revision/latest?cb=20200804132222',
  annihilation:
    'https://static.wikia.nocookie.net/valorant/images/b/b2/Annihilation.png/revision/latest?cb=20230625071900',
  barrierorb:
    'https://static.wikia.nocookie.net/valorant/images/1/10/Barrier_Orb.png/revision/latest?cb=20200405203507',
  barriermesh:
    'https://static.wikia.nocookie.net/valorant/images/e/ec/Barrier_Mesh.png/revision/latest?cb=20230625071902',
  blaze:
    'https://static.wikia.nocookie.net/valorant/images/b/bd/Blaze.png/revision/latest?cb=20200406002639',
  bladestorm:
    'https://static.wikia.nocookie.net/valorant/images/0/06/Blade_Storm.png/revision/latest?cb=20200405215226',
  blindside:
    'https://static.wikia.nocookie.net/valorant/images/2/2f/Blindside.png/revision/latest?cb=20210112180620',
  boombot:
    'https://static.wikia.nocookie.net/valorant/images/f/ff/Boom_Bot.png/revision/latest?cb=20240621122232',
  cloudburst:
    'https://static.wikia.nocookie.net/valorant/images/b/b9/Cloudburst.png/revision/latest?cb=20200405215200',
  cosmicdivide:
    'https://static.wikia.nocookie.net/valorant/images/f/f4/Cosmic_Divide.png/revision/latest?cb=20210302170328',
  curveball:
    'https://static.wikia.nocookie.net/valorant/images/3/30/Curveball.png/revision/latest?cb=20200405193829',
  cybercage:
    'https://static.wikia.nocookie.net/valorant/images/7/7c/Cyber_Cage.png/revision/latest?cb=20200405222332',
  darkcover:
    'https://static.wikia.nocookie.net/valorant/images/2/2c/Dark_Cover.png/revision/latest?cb=20200405212635',
  devour:
    'https://static.wikia.nocookie.net/valorant/images/3/3d/Devour.png/revision/latest?cb=20200802072627',
  dimensionaldrift:
    'https://static.wikia.nocookie.net/valorant/images/7/70/Dimensional_Drift.png/revision/latest?cb=20210112180612',
  dismiss:
    'https://static.wikia.nocookie.net/valorant/images/0/0a/Dismiss.png/revision/latest?cb=20200802072650',
  dizzy:
    'https://static.wikia.nocookie.net/valorant/images/8/8d/Dizzy.png/revision/latest?cb=20230307075659',
  empress:
    'https://static.wikia.nocookie.net/valorant/images/1/12/Empress.png/revision/latest?cb=20200802072724',
  fakeout:
    'https://static.wikia.nocookie.net/valorant/images/b/b1/Fakeout.png/revision/latest?cb=20220301160110',
  faultline:
    'https://static.wikia.nocookie.net/valorant/images/0/09/Fault_Line.png/revision/latest?cb=20200405190047',
  flashpoint:
    'https://static.wikia.nocookie.net/valorant/images/f/f2/Flashpoint.png/revision/latest?cb=20200405185608',
  fromtheshadows:
    'https://static.wikia.nocookie.net/valorant/images/0/0e/From_the_Shadows.png/revision/latest?cb=20200405212650',
  gatecrash:
    'https://static.wikia.nocookie.net/valorant/images/f/f4/Gatecrash.png/revision/latest?cb=20210119041159',
  gravnet:
    'https://static.wikia.nocookie.net/valorant/images/9/9b/GravNet.png/revision/latest?cb=20230625071903',
  gravitywell:
    'https://static.wikia.nocookie.net/valorant/images/4/41/Gravity_Well.png/revision/latest?cb=20210302170436',
  guidedlight:
    'https://static.wikia.nocookie.net/valorant/images/3/37/Guiding_Light.png/revision/latest?cb=20230914141259',
  guidedsalvo:
    'https://static.wikia.nocookie.net/valorant/images/9/9e/Guided_Salvo.png/revision/latest?cb=20250107192242',
  haunt:
    'https://static.wikia.nocookie.net/valorant/images/3/37/Haunt.png/revision/latest?cb=20220426222713',
  headhunter:
    'https://static.wikia.nocookie.net/valorant/images/0/06/Headhunter.png/revision/latest?cb=20211116151539',
  healingorb:
    'https://static.wikia.nocookie.net/valorant/images/e/ea/Healing_Orb.png/revision/latest?cb=20200405203710',
  huntersfury:
    'https://static.wikia.nocookie.net/valorant/images/9/90/Hunter%27s_Fury.png/revision/latest?cb=20200803160706',
  incendiary:
    'https://static.wikia.nocookie.net/valorant/images/2/26/Incendiary.png/revision/latest?cb=20200405205403',
  killcontract:
    'https://static.wikia.nocookie.net/valorant/images/6/6a/Kill_Contract.png/revision/latest?cb=20231031130658',
  leer: 'https://static.wikia.nocookie.net/valorant/images/3/3e/Leer.png/revision/latest?cb=20200802072434',
  lockdown:
    'https://static.wikia.nocookie.net/valorant/images/7/7c/Lockdown.png/revision/latest?cb=20200804132315',
  meddle:
    'https://static.wikia.nocookie.net/valorant/images/c/c2/Meddle.png/revision/latest?cb=20240326163740',
  moshpit:
    'https://static.wikia.nocookie.net/valorant/images/2/24/Mosh_Pit.png/revision/latest?cb=20230307075658',
  nanoswarm:
    'https://static.wikia.nocookie.net/valorant/images/4/4d/Nanoswarm.png/revision/latest?cb=20200804132242',
  nightfall:
    'https://static.wikia.nocookie.net/valorant/images/9/90/Nightfall.png/revision/latest?cb=20220426222718',
  novapulse:
    'https://static.wikia.nocookie.net/valorant/images/5/51/Nova_Pulse.png/revision/latest?cb=20210302170417',
  orbitalstrike:
    'https://static.wikia.nocookie.net/valorant/images/6/61/Orbital_Strike.png/revision/latest?cb=20200405205426',
  owldrone:
    'https://static.wikia.nocookie.net/valorant/images/1/1d/Owl_Drone.png/revision/latest?cb=20200405225244',
  paintshells:
    'https://static.wikia.nocookie.net/valorant/images/3/30/Paint_Shells.png/revision/latest?cb=20240621122252',
  paranoia:
    'https://static.wikia.nocookie.net/valorant/images/8/8d/Paranoia.png/revision/latest?cb=20200405212616',
  poisoncloud:
    'https://static.wikia.nocookie.net/valorant/images/8/81/Poison_Cloud.png/revision/latest?cb=20200405224117',
  prowler:
    'https://static.wikia.nocookie.net/valorant/images/6/68/Prowler.png/revision/latest?cb=20220426222657',
  razorvine:
    'https://static.wikia.nocookie.net/valorant/images/6/66/Razorvine.png/revision/latest?cb=20240827165759',
  reckoning:
    'https://static.wikia.nocookie.net/valorant/images/2/20/Reckoning.png/revision/latest?cb=20251111171447',
  reconbolt:
    'https://static.wikia.nocookie.net/valorant/images/3/39/Recon_Bolt.png/revision/latest?cb=20200405225305',
  regrowth:
    'https://static.wikia.nocookie.net/valorant/images/4/47/Regrowth.png/revision/latest?cb=20230914141312',
  rendezvous:
    'https://static.wikia.nocookie.net/valorant/images/8/83/Rendezvous.png/revision/latest?cb=20211116151506',
  resurrection:
    'https://static.wikia.nocookie.net/valorant/images/e/e1/Resurrection.png/revision/latest?cb=20200405203707',
  rollingthunder:
    'https://static.wikia.nocookie.net/valorant/images/7/7a/Rolling_Thunder.png/revision/latest?cb=20200405190227',
  runitback:
    'https://static.wikia.nocookie.net/valorant/images/f/fd/Run_it_Back.png/revision/latest?cb=20200406002648',
  ruse: 'https://static.wikia.nocookie.net/valorant/images/6/63/Ruse.png/revision/latest?cb=20240326163808',
  seekers:
    'https://static.wikia.nocookie.net/valorant/images/a/a9/Seekers.png/revision/latest?cb=20230914141239',
  seize:
    'https://static.wikia.nocookie.net/valorant/images/1/1f/Seize.png/revision/latest?cb=20220426222708',
  shear:
    'https://static.wikia.nocookie.net/valorant/images/a/a2/Shear.png/revision/latest?cb=20240827165830',
  shockbolt:
    'https://static.wikia.nocookie.net/valorant/images/f/fe/Shock_Bolt.png/revision/latest?cb=20200405225254',
  showstopper:
    'https://static.wikia.nocookie.net/valorant/images/1/18/Showstopper.png/revision/latest?cb=20240621122241',
  shroudedstep:
    'https://static.wikia.nocookie.net/valorant/images/8/80/Shrouded_Step.png/revision/latest?cb=20200405212629',
  skysmoke:
    'https://static.wikia.nocookie.net/valorant/images/7/71/Sky_Smoke.png/revision/latest?cb=20200405205417',
  sloworb:
    'https://static.wikia.nocookie.net/valorant/images/b/bb/Slow_Orb.png/revision/latest?cb=20200405203400',
  sonicsensor:
    'https://static.wikia.nocookie.net/valorant/images/e/e3/Sonic_Sensor.png/revision/latest?cb=20230625071859',
  specialdelivery:
    'https://static.wikia.nocookie.net/valorant/images/d/db/Special_Delivery.png/revision/latest?cb=20250107192243',
  spycam:
    'https://static.wikia.nocookie.net/valorant/images/3/3f/Spycam.png/revision/latest?cb=20200405222325',
  steelgarden:
    'https://static.wikia.nocookie.net/valorant/images/c/cb/Steel_Garden.png/revision/latest?cb=20240827165844',
  stimbeacon:
    'https://static.wikia.nocookie.net/valorant/images/a/ad/Stim_Beacon.png/revision/latest?cb=20200405205447',
  tailwind:
    'https://static.wikia.nocookie.net/valorant/images/b/bc/Tailwind.png/revision/latest?cb=20200405215218',
  thrash:
    'https://static.wikia.nocookie.net/valorant/images/f/f8/Thrash.png/revision/latest?cb=20230307075702',
  tourdeforce:
    'https://static.wikia.nocookie.net/valorant/images/e/eb/Tour_De_Force.png/revision/latest?cb=20211116151518',
  toxicscreen:
    'https://static.wikia.nocookie.net/valorant/images/c/cd/Toxic_Screen.png/revision/latest?cb=20200405224110',
  trademark:
    'https://static.wikia.nocookie.net/valorant/images/3/3b/Trademark.png/revision/latest?cb=20211116151530',
  trapwire:
    'https://static.wikia.nocookie.net/valorant/images/0/01/Trapwire.png/revision/latest?cb=20200405222341',
  turret:
    'https://static.wikia.nocookie.net/valorant/images/3/32/Turret.png/revision/latest?cb=20200804132303',
  updraft:
    'https://static.wikia.nocookie.net/valorant/images/d/dc/Updraft.png/revision/latest?cb=20200405215211',
  viperspit:
    'https://static.wikia.nocookie.net/valorant/images/c/cb/Viper%27s_Pit.png/revision/latest?cb=20200802082936',
  wingman:
    'https://static.wikia.nocookie.net/valorant/images/0/09/Wingman.png/revision/latest?cb=20230307075701',
}

export function isWeaponName(value: string | null | undefined): boolean {
  const key = normalizeAbilityKey(value)
  return !!key && WEAPON_KEYS.has(key)
}

export function isKnownAbilityName(value: string | null | undefined): boolean {
  const key = normalizeAbilityKey(value)
  return !!key && key in FANDOM_ABILITY_IMAGES
}

export function getFandomAbilityImageUrl(abilityName: string | null | undefined): string {
  const key = normalizeAbilityKey(abilityName)
  return key ? (FANDOM_ABILITY_IMAGES[key] ?? '') : ''
}

export function abilityNameForAgentSlot(
  agentName: string | null | undefined,
  slot: AbilitySlotKey
): string | null {
  if (!agentName) return null
  const agentKey = agentName.toLowerCase().replace(/[/\s]/g, '')
  return AGENT_SLOT_ABILITY[agentKey]?.[slot] ?? null
}

export function resolveAbilityDisplayName(
  agentName: string | null | undefined,
  weapon: string | null | undefined,
  abilitySlot: AbilitySlotKey | undefined
): string | null {
  if (weapon && !isWeaponName(weapon) && isKnownAbilityName(weapon)) {
    return weapon.replace(/_/g, ' ')
  }

  if (abilitySlot && agentName) {
    const fromSlot = abilityNameForAgentSlot(agentName, abilitySlot)
    if (fromSlot) return fromSlot
  }

  if (weapon === 'Ultimate' || abilitySlot === 'ultimate') return 'Ultimate'
  if (weapon === 'Ability' || abilitySlot) return 'Ability'

  return null
}
