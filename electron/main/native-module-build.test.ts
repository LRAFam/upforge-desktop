/**
 * Build pipeline guard for native modules. Credentials use Electron safeStorage (auth-manager.ts),
 * not keytar. Native production deps are rebuilt for the Electron ABI by electron-builder's own
 * rebuild step (npmRebuild, on by default) — the release workflow must not target modules the app
 * does not ship.
 */
import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  build?: { npmRebuild?: boolean }
}
const workflowsDir = path.join(root, '.github', 'workflows')
const workflows = fs.readdirSync(workflowsDir)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .map((f) => ({ file: f, text: fs.readFileSync(path.join(workflowsDir, f), 'utf-8') }))

const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }

describe('native module build pipeline', () => {
  it('does not depend on keytar (tokens use Electron safeStorage)', () => {
    expect(allDeps).not.toHaveProperty('keytar')
    const auth = fs.readFileSync(path.join(root, 'electron/main/auth-manager.ts'), 'utf-8')
    expect(auth).toContain('safeStorage')
  })

  it('every workflow rebuild targets a module the app actually depends on', () => {
    for (const { file, text } of workflows) {
      for (const m of text.matchAll(/(?:electron-rebuild|@electron\/rebuild)[^\n]*?(?:-w|--which-module|--only)\s+([\w@/.,-]+)/g)) {
        for (const mod of m[1].split(',')) {
          expect(allDeps, `${file} rebuilds "${mod}" but it is not a dependency`).toHaveProperty(mod)
        }
      }
    }
  })

  it('does not use the deprecated electron-rebuild package (electron-builder rebuilds natives)', () => {
    expect(allDeps).not.toHaveProperty('electron-rebuild')
    for (const { file, text } of workflows) {
      expect(text, `${file} still calls electron-rebuild`).not.toMatch(/npx electron-rebuild/)
    }
  })

  it('keeps electron-builder rebuilding native production deps for the Electron ABI', () => {
    expect(pkg.build?.npmRebuild).not.toBe(false)
  })
})
