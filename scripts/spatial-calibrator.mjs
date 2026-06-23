#!/usr/bin/env node
/**
 * Local spatial minimap calibration lab.
 *
 * Usage:
 *   npm run spatial:calibrate
 *   npm run spatial:calibrate -- --analysis 12345
 *   npm run spatial:calibrate -- --analysis 12345 --map fracture
 *   SPATIAL_ANALYSIS_ID=12345 npm run spatial:calibrate
 *
 * Opens http://127.0.0.1:8766 — tune displayBounds/transform/rotation, then
 * "Save to manifest" (writes resources/spatial/maps-manifest.json).
 */
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const spatialDir = path.join(root, 'resources/spatial')
const manifestPath = path.join(spatialDir, 'maps-manifest.json')
const htmlPath = path.join(root, 'scripts/spatial-calibrator/index.html')
const port = 8766
const apiBase = process.env.VITE_API_URL || 'https://api.upforge.gg'

function parseArgv(argv) {
  let analysisId = process.env.SPATIAL_ANALYSIS_ID || null
  let map = process.env.SPATIAL_MAP || null
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--analysis' && argv[i + 1]) analysisId = argv[++i]
    else if (arg === '--map' && argv[i + 1]) map = argv[++i]
    else if (/^\d+$/.test(arg) && !analysisId) analysisId = arg
  }
  return { analysisId, map }
}

const startup = parseArgv(process.argv.slice(2))

function mapKey(name) {
  return (name || '').trim().toLowerCase().replace(/\s+/g, '')
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.js': 'text/javascript; charset=utf-8',
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(body))
}

function proxyApi(req, res, targetPath) {
  const auth = req.headers.authorization
  if (!auth) {
    sendJson(res, 401, { error: 'Missing Authorization header (Bearer token)' })
    return
  }

  const url = new URL(targetPath, apiBase)
  const lib = url.protocol === 'https:' ? https : http
  const proxyReq = lib.request(
    {
      method: req.method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers: {
        Authorization: auth,
        Accept: 'application/json',
      },
    },
    (proxyRes) => {
      const chunks = []
      proxyRes.on('data', (c) => chunks.push(c))
      proxyRes.on('end', () => {
        res.writeHead(proxyRes.statusCode ?? 500, {
          'Content-Type': proxyRes.headers['content-type'] ?? 'application/json',
          'Access-Control-Allow-Origin': '*',
        })
        res.end(Buffer.concat(chunks))
      })
    },
  )
  proxyReq.on('error', (err) => sendJson(res, 502, { error: err.message }))
  proxyReq.end()
}

function staticFile(filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return null
  return filePath
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function applyManifestPatch(mapName, patch) {
  const key = mapKey(mapName)
  if (!key) throw new Error('map name required')
  const manifest = readJson(manifestPath)
  const idx = manifest.findIndex((m) => mapKey(m.displayName) === key)
  if (idx < 0) throw new Error(`Map not found in manifest: ${mapName}`)

  const entry = manifest[idx]
  if (patch.displayBounds) entry.displayBounds = patch.displayBounds
  if (patch.displayTransform) {
    if (patch.displayTransform === 'identity') delete entry.displayTransform
    else entry.displayTransform = patch.displayTransform
  }
  if (patch.displayRotation != null) {
    if (patch.displayRotation === 0) delete entry.displayRotation
    else entry.displayRotation = patch.displayRotation
  }
  for (const key of ['displayCoordScale', 'displayOffsetX', 'displayOffsetY']) {
    if (patch[key] == null || patch[key] === 0 || (key === 'displayCoordScale' && patch[key] === 1)) {
      delete entry[key]
    } else {
      entry[key] = patch[key]
    }
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return entry.displayName
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
  const pathname = decodeURIComponent(url.pathname)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    })
    res.end()
    return
  }

  if (pathname === '/startup.json' && req.method === 'GET') {
    sendJson(res, 200, { analysisId: startup.analysisId, map: startup.map, apiBase })
    return
  }

  if (pathname === '/manifest/apply' && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const saved = applyManifestPatch(body.map, body.patch)
      sendJson(res, 200, { ok: true, map: saved, path: manifestPath.replace(root, '.') })
    } catch (err) {
      sendJson(res, 400, { error: err.message })
    }
    return
  }

  if (pathname.startsWith('/proxy/api/')) {
    proxyApi(req, res, pathname.replace('/proxy', ''))
    return
  }

  if (pathname === '/manifest.json') {
    const file = staticFile(path.join(spatialDir, 'maps-manifest.json'))
    if (!file) {
      res.writeHead(404)
      res.end('manifest missing')
      return
    }
    res.writeHead(200, { 'Content-Type': mime['.json'] })
    fs.createReadStream(file).pipe(res)
    return
  }

  if (pathname.startsWith('/zones/')) {
    const name = pathname.replace('/zones/', '')
    if (!/^[a-z]+\.json$/i.test(name)) {
      res.writeHead(400)
      res.end('bad zone name')
      return
    }
    const file = staticFile(path.join(spatialDir, 'zones', name))
    if (!file) {
      res.writeHead(404)
      res.end('zone missing')
      return
    }
    res.writeHead(200, { 'Content-Type': mime['.json'] })
    fs.createReadStream(file).pipe(res)
    return
  }

  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': mime['.html'] })
    fs.createReadStream(htmlPath).pipe(res)
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

server.listen(port, '127.0.0.1', () => {
  const qs = new URLSearchParams()
  if (startup.analysisId) qs.set('analysis', startup.analysisId)
  if (startup.map) qs.set('map', startup.map)
  if (startup.analysisId) qs.set('autoload', '1')
  const url = `http://127.0.0.1:${port}/${qs.toString() ? `?${qs}` : ''}`
  console.log(`Spatial calibrator: ${url}`)
  console.log(`API proxy → ${apiBase}`)
  if (startup.analysisId) console.log(`Pre-filled analysis ID: ${startup.analysisId}`)
  console.log('Save writes → resources/spatial/maps-manifest.json')
  console.log('Then run: npm run spatial:sync')
  try {
    execSync(`open "${url}"`, { stdio: 'inherit' })
  } catch {
    console.log('Open this URL in your browser:', url)
  }
  console.log('Press Ctrl+C to stop.')
})
