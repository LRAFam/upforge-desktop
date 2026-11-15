import { ref } from 'vue'

/** The API's 403 code when the password is right but the email link has not been clicked yet. */
export const EMAIL_UNVERIFIED = 'email_unverified'

export function isEmailUnverified(result: { ok?: boolean; code?: string } | null | undefined): boolean {
  return !!result && result.ok === false && result.code === EMAIL_UNVERIFIED
}

type ResendApi = (email: string) => Promise<{ ok: boolean; message?: string; error?: string }>

const SENT_FALLBACK = 'If that email still needs verifying, we have sent a new link. Check your inbox and spam folder, then sign in.'

/**
 * Sign-in screens: after an `email_unverified` login, offer "Resend verification email".
 * `needsVerification` drives the button; `resendNote` / `resendError` are the outcome lines.
 */
export function useVerificationResend(resendApi: () => ResendApi | undefined = () => window.api?.auth?.resendVerificationEmail) {
  const needsVerification = ref(false)
  const resending = ref(false)
  const resendNote = ref('')
  const resendError = ref('')

  /** Call with every login result (success or failure) so the offer appears and clears at the right time. */
  function noteLoginResult(result: { ok?: boolean; code?: string } | null | undefined) {
    needsVerification.value = isEmailUnverified(result)
    resendNote.value = ''
    resendError.value = ''
  }

  async function resend(email: string) {
    if (resending.value) return
    resendNote.value = ''
    resendError.value = ''
    const api = resendApi()
    if (!api) { resendError.value = 'Resend is not available in this build.'; return }
    resending.value = true
    try {
      const res = await api(email)
      if (res.ok) resendNote.value = res.message || SENT_FALLBACK
      else resendError.value = res.error || 'Could not send the email. Try again.'
    } catch {
      resendError.value = 'Could not send the email. Check your connection and try again.'
    } finally {
      resending.value = false
    }
  }

  return { needsVerification, resending, resendNote, resendError, noteLoginResult, resend }
}
