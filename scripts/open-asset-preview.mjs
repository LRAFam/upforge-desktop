#!/usr/bin/env node
/**
 * Generates a local HTML gallery of bundled assets and opens it in the browser.
 * Usage: node scripts/open-asset-preview.mjs
 */

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const assetsRoot = path.join(root, 'src/assets')
const port = 8765

const CS2_RANKS = {
  0: 'Unranked',
  1: 'Silver I', 2: 'Silver II', 3: 'Silver III', 4: 'Silver IV', 5: 'Silver Elite', 6: 'Silver Elite Master',
  7: 'Gold Nova I', 8: 'Gold Nova II', 9: 'Gold Nova III', 10: 'Gold Nova Master',
  11: 'Master Guardian I', 12: 'Master Guardian II', 13: 'Master Guardian Elite', 14: 'DMG',
  15: 'Legendary Eagle', 16: 'LEM', 17: 'SMFC', 18: 'Global Elite',
}

const DEADLOCK_RANKS = [
  'Obscurus', 'Initiate', 'Seeker', 'Alchemist', 'Arcanist', 'Ritualist',
  'Emissary', 'Archon', 'Oracle', 'Phantom', 'Ascendant', 'Eternus',
]

function exists(rel) {
  return fs.existsSync(path.join(assetsRoot, rel))
}

function imgCard(src, label, sub = '') {
  const missing = !exists(src)
  return `
    <figure class="card${missing ? ' missing' : ''}">
      <div class="thumb">${missing ? '?' : `<img src="/${src}" alt="${label}" loading="lazy" />`}</div>
      <figcaption>
        <strong>${label}</strong>
        ${sub ? `<span>${sub}</span>` : ''}
        <code>${src}</code>
      </figcaption>
    </figure>`
}

function section(title, desc, cards) {
  return `
    <section>
      <header>
        <h2>${title}</h2>
        <p>${desc}</p>
      </header>
      <div class="grid">${cards.join('')}</div>
    </section>`
}

const gameCards = ['games/valorant.jpg', 'games/cs2.jpg', 'games/deadlock.jpg'].map((src) => {
  const name = src.split('/')[1].replace('.jpg', '')
  return imgCard(src, name.charAt(0).toUpperCase() + name.slice(1), 'Primary game card')
})

const cs2Cards = Object.entries(CS2_RANKS).map(([id, label]) =>
  imgCard(`ranks/cs2/${id}.png`, label, `ID ${id}`),
)

const faceitCards = Array.from({ length: 10 }, (_, i) => {
  const lvl = i + 1
  return imgCard(`ranks/faceit/${lvl}.png`, `Level ${lvl}`, 'FACEIT')
})

const deadlockCards = []
deadlockCards.push(imgCard('ranks/deadlock/rank0-sm.png', 'Obscurus', 'Base (tier 0)'))
for (let tier = 1; tier <= 11; tier++) {
  const name = DEADLOCK_RANKS[tier] ?? `Tier ${tier}`
  deadlockCards.push(imgCard(`ranks/deadlock/rank${tier}-lg.png`, name, 'Base rank'))
  for (let sub = 1; sub <= 6; sub++) {
    deadlockCards.push(imgCard(
      `ranks/deadlock/rank${tier}-sub${sub}.png`,
      `${name} · ${sub}`,
      `Subtier ${sub}`,
    ))
  }
}

const badgeDir = path.join(assetsRoot, 'ranks/badges')
const badgeCards = fs.existsSync(badgeDir)
  ? fs.readdirSync(badgeDir).filter((f) => f.endsWith('.png')).sort().map((f) =>
      imgCard(`ranks/badges/${f}`, f.replace('.png', '').replace(/-/g, ' '), 'Profile badge'),
    )
  : []

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>UpForge Desktop — Asset Preview</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      line-height: 1.4;
    }
    .hero {
      padding: 2rem 2rem 1rem;
      border-bottom: 1px solid rgba(255,255,255,.08);
      background: linear-gradient(135deg, rgba(239,68,68,.12), rgba(20,184,166,.08));
    }
    .hero h1 { margin: 0 0 .35rem; font-size: 1.5rem; }
    .hero p { margin: 0; color: #9ca3af; font-size: .9rem; max-width: 52rem; }
    .stats {
      display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1rem;
    }
    .stat {
      padding: .45rem .75rem; border-radius: .6rem;
      background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
      font-size: .75rem; color: #d1d5db;
    }
    section { padding: 1.5rem 2rem 2rem; }
    section header { margin-bottom: 1rem; }
    section h2 { margin: 0 0 .25rem; font-size: 1.1rem; }
    section header p { margin: 0; color: #6b7280; font-size: .85rem; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: .85rem;
    }
    .card {
      border: 1px solid rgba(255,255,255,.08);
      border-radius: .85rem;
      background: rgba(255,255,255,.03);
      overflow: hidden;
    }
    .card.missing { border-color: rgba(239,68,68,.35); background: rgba(239,68,68,.06); }
    .thumb {
      height: 88px; display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,.35); padding: .5rem;
    }
    .thumb img { max-width: 100%; max-height: 72px; object-fit: contain; }
    .card.missing .thumb { color: #f87171; font-weight: 700; font-size: 1.25rem; }
    figcaption { padding: .55rem .65rem .7rem; }
    figcaption strong {
      display: block; font-size: .72rem; color: #f3f4f6; line-height: 1.25;
    }
    figcaption span {
      display: block; font-size: .65rem; color: #9ca3af; margin-top: .15rem;
    }
    figcaption code {
      display: block; margin-top: .35rem; font-size: .58rem; color: #6b7280;
      word-break: break-all;
    }
    .games .thumb { height: 110px; }
    .games .thumb img { max-height: 96px; width: 100%; object-fit: cover; border-radius: .35rem; }
  </style>
</head>
<body>
  <div class="hero">
    <h1>UpForge Desktop — bundled imagery preview</h1>
    <p>Review before release. These files live under <code>src/assets/</code> and are bundled by Vite (no external CDN). Red cards mean a file is missing on disk.</p>
    <div class="stats">
      <div class="stat">${gameCards.length} game cards</div>
      <div class="stat">${cs2Cards.length} CS2 ranks</div>
      <div class="stat">${faceitCards.length} FACEIT levels</div>
      <div class="stat">${deadlockCards.length} Deadlock badges</div>
      <div class="stat">${badgeCards.length} profile badges</div>
    </div>
  </div>
  ${section('Game cards', 'Login, welcome, and onboarding artwork.', gameCards).replace('class="grid"', 'class="grid games"')}
  ${section('CS2 skill groups', 'Valve rank icons (csgostats.gg source, stored locally).', cs2Cards)}
  ${section('FACEIT levels', 'Levels 1–10 (community plugin source; official FACEIT CDN blocked in Electron).', faceitCards)}
  ${section('Deadlock ranks', 'Base + subtier badges from deadlock-api asset metadata.', deadlockCards)}
  ${badgeCards.length ? section('Valorant profile badges', 'Existing bundled badge art (unchanged).', badgeCards) : ''}
</body>
</html>`

const previewPath = path.join(assetsRoot, 'preview.html')
fs.writeFileSync(previewPath, html)

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.css': 'text/css',
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  const rel = urlPath === '/' ? '/preview.html' : urlPath
  const filePath = path.join(assetsRoot, rel.replace(/^\//, ''))
  if (!filePath.startsWith(assetsRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404)
    res.end('Not found')
    return
  }
  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, { 'Content-Type': mime[ext] ?? 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
})

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/preview.html`
  console.log(`Asset preview: ${url}`)
  try {
    execSync(`open "${url}"`, { stdio: 'inherit' })
  } catch {
    console.log('Open this URL in your browser:', url)
  }
  console.log('Press Ctrl+C to stop the preview server.')
})
