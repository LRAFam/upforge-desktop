<script setup lang="ts">
/**
 * UI v3 sign-in. Presentational: LoginView keeps the auth logic and passes state in,
 * so every flow (sign in, errors, forgot, create account, help, privacy, window controls) is unchanged.
 */
import heroArt from '../../assets/hero-agents.webp'
import upforgeLogo from '../../assets/upforge-logo.webp'
import UfIcon from '../../components/v3/UfIcon.vue'

defineProps<{ loading: boolean; error: string; showPassword: boolean }>()
const email = defineModel<string>('email', { required: true })
const password = defineModel<string>('password', { required: true })
defineEmits<{
  submit: []
  togglePassword: []
  forgot: []
  signup: []
  help: []
  privacy: []
  minimize: []
  close: []
}>()
</script>

<template>
  <main class="uf-login">
    <img :src="heroArt" alt="" class="uf-login-art">
    <div class="uf-login-scrim" />
    <div class="uf-login-winctl">
      <button type="button" aria-label="Minimize UpForge" @click="$emit('minimize')"><UfIcon name="minus" :size="14" /></button>
      <button type="button" aria-label="Close UpForge" class="is-close" @click="$emit('close')"><UfIcon name="close" :size="14" /></button>
    </div>

    <section class="uf-login-col uf-rise">
      <img :src="upforgeLogo" alt="UpForge" class="uf-login-logo">
      <h1 class="uf-d2">Back to your game</h1>
      <p class="uf-t2">Your footage. Your progress. Your next step.</p>

      <form class="uf-login-form" :aria-busy="loading" :aria-describedby="error ? 'login-error' : undefined" @submit.prevent="$emit('submit')">
        <label class="uf-login-field">
          <span class="uf-label">Email</span>
          <input id="login-email" v-model="email" type="email" placeholder="you@domain.com" autocomplete="email"
            autocapitalize="none" spellcheck="false" :disabled="loading" required>
        </label>
        <div class="uf-login-field">
          <div class="uf-login-row">
            <label for="login-password" class="uf-label">Password</label>
            <button type="button" class="uf-link" @click="$emit('forgot')">Forgot password →</button>
          </div>
          <div class="uf-login-pw">
            <input id="login-password" v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="Enter your password"
              autocomplete="current-password" :disabled="loading" required>
            <button type="button" class="uf-login-eye" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="$emit('togglePassword')">
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>

        <p v-if="error" id="login-error" class="uf-login-error" role="alert">{{ error }}</p>

        <button type="submit" class="uf-btn-primary uf-login-submit" :disabled="loading">
          <span>{{ loading ? 'Signing in…' : 'Sign in' }}</span>
        </button>
      </form>

      <div class="uf-hair" />
      <div class="uf-login-foot">
        <span class="uf-t4">New to UpForge?</span>
        <button type="button" class="uf-link uf-login-create" @click="$emit('signup')">Create account →</button>
        <span style="flex: 1" />
        <button type="button" class="uf-link" @click="$emit('help')">Help</button>
        <button type="button" class="uf-link" @click="$emit('privacy')">Privacy</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.uf-login { position: relative; height: 100%; min-height: 0; overflow: auto; display: flex; align-items: center; background: var(--uf-bg); -webkit-app-region: drag; }
.uf-login-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: right center; filter: saturate(0.6) brightness(0.85); pointer-events: none; }
.uf-login-scrim { position: absolute; inset: 0; pointer-events: none; background:
  linear-gradient(90deg, var(--uf-bg) 0%, rgba(14, 17, 22, 0.96) 42%, rgba(14, 17, 22, 0.55) 72%, rgba(14, 17, 22, 0.8) 100%),
  linear-gradient(180deg, transparent 60%, var(--uf-bg)); }
.uf-login-winctl { position: absolute; top: 0; right: 0; display: flex; z-index: 2; -webkit-app-region: no-drag; }
.uf-login-winctl button { width: 44px; height: 40px; display: flex; align-items: center; justify-content: center; background: none; border: 0; color: var(--uf-muted); cursor: pointer; }
.uf-login-winctl button:hover { background: var(--uf-hover); color: var(--uf-bone); }
.uf-login-winctl button.is-close:hover { background: var(--uf-red-deep); color: #fff; }
.uf-login-col { position: relative; width: min(100%, 440px); margin-left: clamp(24px, 9vw, 120px); padding: 48px 0; display: flex; flex-direction: column; gap: 14px; -webkit-app-region: no-drag; }
.uf-login-logo { width: 140px; height: auto; margin-bottom: 18px; }
.uf-login-form { display: flex; flex-direction: column; gap: 18px; margin-top: 18px; }
.uf-login-field { display: flex; flex-direction: column; gap: 8px; }
.uf-login-row { display: flex; align-items: baseline; justify-content: space-between; }
.uf-login-pw { position: relative; display: flex; }
.uf-login input { width: 100%; height: 44px; padding: 0 14px; background: var(--uf-raised); border: 1px solid var(--uf-line-2); border-radius: 0; color: var(--uf-bone); font: 400 15px/1 var(--uf-body); }
.uf-login input::placeholder { color: var(--uf-faint); }
.uf-login input:hover { border-color: var(--uf-muted); }
.uf-login input:focus { outline: 2px solid var(--uf-red); outline-offset: 2px; }
.uf-login input:disabled { opacity: 0.6; }
.uf-login-pw input { padding-right: 64px; }
.uf-login-eye { position: absolute; right: 0; top: 0; height: 44px; padding: 0 14px; background: none; border: 0; color: var(--uf-muted); font: 600 13px/1 var(--uf-body); cursor: pointer; }
.uf-login-eye:hover { color: var(--uf-bone); }
.uf-login-error { margin: 0; padding-left: 12px; border-left: 2px solid var(--uf-loss); font: 400 13px/1.4 var(--uf-body); color: var(--uf-bone); overflow-wrap: anywhere; }
.uf-login-submit { align-self: flex-start; margin-top: 6px; }
.uf-login-foot { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.uf-login-create { color: var(--uf-bone); }
</style>
