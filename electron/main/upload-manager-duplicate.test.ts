import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', getAppPath: () => '/tmp', isPackaged: false },
}))
vi.mock('./error-reporter', () => ({ reportError: vi.fn() }))
vi.mock('electron-log', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import { UploadManager, type UploadOptions, type UploadResult } from './upload-manager'
import type { AuthManager } from './auth-manager'
import { reportPipelineError } from './pipeline-errors'
import { reportError } from './error-reporter'

const options: UploadOptions = {
  videoPath: '/tmp/duplicate-guard-match.mp4', riotName: 'Player', riotTag: 'EUW',
  game: 'valorant', map: null, agent: null, timeline: null, onProgress: () => {},
}

afterEach(() => vi.restoreAllMocks())

function uploader() {
  const manager = new UploadManager({ getToken: () => 'test' } as AuthManager)
  const internal = manager as unknown as { _doUpload: (opts: UploadOptions) => Promise<UploadResult> }
  return { manager, upload: vi.spyOn(internal, '_doUpload') }
}

describe('recording upload duplicate guard', () => {
  it('blocks a second in-flight submission without reporting an operational error', async () => {
    const { manager, upload } = uploader()
    let finish!: (value: UploadResult) => void
    upload.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
      .mockResolvedValue({ job_id: 'unexpected-duplicate-job' })
    const first = manager.upload(options)

    const duplicate = await manager.upload(options).catch((error: unknown) => error)
    expect(duplicate).toMatchObject({ failureCode: 'upload_already_in_progress' })
    expect(upload).toHaveBeenCalledTimes(1)
    reportPipelineError('upload', (duplicate as Error).message)
    expect(reportError).not.toHaveBeenCalled()

    finish({ job_id: 'first-job' })
    await expect(first).resolves.toEqual({ job_id: 'first-job' })
  })

  it('allows the same recording to be submitted again after its prior upload settled', async () => {
    const { manager, upload } = uploader()
    upload.mockResolvedValueOnce({ job_id: 'prior-job' }).mockResolvedValueOnce({ job_id: 'retry-job' })

    await expect(manager.upload(options)).resolves.toEqual({ job_id: 'prior-job' })
    // The prior analysis may subsequently fail/refund; no app restart should be needed.
    await expect(manager.upload(options)).resolves.toEqual({ job_id: 'retry-job' })
    expect(upload).toHaveBeenCalledTimes(2)
  })

  it('releases the guard after an upload failure so the saved recording can be retried', async () => {
    const { manager, upload } = uploader()
    upload.mockRejectedValueOnce(new Error('Upload failed')).mockResolvedValueOnce({ job_id: 'retry-job' })

    await expect(manager.upload(options)).rejects.toThrow('Upload failed')
    await expect(manager.upload(options)).resolves.toEqual({ job_id: 'retry-job' })
  })
})
