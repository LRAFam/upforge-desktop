<template>
  <div class="flex flex-col h-full items-center justify-center px-8 relative overflow-hidden">
    <!-- Subtle background glow -->
    <div class="absolute inset-0 pointer-events-none">
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-red-600/[0.07] rounded-full blur-3xl" />
    </div>

    <div class="w-full max-w-[280px] relative z-10">
      <!-- Logo -->
      <div class="flex flex-col items-center mb-7">
        <div class="w-11 h-11 bg-gradient-to-br from-red-500 to-orange-600 rounded-xl flex items-center justify-center mb-3 shadow-lg shadow-red-500/20">
          <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 3L4 14h7v7l9-11h-7z"/>
          </svg>
        </div>
        <h1 class="text-base font-bold tracking-tight">UpForge</h1>
        <p class="text-[11px] text-gray-500 mt-0.5">AI-Powered Valorant Coaching</p>
      </div>

      <!-- Form -->
      <form class="space-y-3" @submit.prevent="handleLogin">
        <div class="space-y-1">
          <label class="block text-[11px] font-medium text-gray-400 ml-0.5">Email</label>
          <input
            v-model="email"
            type="email"
            placeholder="you@example.com"
            autocomplete="email"
            required
            class="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-red-500/40 focus:bg-white/[0.06] transition-all"
          />
        </div>

        <div class="space-y-1">
          <label class="block text-[11px] font-medium text-gray-400 ml-0.5">Password</label>
          <input
            v-model="password"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
            required
            class="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-red-500/40 focus:bg-white/[0.06] transition-all"
          />
        </div>

        <div
          v-if="error"
          class="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg"
        >
          <svg class="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="text-[11px] text-red-400">{{ error }}</p>
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full py-2.5 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-all shadow-md shadow-red-500/20 mt-1"
        >
          <span v-if="loading" class="flex items-center justify-center gap-2">
            <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Signing in...
          </span>
          <span v-else>Sign In</span>
        </button>
      </form>

      <p class="text-center text-[11px] text-gray-600 mt-5">
        No account?
        <button class="text-red-400 hover:text-red-300 transition-colors" @click="openSignup">
          Sign up free ↗
        </button>
      </p>
      <p class="text-center text-[11px] text-gray-700 mt-1">
        <button class="hover:text-gray-500 transition-colors" @click="openForgotPassword">Forgot password?</button>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  loading.value = true
  error.value = ''
  const result = await window.api.auth.login(email.value, password.value)
  if (result.ok) {
    router.push('/dashboard')
  } else {
    error.value = (result as { error?: string }).error || 'Login failed. Check your credentials.'
  }
  loading.value = false
}

function openSignup() {
  window.open('https://upforge.gg/register', '_blank')
}

function openForgotPassword() {
  window.open('https://upforge.gg/forgot-password', '_blank')
}
</script>
