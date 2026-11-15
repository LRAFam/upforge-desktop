import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// One AI-training setting (account, server-side), replacing the local "Help improve UpForge AI" opt-in.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const appPane = read('./SettingsAppPane.vue')
const accountPane = read('./SettingsAccountPane.vue')
const composable = read('../../composables/useSettings.ts')
const uploads = read('../../../electron/main/upload-manager.ts')
const settingsManager = read('../../../electron/main/settings-manager.ts')

describe('AI-training toggle', () => {
  it('both panes show the new label and use the server value, never the old local flag', () => {
    for (const src of [appPane, accountPane]) {
      expect(src).toContain("Use my gameplay to improve UpForge's AI")
      expect(src).toContain(':on="aiTrainingOn === true"')
      expect(src).toContain(':disabled="aiTrainingOn === null || aiTrainingBusy"')
      expect(src).not.toContain('Help improve UpForge AI')
      expect(src).not.toContain('trainingConsent')
    }
  })

  it('the composable reads and writes through the aiTraining IPC and reverts a failed save', () => {
    expect(composable).toContain('window.api.aiTraining.get()')
    expect(composable).toContain('window.api.aiTraining.set(!next)')
    expect(composable).toMatch(/catch \{\s*aiTrainingOn\.value = before/)
    expect(composable).not.toContain('trainingConsent')
  })

  it('the old local opt-in is gone from settings and archive uploads', () => {
    expect(settingsManager).not.toContain('trainingConsent')
    expect(uploads).not.toContain('training_consent')
  })
})
