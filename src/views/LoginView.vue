<template>
  <div class="flex flex-col items-center justify-center h-full px-8 py-6">
    <div class="w-full max-w-sm">
      <!-- Logo -->
      <div class="flex flex-col items-center mb-8">
        <div class="w-12 h-12 bg-gradient-to-br from-red-500 to-orange-600 rounded-xl flex items-center justify-center mb-3">
          <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h1 class="text-xl font-bold">UpForge</h1>
        <p class="text-xs text-gray-400 mt-1">AI-Powered Valorant Coaching</p>
      </div>

      <!-- Form -->
      <form class="space-y-4" @submit.prevent="handleLogin">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
          <input
            v-model="email"
            type="email"
            placeholder="you@example.com"
            required
            class="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 focus:bg-white/[0.06] transition-colors"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
          <input
            v-model="password"
            type="password"
            placeholder="••••••••"
            required
            class="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 focus:bg-white/[0.06] transition-colors"
          />
        </div>

        <div
          v-if="error"
          class="px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400"
        >
          {{ error }}
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full py-2.5 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-all"
        >
          <span v-if="loading" class="flex items-center justify-center gap-2">
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Signing in...
          </span>
          <span v-else>Sign In</span>
        </button>
      </form>

      <p class="text-center text-xs text-gray-500 mt-6">
        Don't have an account?
        <a
          href="#"
          class="text-red-400 hover:text-red-300"
          @click.prevent="openSignup"
        >Sign up on upforge.gg</a>
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

  if (result.success) {
    router.push('/dashboard')
  } else {
    error.value = result.error || 'Login failed'
  }

  loading.value = false
}

function openSignup() {
  window.open('https://upforge.gg/register', '_blank')
}
</script>
