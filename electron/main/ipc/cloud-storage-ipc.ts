import { cloudClipReview } from '../../../src/lib/cloud-clip-review'
import { shell, type IpcMain } from 'electron'
import { validStorageRequest, validStorageSnapshot, type StorageAddonRequest } from '../../../src/lib/storage-addon'
import type { AuthManager } from '../auth-manager'
import { cloudGames, type CloudQuery } from '../../../src/lib/cloud-storage'
export function setupCloudStorageHandlers(ipc: IpcMain, auth: AuthManager, removed?: (file: { kind: string; id: string }) => void) {
  async function playback(file: { kind: string; id: string }) {
    if (!file || typeof file.id !== 'string' || !(file.kind === 'clip' ? /^[1-9]\d*$/.test(file.id) : file.kind === 'recording' && /^[0-9a-f-]{36}$/i.test(file.id))) return { ok: false, error: 'Choose a valid cloud file.' }
    const token = auth.getToken(), owner = auth.getUser()?.id
    if (!token || !owner) return { ok: false, error: 'Sign in to watch cloud files.' }
    try {
      const response = await auth.getApi().get(file.kind === 'clip' ? `/api/clips/${file.id}/video` : `/api/recordings/archive/${file.id}/playback`)
      if (auth.getToken() !== token || auth.getUser()?.id !== owner) return { ok: false, error: 'Your account changed. Reopen the file.' }
      const url = file.kind === 'clip' ? response.data.video_url : response.data.playback_url
      if (typeof url !== 'string' || new URL(url).protocol !== 'https:') throw new Error('Invalid playback URL')
      return { ok: true, url }
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status
      return { ok: false, error: status === 410 ? 'Cloud retention has ended for this recording. Use your local copy if you still have it. Upgrading does not restore expired footage.' : status === 404 ? 'This cloud file is no longer available.' : 'Could not reach this cloud file. Please retry.' }
    }
  }
  ipc.handle('cloud-storage:playback', async (_event, file) => playback(file))
  ipc.handle('cloud-storage:download', async (event, file) => {
    const result = await playback(file)
    if (!result.ok || !result.url) return result
    event.sender.downloadURL(result.url)
    return { ok: true }
  })
  ipc.handle('storage-addon:request', async (_event, request: StorageAddonRequest) => {
    if (!validStorageRequest(request)) return { ok: false, error: 'Choose a valid storage action.' }
    const token = auth.getToken(), owner = auth.getUser()?.id
    if (!token || !owner) return { ok: false, error: 'Sign in to manage storage.' }
    try {
      const api = auth.getApi()
      const { action, ...body } = request
      const response = action === 'show' ? await api.get('/api/account/storage-addon') : await api.post(`/api/account/storage-addon/${action}`, body)
      if (auth.getToken() !== token || auth.getUser()?.id !== owner) return { ok: false, error: 'Your account changed. Reopen storage.' }
      if (['show', 'sync'].includes(action) && !validStorageSnapshot(response.data)) return { ok: false, error: 'Storage allowance could not be verified.' }
      if (request.action === 'remove') removed?.(request)
      const url = action === 'checkout' ? response.data.checkout_url : (action === 'change' || action === 'payment') ? response.data.payment_url : null
      if (['checkout', 'change', 'payment'].includes(action) && !url) throw new Error('Missing checkout address')
      if (url) {
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:' || !['checkout.stripe.com','billing.stripe.com','invoice.stripe.com'].includes(parsed.hostname) || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) throw new Error('Invalid checkout address')
        await shell.openExternal(url)
      }
      return { ok: true, data: ['show', 'sync'].includes(action) ? response.data : null }
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: { message?: string; errors?: Record<string,string[]> } } }).response
      const detail = response?.status === 422 ? Object.values(response.data?.errors ?? {}).flat()[0] : null
      return { ok: false, unavailable: response?.status === 404 && request.action === 'show', error: detail || (response?.status === 404 && request.action === 'show' ? 'Extra storage purchases are not available on the server yet. Your current plan storage is unchanged.' : 'Storage could not be updated. Please try again shortly.') }
    }
  })
  ipc.handle('cloud-clip:review', async (_event, id: number, analyse = false) => {
    if (!Number.isSafeInteger(id) || id < 1 || typeof analyse !== 'boolean') return { ok: false, error: 'Choose a valid clip.' }
    const token = auth.getToken(), owner = auth.getUser()?.id
    if (!token || !owner) return { ok: false, error: 'Sign in to review clips.' }
    try {
      const api = auth.getApi()
      if (analyse) await api.post(`/api/clips/${id}/analyse`, {})
      if (auth.getToken() !== token || auth.getUser()?.id !== owner) return { ok: false, error: 'Your account changed. Reopen the clip.' }
      const response = await api.get(`/api/clips/${id}/review`)
      if (auth.getToken() !== token || auth.getUser()?.id !== owner) return { ok: false, error: 'Your account changed. Reopen the clip.' }
      return { ok: true, data: cloudClipReview(response.data) }
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: { message?: string } } }).response
      console.warn('[CloudClipReview]', response ? `HTTP ${response.status}` : error instanceof Error ? error.message : 'Unknown failure')
      return { ok: false, needsUpgrade: response?.status === 402, error: response?.status === 402 ? response.data?.message || 'Your clip coaching allowance is exhausted.' : response?.status === 410 ? 'This cloud clip is no longer available.' : 'Clip review could not be loaded. Please retry.' }
    }
  })
  ipc.handle('cloud-storage:list', async (_event, query: CloudQuery) => {
    if (!query || (query.game !== undefined && !cloudGames.some(game => game.value === query.game)) || !['all', 'clip', 'recording'].includes(query.kind) || !['newest', 'largest', 'expiry'].includes(query.sort) || !Number.isInteger(query.page) || query.page < 1 || query.page > 100000) return { ok: false, error: 'Choose a valid storage filter.' }
    const token = auth.getToken(), owner = auth.getUser()?.id
    if (!token || !owner) return { ok: false, error: 'Sign in to view cloud storage.' }
    try {
      const response = await auth.getApi().get('/api/account/cloud-storage', { params: query })
      if (auth.getToken() !== token || auth.getUser()?.id !== owner) return { ok: false, error: 'Your account changed. Reload cloud storage.' }
      return { ok: true, data: response.data }
    } catch { return { ok: false, error: 'Cloud library is unavailable. Please try again later.' } }
  })
}
