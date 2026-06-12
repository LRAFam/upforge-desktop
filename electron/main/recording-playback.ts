import { AuthManager } from './auth-manager'

/** Fetch a fresh presigned S3 URL for an analysed desktop recording. */
export async function fetchRecordingPlaybackUrl(
  auth: AuthManager,
  analysisId: number,
): Promise<string | null> {
  try {
    const api = auth.getApi()
    if (!api) return null
    const res = await api.get(`/api/analysis/${analysisId}`)
    const analysis = res.data?.analysis
    const url = analysis?.recording_url as string | undefined
    if (url && /^https?:\/\//i.test(url)) return url
    return null
  } catch {
    return null
  }
}
