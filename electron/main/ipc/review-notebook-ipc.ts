import type { IpcMain } from 'electron'
import type { AuthManager } from '../auth-manager'

export function setupReviewNotebookHandlers(ipc: IpcMain, auth: AuthManager) {
  const personalRequest = async (method: 'get' | 'put', body: unknown) => {
    const token = auth.getToken(), owner = auth.getUser()?.id
    if (!token || !owner) return { ok: false, error: 'Sign in to use personal notes.' }
    try {
      const response = method === 'get' ? await auth.getApi().get('/api/personal-review', { params: body }) : await auth.getApi().put('/api/personal-review', body)
      if (auth.getToken() !== token || auth.getUser()?.id !== owner) return { ok: false, error: 'Your account changed. Reopen personal notes.' }
      return { ok: true, data: response.data }
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status
      return { ok: false, error: status === 409 ? 'Notes changed on another device. Copy your draft before reloading.' : status === 422 ? 'This review cannot be saved. Check note length and timestamps.' : 'Personal notes are unavailable. Your draft has not been confirmed saved.' }
    }
  }
  ipc.handle('personal-review:get', (_event, source: unknown) => personalRequest('get', { source }))
  ipc.handle('personal-review:save', (_event, document: unknown) => personalRequest('put', document))
  ipc.handle('account:usage', async () => {
    const token = auth.getToken(), owner = auth.getUser()?.id
    if (!token || !owner) return { ok: false, error: 'Sign in to view usage.' }
    try {
      const result = await auth.getApi().get('/api/account/usage')
      if (auth.getToken() !== token || auth.getUser()?.id !== owner) return { ok: false, error: 'Your account changed. Reload usage.' }
      return { ok: true, data: result.data }
    } catch { return { ok: false, error: 'Usage is unavailable on this server. Try again later.' } }
  })
  const request = async (method: 'get' | 'put' | 'delete', id?: string, document?: unknown) => {
    const token = auth.getToken()
    const owner = auth.getUser()?.id
    if (!token || !owner) return { ok: false, error: 'Sign in to open your notebook.' }
    try {
      if (method !== 'get' && (!id || !/^[0-9a-f-]{36}$/i.test(id))) return { ok: false, error: 'Invalid comparison.' }
      const result = method === 'get'
        ? await auth.getApi().get('/api/review-notebook')
        : method === 'delete' ? await auth.getApi().delete(`/api/review-notebook/${id}`, { data: document })
        : await auth.getApi().put(`/api/review-notebook/${id}`, document)
      if (auth.getToken() !== token || auth.getUser()?.id !== owner) return { ok: false, error: 'Your account changed. Reopen your notebook.' }
      return { ok: true, data: result.data }
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status
      const error = method === 'delete' && status === 404 ? 'This comparison is unavailable. Refresh the notebook list.'
        : method === 'delete' && status !== 409 ? 'Deletion could not be verified. Refresh the list before retrying.'
        : status === 403 ? 'Saving comparisons requires Plus or Pro. Your existing notes remain readable.'
        : status === 409 ? 'This comparison changed on another device. Reopen it before changing it.'
        : status === 404 ? 'Account notebook is unavailable on this server. Your draft has not been saved.'
        : status === 422 ? 'This notebook entry cannot be saved. Check its size and comparison settings.'
        : 'Could not reach your notebook. Your draft is still open; try again.'
      return { ok: false, error }
    }
  }
  const coachRequest = async (method: 'get' | 'post', id: number, body?: unknown) => {
    const token = auth.getToken(), owner = auth.getUser()?.id
    if (!token || !owner || !Number.isInteger(id) || id < 1) return { ok: false, error: 'Open a signed-in analysis to ask your coach.' }
    try {
      const path = `/api/analyses/${id}/chat/workspace`
      const response = method === 'get' ? await auth.getApi().get(path) : await auth.getApi().post(path, body)
      if (auth.getToken() !== token || auth.getUser()?.id !== owner) return { ok: false, error: 'Your account changed. Reopen the coach.' }
      return { ok: true, data: response.data }
    } catch (err) {
      const response = (err as { response?: { status?: number; data?: { message?: string } } }).response
      const status = response?.status
      return { ok: false, error: status === 404 ? 'Workspace coach is not available on this server yet.'
        : [403, 409, 422, 429].includes(status ?? 0) ? response?.data?.message ?? 'This question cannot be sent.'
        : 'Coach unavailable. Your question is still here; retry to check its status.' }
    }
  }
  ipc.handle('workspace-coach:history', (_event, id: number) => coachRequest('get', id))
  ipc.handle('workspace-coach:ask', (_event, id: number, body: unknown) => coachRequest('post', id, body))
  ipc.handle('account:report-checkout', async () => {
    const token = auth.getToken(), owner = auth.getUser()?.id
    if (!token || !owner) return { ok: false, error: 'Sign in to buy report credits.' }
    try {
      const result = await auth.getApi().post('/api/payment/bundle-checkout', { bundle: '3-pack' })
      if (auth.getToken() !== token || auth.getUser()?.id !== owner) return { ok: false, error: 'Your account changed.' }
      const url = new URL(result.data.checkout_url)
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Invalid checkout destination')
      return { ok: true, data: { checkout_url: url.toString() } }
    } catch { return { ok: false, error: 'Could not open checkout. Check your balance before retrying.' } }
  })
  ipc.handle('workspace-coach:credits', async (_event, pack: string) => {
    if (!['starter', 'value', 'power'].includes(pack) || !auth.getToken()) return { ok: false, error: 'Choose a credit pack while signed in.' }
    const token = auth.getToken()
    try {
      const result = await auth.getApi().post('/api/payment/chat-credit-checkout', { pack })
      if (auth.getToken() !== token) return { ok: false, error: 'Your account changed.' }
      return { ok: true, data: result.data }
    } catch { return { ok: false, error: 'Checkout unavailable. No credits have been purchased.' } }
  })
  ipc.handle('review-notebook:remove', (_event, id: string, revision: number) => request('delete', id, { revision }))
  ipc.handle('review-notebook:list', () => request('get'))
  ipc.handle('review-notebook:save', (_event, id: string, document: unknown) => request('put', id, document))
}
