#!/usr/bin/env node
/**
 * Local spatial minimap calibration lab.
 * Usage: npm run spatial:calibrate
 *
 * Loads maps-manifest + zones from resources/spatial, proxies UpForge API
 * (avoids CORS), and opens an interactive tuner in the browser.
 */
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const spatialDir = path.join(root, 'resources/spatial')
const htmlPath = path.join(root, 'scripts/spatial-calibrator/index.html')
const port = 8766
const apiBase = process.env.VITE_API_URL || 'https://api.upforge.gg'

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

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
  const pathname = decodeURIComponent(url.pathname)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    })
    res.end()
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
  const url = `http://127.0.0.1:${port}/`
  console.log(`Spatial calibrator: ${url}`)
  console.log(`API proxy → ${apiBase}`)
  try {
    execSync(`open "${url}"`, { stdio: 'inherit' })
  } catch {
    console.log('Open this URL in your browser:', url)
  }
  console.log('Press Ctrl+C to stop.')
})
