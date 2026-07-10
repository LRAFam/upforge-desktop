#!/usr/bin/env node
/**
 * Bundle official CS2 HUD icons (Valve game files via Juknum/counter-strike-icons).
 * Run: node scripts/fetch-cs2-round-icons.mjs
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'src/assets/round-icons/cs2')
const base = 'https://raw.githubusercontent.com/Juknum/counter-strike-icons/main/cs2/panorama/images'

const icons = {
  kill: 'icons/ui/kill.svg',
  death: 'hud/radar/mapoverview/icon-death.svg',
  bombPlant: 'icons/ui/bomb_icon.svg',
  bombDefuse: 'icons/equipment/defuser.svg',
  bombExplode: 'icons/equipment/firebomb.svg',
  eliminationWin: 'icons/ui/elimination.svg',
  eliminationLoss: 'icons/ui/map_death.svg',
  defuseWin: 'icons/ui/map_defuse.svg',
  defuseLoss: 'icons/ui/map_defused_dropped.svg',
  timeWin: 'icons/ui/clock.svg',
  timeLoss: 'icons/ui/time_exp.svg',
  bombWin: 'icons/equipment/planted_c4.svg',
  bombLoss: 'icons/equipment/c4.svg',
}

function curl(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  execSync(`curl -sfL "${url}" -o "${dest}"`, { stdio: 'inherit' })
}

fs.mkdirSync(outDir, { recursive: true })
for (const [name, rel] of Object.entries(icons)) {
  const dest = path.join(outDir, `${name}.svg`)
  console.log(`[cs2-icons] ${name}`)
  curl(`${base}/${rel}`, dest)
}
console.log('[cs2-icons] Done.')
