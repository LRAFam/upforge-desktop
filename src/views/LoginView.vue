<template>
  <main class="login-screen">
    <div class="login-panel">
    <div class="login-art" aria-hidden="true" />
    <svg class="panel-outline" viewBox="0 0 1000 760" preserveAspectRatio="none" aria-hidden="true">
      <path d="M104 2H852L998 132V594L860 732H623L592 758H177L2 582V105Z" />
      <path class="edge-accent" d="M104 2L2 105V216 M2 456V582L177 758 M998 492V594L860 732" />
    </svg>
    <div class="window-actions">
      <button type="button" aria-label="Minimize UpForge" @click="windowMinimize">−</button>
      <button type="button" aria-label="Close UpForge" @click="windowClose">×</button>
    </div>
    <div class="login-content">
      <header class="form-head">
        <img src="../assets/upforge-logo.webp" class="brand" alt="UpForge" width="1201" height="400" />
        <h1>Back to your game.</h1>
        <p>Your footage. Your progress. Your next step.</p>
      </header>
          <form class="form" :aria-busy="loading" :aria-describedby="error ? 'login-error' : undefined" @submit.prevent="handleLogin">
            <div class="field">
              <label for="login-email">Email</label>
              <div class="iw">
                <svg class="fi" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
                <input id="login-email" v-model="email" type="email" placeholder="you@domain.com" autocomplete="email" autocapitalize="none" spellcheck="false" :disabled="loading" required />
              </div>
            </div>

            <div class="field">
              <div class="field-row">
                <label for="login-password">Password</label>
                <button type="button" class="link-forgot" @click="openForgot">Forgot password?</button>
              </div>
              <div class="iw">
                <svg class="fi" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input id="login-password" v-model="password" :type="showPw ? 'text' : 'password'" placeholder="Enter your password" autocomplete="current-password" :disabled="loading" required />
                <button type="button" class="eye" :aria-label="showPw ? 'Hide password' : 'Show password'" @click="showPw = !showPw">
                  <svg v-if="!showPw" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                </button>
              </div>
            </div>

            <Transition name="err">
              <div v-if="error" id="login-error" class="error" role="alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {{ error }}
              </div>
            </Transition>

            <button type="submit" class="btn-primary" :disabled="loading">
              <span v-if="loading" class="login-spinner" aria-hidden="true" />
              {{ loading ? 'Signing in…' : 'Sign in' }}<span v-if="!loading" aria-hidden="true">→</span>
            </button>
          </form>


      <div class="signup-row"><span>New to UpForge?</span><button type="button" class="link-accent" @click="openSignup">Create account <span aria-hidden="true">↗</span></button></div>
      <footer class="login-footer">
        <p class="signature"><span />Record · Review · Improve<span /></p>
        <nav aria-label="Support and privacy"><button type="button" @click="openHelp">Help</button><span aria-hidden="true">/</span><button type="button" @click="openPrivacy">Privacy</button></nav>
      </footer>
    </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { resolvePostAuthRoute } from '../lib/onboarding-gate'

const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const showPw = ref(false)



async function handleLogin() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const result = await window.api.auth.login(email.value, password.value)
    if (result.ok) {
      const [s, campaign] = await Promise.all([
        window.api.settings.get(),
        window.api.auth.getOnboardingCampaign(),
      ])
      if (!campaign.ok) {
        // The campaign is a rollout gate; an API outage must not lock users out of the paid app.
        console.warn('[Onboarding] Campaign gate unavailable after login:', campaign.error)
      }
      router.push(resolvePostAuthRoute(s, campaign.ok && campaign.requires_onboarding))
    } else {
      error.value = (result as { error?: string }).error || 'Invalid email or password.'
    }
  } catch (e) {
    error.value = `Error: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

function windowMinimize() { window.api.window.minimize() }
function windowClose() { window.api.window.close() }

function openHelp() { window.open('https://upforge.gg/help', '_blank') }
function openPrivacy() { window.open('https://upforge.gg/privacy', '_blank') }
function openSignup() { window.open('https://upforge.gg/register', '_blank') }
function openForgot() { window.open('https://upforge.gg/forgot-password', '_blank') }
</script>

<style scoped>
.login-screen{position:relative;isolation:isolate;width:100%;height:100%;min-height:0;overflow:auto;display:flex;background:transparent;padding:12px;color:#f4f5f6;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-app-region:drag}
.login-screen *{box-sizing:border-box}
.login-panel{position:relative;isolation:isolate;display:flex;width:100%;min-height:100%;margin:auto;flex-shrink:0;clip-path:polygon(10.4% 0,85.2% 0,100% 17.4%,100% 78.2%,86% 96.4%,62.3% 96.4%,59.2% 100%,17.7% 100%,0 76.6%,0 13.8%);background:#0b0e10}
.panel-outline{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;fill:none;stroke:#68747b;stroke-opacity:.5;stroke-width:1;vector-effect:non-scaling-stroke}.panel-outline path{vector-effect:non-scaling-stroke}.panel-outline .edge-accent{stroke:#ed164a;stroke-opacity:.9;stroke-width:1.5}
.window-actions{position:absolute;top:20px;right:17%;display:flex;-webkit-app-region:no-drag;z-index:2}.window-actions button{width:34px;height:32px;border:0;background:transparent;color:#9fa8b0;cursor:pointer;font-size:20px}.window-actions button:hover{background:#ffffff12;color:white}
.login-art{position:absolute;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(90deg,transparent 12%,#0b0e1033 28%,#0b0e10c9 43%,#0b0e10c9 57%,#0b0e1033 72%,transparent 88%),#0b0e10 url('../assets/login-tactical-bg.png') center/cover no-repeat}
.login-content{width:min(72%,444px);padding:64px 24px 48px;margin:auto;flex-shrink:0;-webkit-app-region:no-drag}
.form-head{text-align:center;margin-bottom:32px}.brand{display:block;width:218px;max-width:100%;height:auto;margin:0 auto 29px}h1{font-size:34px;line-height:1.15;letter-spacing:-1.2px;margin:0 0 12px;font-weight:750}.form-head p{font-size:13px;line-height:1.6;color:#aab0b8;margin:0}
.form{display:flex;flex-direction:column;gap:21px}.field label{display:block;font-size:12px;font-weight:600;color:#e1e4e8}.field-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}.field>label{margin-bottom:9px}.iw{position:relative;display:flex;align-items:center}.iw:focus-within .fi{stroke:#f5a2b4}.fi{position:absolute;left:15px;width:18px;height:18px;fill:none;stroke-width:1.5;stroke:#929ba6;pointer-events:none}input{width:100%;height:50px;padding:0 44px;background:linear-gradient(120deg,#232a2ed9,#171d22e6);color:#f4f5f6;border:1px solid #7c879180;border-radius:6px;font:inherit;font-size:13px;transition:border-color .15s,background .15s}input::placeholder{color:#8a949f}input:hover{border-color:#8996a5}input:focus{outline:2px solid #ed164a;outline-offset:2px;background:#1a2027}input:disabled{opacity:.65}.eye{position:absolute;right:5px;display:grid;place-items:center;width:38px;height:38px;border:0;background:transparent;color:#bac3ce;cursor:pointer}.eye svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.6}
button{font:inherit}button:focus-visible{outline:2px solid #ff6687;outline-offset:4px}.link-forgot,.link-accent{background:none;border:0;padding:3px 0;color:#ff718f;font-size:12px;cursor:pointer}.link-forgot:hover,.link-accent:hover{text-decoration:underline;color:#ff91a7}.btn-primary{display:flex;align-items:center;justify-content:center;gap:14px;width:100%;height:50px;margin-top:5px;border:1px solid #ef194c;border-radius:6px;background:#e7073f;color:white;font-weight:650;font-size:14px;cursor:pointer;transition:background .15s}.btn-primary span{font-size:20px;font-weight:400;line-height:1}.btn-primary:hover:not(:disabled){background:#fa164e}.btn-primary:disabled{opacity:.6;cursor:wait}.signup-row{display:flex;justify-content:center;align-items:center;gap:9px;margin-top:23px;flex-wrap:wrap;font-size:12px;color:#abb3bd}.link-accent span{margin-left:4px}
.error{display:flex;align-items:flex-start;gap:9px;border:1px solid #ef45645c;background:#301720;border-radius:6px;padding:12px;color:#ffc8d1;font-size:12px;line-height:1.5;overflow-wrap:anywhere}.error svg{flex-shrink:0;width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.5}.login-footer{margin-top:46px;text-align:center}.signature{display:flex;align-items:center;justify-content:center;gap:15px;color:#919ba7;font-size:10px;letter-spacing:1.25px;margin:0 0 16px}.signature span{width:30px;height:1px;background:#75808b66}.login-footer nav{display:flex;align-items:center;justify-content:center;gap:19px;font-size:11px;color:#58616b}.login-footer button{border:0;background:none;color:#9aa4b0;font-size:11px;min-height:32px;padding:4px;cursor:pointer}.login-footer button:hover{color:white}
@media(max-height:740px){.login-content{padding-top:56px;padding-bottom:35px}.brand{width:174px;margin-bottom:18px}.form-head{margin-bottom:23px}h1{font-size:29px}.form{gap:16px}.login-footer{margin-top:27px}.signature{margin-bottom:8px}}
@media(max-width:560px){.login-screen{padding:4px}.login-content{width:86%}.window-actions{top:12px}.login-art{background-image:linear-gradient(#0b0e102b,#0b0e1066),url('../assets/login-tactical-bg.png')}.login-content{padding-left:28px;padding-right:28px}h1{font-size:29px}.form-head p{font-size:12px}}
.login-spinner{width:17px;height:17px;border:2px solid #ffffff50;border-top-color:white;border-radius:50%;animation:login-spin .8s linear infinite}
@keyframes login-spin{to{transform:rotate(360deg)}}
@media(max-width:560px){.login-content{padding-top:66px;padding-bottom:52px}.window-actions{right:18%}h1{font-size:clamp(23px,5vw,29px);letter-spacing:-.7px}.signature{gap:8px;letter-spacing:.65px}.signature span{width:18px}}
@media(prefers-reduced-motion:reduce){input,.btn-primary{transition:none}.login-spinner{animation:none}}
</style>
