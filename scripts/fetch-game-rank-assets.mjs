#!/usr/bin/env node
/**
 * Refresh bundled CS2 / FACEIT / Deadlock rank artwork under src/assets/ranks/.
 * Run after rank art changes upstream: node scripts/fetch-game-rank-assets.mjs
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cs2Dir = path.join(root, 'src/assets/ranks/cs2')
const faceitDir = path.join(root, 'src/assets/ranks/faceit')
const deadlockDir = path.join(root, 'src/assets/ranks/deadlock')
const faceitZip = path.join(root, 'scripts/.cache/faceit-levels.zip')
const faceitXp = path.join(root, 'scripts/.cache/faceit-xp')

function curl(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  execSync(`curl -sfL "${url}" -o "${dest}"`, { stdio: 'inherit' })
}

function ensureFaceitXpIcons() {
  const xpIcon = (lvl) => path.join(faceitXp, `level500${lvl}.png`)
  if (fs.existsSync(xpIcon(1))) return
  fs.mkdirSync(path.dirname(faceitZip), { recursive: true })
  curl(
    'https://github.com/Sarrus1/FaceitLevels-for-kento-RankMe/releases/download/v1.2.0/FaceitLevels-for-kento-RankMe-1.2.0.zip',
    faceitZip,
  )
  fs.mkdirSync(faceitXp, { recursive: true })
  execSync(`unzip -qo "${faceitZip}" "materials/panorama/images/icons/xp/*" -d "${path.dirname(faceitXp)}"`)
}

console.log('[ranks] CS2 skill groups 0–18…')
fs.mkdirSync(cs2Dir, { recursive: true })
for (let id = 0; id <= 18; id++) {
  curl(`https://static.csgostats.gg/images/ranks/${id}.png`, path.join(cs2Dir, `${id}.png`))
}

console.log('[ranks] FACEIT levels 1–10…')
ensureFaceitXpIcons()
fs.mkdirSync(faceitDir, { recursive: true })
for (let lvl = 1; lvl <= 9; lvl++) {
  fs.copyFileSync(path.join(faceitXp, `level500${lvl}.png`), path.join(faceitDir, `${lvl}.png`))
}
fs.copyFileSync(path.join(faceitXp, 'level5010.png'), path.join(faceitDir, '10.png'))

console.log('[ranks] Deadlock rank badges…')
// Names live in src/lib/deadlock.ts (DEADLOCK_TIERS): update them when this ladder changes.
// Shrunk with ImageMagick + cwebp (sub badges 200 px wide, tier badges 256 px) to keep the bundle small.
fs.mkdirSync(deadlockDir, { recursive: true })
const ranks = JSON.parse(execSync('curl -sfL https://api.deadlock-api.com/v1/assets/ranks', { encoding: 'utf8' }))
console.log('[ranks] Deadlock ladder:', ranks.map(r => `${r.tier} ${r.name}`).join(', '))
const tmp = path.join(root, 'scripts/.cache/deadlock-ranks')
fs.mkdirSync(tmp, { recursive: true })
function shrinkWebp(url, dest, resize) {
  const raw = path.join(tmp, 'raw')
  const png = path.join(tmp, 'resized.png')
  curl(url, raw)
  execSync(`magick "${raw}" -resize ${resize} "${png}"`)
  execSync(`cwebp -quiet -q 85 -alpha_q 90 "${png}" -o "${dest}"`)
}
for (const rank of ranks) {
  const { tier, images } = rank
  if (tier === 0) {
    curl(images.small, path.join(tmp, 'rank0.png'))
    execSync(`magick "${path.join(tmp, 'rank0.png')}" -resize 150x "${path.join(deadlockDir, 'rank0-sm.png')}"`)
    continue
  }
  shrinkWebp(images.large_webp ?? images.large, path.join(deadlockDir, `rank${tier}-lg.webp`), '256x256')
  for (let sub = 1; sub <= 6; sub++) {
    const url = images[`small_subrank${sub}_webp`] ?? images[`small_subrank${sub}`]
    if (url) shrinkWebp(url, path.join(deadlockDir, `rank${tier}-sub${sub}.webp`), '200x')
  }
}

console.log('[ranks] Done.')
