import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Guided-session runs never open the result screen, so Practice itself says whether they were saved.
const hub = readFileSync(new URL('./TrainingHubView.vue', import.meta.url), 'utf8')
const sessionDialog = hub.slice(hub.indexOf('kicker="Session complete"'), hub.indexOf('</UfDialog>', hub.indexOf('kicker="Session complete"')))

describe('Practice: were the guided-session runs saved?', () => {
  it('listens for each run’s upload outcome from the start (before the first await)', () => {
    expect(hub).toMatch(/onMounted\(async \(\) => \{[\s\S]*?window\.api\.on\('trainer:session-synced', \(raw: unknown\) => noteRunOutcome\(raw\)\)[\s\S]*?await achievements\.load\(\)/)
  })

  it('marks each step of the summary saved, waiting or not saved', () => {
    expect(hub).toMatch(/const sessionStepSaved = computed\(\(\) => trainerRunSavedLabels\(sessionSummary\.value\?\.results \?\? \[\], runOutcomes\.value\)\)/)
    expect(sessionDialog).toMatch(/<span v-if="sessionStepSaved\[i\]"[^>]*>\{\{ sessionStepSaved\[i\]\?\.text \}\}<\/span>/)
  })

  it('the summary ends with the account’s waiting / not-saved line', () => {
    expect(hub).toMatch(/const uploadLine = computed\(\(\) => trainerUploadStatusLine\(uploadStatus\.value\)\)/)
    expect(sessionDialog).toMatch(/<p v-if="uploadLine"[^>]*role="status"[^>]*>\{\{ uploadLine\.text \}\}<\/p>/)
  })

  it('asks the main process for steps whose outcome arrived while Practice was closed, without replacing newer pushes', () => {
    expect(hub).toMatch(/function finishStructuredSession\(\) \{[\s\S]*?for \(const r of results\) \{\s*void window\.api\.trainer\.getSyncStatus\?\.\(r\.scenario, r\.completed_at\)\.then\(o => noteRunOutcome\(o, true\)\)/)
    expect(hub).toMatch(/if \(!o \|\| \(ifUnknown && runOutcomes\.value\[o\.key\]\)\) return/)
  })

  it('shows one line on Practice while runs wait to upload or could not be saved, with Retry for those', () => {
    expect(hub).toMatch(/useTrainerUploadStatus\(\)/)
    expect(hub).toMatch(/<div v-if="uploadLine" class="uf-insession uf-rise" role="status">\s*<span class="uf-t3"[^>]*>\{\{ uploadLine\.text \}\}<\/span>\s*<UfButton v-if="unsavedRuns\.length"[^>]*@click="retryUnsaved">/)
  })
})
