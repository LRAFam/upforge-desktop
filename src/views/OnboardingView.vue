<template>
  <div class="wiz-root min-h-full h-full flex items-center justify-center px-4">
    <div
      v-if="isPreview"
      class="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5"
    >
      <div class="flex items-center gap-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-3 py-1.5">
        <span class="text-[10px] font-bold uppercase tracking-wider text-amber-300/90">
          Preview · changes not saved
        </span>
        <button
          type="button"
          class="text-[10px] font-semibold text-amber-200/80 hover:text-amber-100 transition-colors"
          @click="handleComplete"
        >
          Exit
        </button>
      </div>
      <p
        v-if="step === 1 && !isAuthed"
        class="text-[10px] text-amber-200/60 text-center max-w-xs"
      >
        Sign-in optional in preview · account links won&apos;t save
      </p>
    </div>

    <div class="wiz-shell dash-panel w-full max-w-xl overflow-hidden relative">
      <div class="flex items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-white/[0.07]">
        <button
          v-if="step > 1"
          type="button"
          class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/[0.05] transition-colors"
          aria-label="Back"
          @click="prevStep"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="w-4 h-4">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div v-else class="w-8" />

        <div class="flex-1 min-w-0 px-2">
          <div class="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              class="h-full rounded-full bg-[#ff4655] transition-all duration-300 ease-out"
              :style="{ width: `${(step / TOTAL_STEPS) * 100}%` }"
            />
          </div>
          <p class="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 text-center">
            {{ stepLabels[step - 1] }} · {{ step }} / {{ TOTAL_STEPS }}
          </p>
        </div>

        <div class="w-8" />
      </div>

      <div class="relative overflow-hidden max-h-[min(78vh,720px)] overflow-y-auto">
        <Transition :name="slideDir">
            <!-- 1 · Account -->
            <div v-if="step === 1" key="step1" class="wiz-step">
              <h2 class="text-[22px] font-black text-white tracking-tight">Sign in</h2>
              <p class="text-sm text-gray-500 mt-2 mb-6">
                Use your UpForge account. New here? Create one on the website, then come back.
              </p>

              <div class="space-y-3 mb-5">
                <div>
                  <label for="onboarding-email" class="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 block mb-2">
                    Email
                  </label>
                  <input
                    id="onboarding-email"
                    v-model="email"
                    type="email"
                    placeholder="your@email.com"
                    autocomplete="email"
                    class="wiz-input"
                    @keydown.enter.prevent="handleSignIn"
                  />
                </div>
                <div>
                  <label for="onboarding-password" class="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 block mb-2">
                    Password
                  </label>
                  <input
                    id="onboarding-password"
                    v-model="password"
                    type="password"
                    placeholder="••••••••"
                    autocomplete="current-password"
                    class="wiz-input"
                    @keydown.enter.prevent="handleSignIn"
                  />
                </div>
              </div>

              <p v-if="signInError" class="text-[12px] text-red-400 mb-4">{{ signInError }}</p>

              <button
                type="button"
                class="btn-primary w-full"
                :disabled="signInLoading"
                @click="handleSignIn"
              >
                {{ signInLoading ? 'Signing in…' : 'Sign in' }}
              </button>

              <button
                v-if="isPreview && !isAuthed"
                type="button"
                class="btn-ghost w-full mt-2.5"
                @click="nextStep"
              >
                Continue without signing in
              </button>

              <p class="text-[11px] text-gray-600 text-center mt-4">
                New to UpForge?
                <button type="button" class="text-[#ff4655] font-semibold hover:underline" @click="openRegister">
                  Create account
                </button>
              </p>
            </div>

            <!-- 2 · Game -->
            <div v-else-if="step === 2" key="step2" class="wiz-step">
              <h2 class="text-[22px] font-black text-white tracking-tight leading-tight">Primary game</h2>
              <p class="text-sm text-gray-500 mt-2 mb-6 leading-relaxed">
                Coaching, recording, and the dashboard follow this pick. You can change it later.
              </p>

              <div class="space-y-2.5 mb-8">
                <button
                  v-for="game in GAMES"
                  :key="game.id"
                  type="button"
                  class="relative w-full h-[72px] rounded-xl overflow-hidden text-left transition-colors focus:outline-none"
                  :class="
                    selectedGame === game.id
                      ? 'ring-2 ring-[#ff4655] ring-offset-2 ring-offset-[#111111]'
                      : 'ring-1 ring-white/[0.08] hover:ring-white/[0.16]'
                  "
                  @click="selectedGame = game.id"
                >
                  <img :src="game.img" :alt="game.name" class="absolute inset-0 w-full h-full object-cover" />
                  <div class="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/25" />
                  <div class="absolute inset-0 flex items-center px-4">
                    <div class="flex items-center gap-3 min-w-0">
                      <span
                        class="h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0"
                        :class="
                          selectedGame === game.id
                            ? 'border-[#ff4655] bg-[#ff4655]'
                            : 'border-white/30 bg-black/40'
                        "
                      >
                        <svg
                          v-if="selectedGame === game.id"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          stroke-width="3.5"
                          class="w-2.5 h-2.5"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                      <div class="min-w-0">
                        <p class="text-sm font-black text-white">{{ game.name }}</p>
                        <p class="text-[11px] text-gray-400 truncate mt-0.5">{{ game.desc }}</p>
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              <button type="button" class="btn-primary w-full" @click="nextStep">
                Continue
              </button>
            </div>

            <!-- 3 · Account link -->
            <div v-else-if="step === 3" key="step3" class="wiz-step">
              <h2 class="text-[22px] font-black text-white tracking-tight leading-tight">
                Link {{ gameCaptureLabel }}
              </h2>
              <p class="text-sm text-gray-500 mt-2 mb-6 leading-relaxed">{{ accountStepBlurb }}</p>

              <!-- Valorant multi-account -->
              <template v-if="selectedGame === 'valorant'">
                <div v-if="accountsLoading" class="text-xs text-gray-500 mb-6">Loading linked accounts…</div>

                <div v-else-if="riotAccounts.length" class="space-y-2.5 mb-5">
                  <p class="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500">
                    Linked accounts
                  </p>
                  <div
                    v-for="account in riotAccounts"
                    :key="account.id"
                    class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div class="min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <p class="text-sm font-semibold text-white truncate">
                          {{ account.riot_name }}<span class="text-[#ff4655]">#{{ account.riot_tag }}</span>
                        </p>
                        <span
                          v-if="account.is_active"
                          class="text-[9px] font-bold uppercase tracking-wide text-[#ff4655] border border-[#ff4655]/25 bg-[#ff4655]/10 px-1.5 py-0.5 rounded"
                        >Active</span>
                      </div>
                      <p class="text-[11px] text-gray-500 mt-1">
                        {{ account.is_active ? 'Used for recording' : 'Linked' }}
                        <span v-if="account.riot_region"> · {{ account.riot_region.toUpperCase() }}</span>
                      </p>
                    </div>
                    <button
                      v-if="!account.is_active && account.id > 0"
                      type="button"
                      class="btn-ghost shrink-0 !text-[11px]"
                      :disabled="riotBusy"
                      @click="activateRiot(account.id)"
                    >
                      Set active
                    </button>
                  </div>
                  <p class="text-[11px] text-gray-600 pt-1">
                    {{ riotAccounts.length }} of {{ riotAccountsMax }} used
                    <span v-if="riotAccountsMax > 1">. Desktop auto-switches when you queue on a linked account.</span>
                  </p>
                </div>

                <div v-if="!accountsLoading && showRiotForm" class="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 mb-5 space-y-3">
                  <p class="text-[11px] text-gray-500">
                    {{ riotAccounts.length ? 'Add another Riot ID (alt / smurf).' : 'Your Riot ID from the Valorant home screen (Name#Tag).' }}
                  </p>
                  <div class="grid grid-cols-3 gap-2.5">
                    <input v-model="riotName" type="text" placeholder="Name" class="wiz-input" />
                    <input v-model="riotTag" type="text" placeholder="Tag" class="wiz-input" />
                    <select v-model="riotRegion" class="wiz-input">
                      <option value="na">NA</option>
                      <option value="eu">EU</option>
                      <option value="ap">AP</option>
                      <option value="kr">KR</option>
                      <option value="latam">LATAM</option>
                      <option value="br">BR</option>
                    </select>
                  </div>
                  <div class="flex gap-2">
                    <button
                      v-if="riotAccounts.length"
                      type="button"
                      class="btn-secondary"
                      @click="showRiotForm = false"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      class="btn-primary flex-1"
                      :disabled="riotBusy"
                      @click="linkValorant"
                    >
                      {{ riotBusy ? 'Linking…' : riotAccounts.length ? 'Link account' : 'Link Riot account' }}
                    </button>
                  </div>
                </div>

                <button
                  v-if="!accountsLoading && !showRiotForm && riotAccountsCanAdd"
                  type="button"
                  class="btn-secondary w-full mb-5"
                  @click="showRiotForm = true"
                >
                  {{ riotAccounts.length ? 'Add another account' : 'Link Riot account' }}
                </button>

                <p
                  v-if="!accountsLoading && !showRiotForm && riotAccounts.length && !riotAccountsCanAdd"
                  class="text-[12px] text-gray-500 mb-5 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3"
                >
                  Account limit reached on your plan. Upgrade later for more Valorant accounts.
                </p>

                <p v-if="accountError" class="text-[12px] text-red-400 mb-4">{{ accountError }}</p>
                <p v-if="accountSuccess" class="text-[12px] text-emerald-400 mb-4">{{ accountSuccess }}</p>
              </template>

              <!-- CS2 -->
              <template v-else-if="selectedGame === 'cs2'">
                <div class="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 mb-5 space-y-4">
                  <div>
                    <label class="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 block mb-2">
                      Steam / in-game name
                    </label>
                    <input v-model="cs2SteamName" type="text" placeholder="Matches your CS2 name" class="wiz-input" />
                  </div>
                  <div>
                    <label class="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 block mb-2">
                      FACEIT <span class="normal-case tracking-normal font-medium text-gray-600">(optional)</span>
                    </label>
                    <div class="flex gap-2">
                      <input v-model="faceitNickname" type="text" placeholder="FACEIT nickname" class="wiz-input flex-1" />
                      <button
                        type="button"
                        class="btn-secondary shrink-0"
                        :disabled="accountBusy"
                        @click="linkFaceit"
                      >
                        {{ accountBusy ? '…' : 'Link' }}
                      </button>
                    </div>
                  </div>
                  <button type="button" class="btn-primary w-full" :disabled="accountBusy" @click="saveCs2">
                    {{ accountBusy ? 'Saving…' : 'Save CS2 name' }}
                  </button>
                </div>
                <p v-if="cs2Linked" class="text-[12px] text-emerald-400 mb-4">CS2 identity saved</p>
                <p v-if="accountError" class="text-[12px] text-red-400 mb-4">{{ accountError }}</p>
              </template>

              <!-- Deadlock -->
              <template v-else-if="selectedGame === 'deadlock'">
                <div class="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 mb-5 space-y-3">
                  <template v-if="deadlockLinked">
                    <p class="text-sm text-emerald-300">Steam profile connected</p>
                  </template>
                  <template v-else>
                    <div class="flex gap-2">
                      <input
                        v-model="steamSearch"
                        type="text"
                        placeholder="Steam name or ID"
                        class="wiz-input flex-1"
                        @keydown.enter.prevent="searchDeadlock"
                      />
                      <button
                        type="button"
                        class="btn-secondary shrink-0"
                        :disabled="accountBusy"
                        @click="searchDeadlock"
                      >
                        {{ accountBusy ? '…' : 'Search' }}
                      </button>
                    </div>
                    <ul v-if="steamResults.length" class="space-y-1.5">
                      <li v-for="player in steamResults" :key="player.account_id">
                        <button
                          type="button"
                          class="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-left text-xs text-gray-200 hover:border-white/[0.14]"
                          @click="connectDeadlock(player.account_id)"
                        >
                          {{ player.personaname }}
                        </button>
                      </li>
                    </ul>
                  </template>
                </div>
                <p v-if="accountError" class="text-[12px] text-red-400 mb-4">{{ accountError }}</p>
                <p v-if="accountSuccess" class="text-[12px] text-emerald-400 mb-4">{{ accountSuccess }}</p>
              </template>

              <!-- LoL -->
              <template v-else>
                <div class="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 mb-5 space-y-3">
                  <template v-if="lolLinked">
                    <p class="text-sm font-semibold text-white">{{ lolDisplayName }}</p>
                  </template>
                  <template v-else>
                    <div class="grid grid-cols-3 gap-2.5">
                      <input v-model="lolName" type="text" placeholder="Name" class="wiz-input" />
                      <input v-model="lolTag" type="text" placeholder="Tag" class="wiz-input" />
                      <select v-model="lolPlatform" class="wiz-input">
                        <option v-for="p in LOL_PLATFORMS" :key="p.value" :value="p.value">{{ p.label }}</option>
                      </select>
                    </div>
                    <button type="button" class="btn-primary w-full" :disabled="accountBusy" @click="linkLol">
                      {{ accountBusy ? 'Linking…' : 'Link League account' }}
                    </button>
                  </template>
                </div>
                <p v-if="accountError" class="text-[12px] text-red-400 mb-4">{{ accountError }}</p>
                <p v-if="accountSuccess" class="text-[12px] text-emerald-400 mb-4">{{ accountSuccess }}</p>
              </template>

              <div class="wiz-actions">
                <button
                  type="button"
                  class="btn-primary w-full"
                  :disabled="accountBusy || accountsLoading"
                  @click="nextStep"
                >
                  Continue
                </button>
                <button
                  v-if="!accountLinked"
                  type="button"
                  class="btn-ghost w-full"
                  :disabled="accountBusy"
                  @click="nextStep"
                >
                  Skip for now
                </button>
                <p class="text-[11px] text-gray-600 text-center">
                  Manage accounts anytime in Settings → General
                </p>
              </div>
            </div>

            <!-- 4 · OBS -->
            <div v-else-if="step === 4" key="step4" class="wiz-step">
              <h2 class="text-[22px] font-black text-white tracking-tight leading-tight">Connect OBS</h2>
              <p class="text-sm text-gray-500 mt-2 mb-6 leading-relaxed">
                {{
                  selectedGame === 'lol'
                    ? 'OBS captures desktop matches. For League you can also upload VODs from the website later.'
                    : `UpForge records ${gameCaptureLabel} through OBS. You can connect now or finish this in Settings.`
                }}
              </p>

              <div
                class="rounded-xl border px-4 py-4 mb-5"
                :class="
                  obsConnected
                    ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
                    : 'border-white/[0.08] bg-white/[0.02]'
                "
              >
                <div class="flex items-center gap-2 mb-4">
                  <span
                    class="h-2 w-2 rounded-full shrink-0"
                    :class="obsConnected ? 'bg-emerald-400' : 'bg-gray-500'"
                  />
                  <span
                    class="text-sm font-semibold"
                    :class="obsConnected ? 'text-emerald-300' : 'text-gray-300'"
                  >
                    {{ obsConnected ? 'OBS connected' : 'OBS not connected yet' }}
                  </span>
                </div>

                <ol class="list-decimal list-inside space-y-2 text-[12px] text-gray-500 mb-5">
                  <li>Install OBS Studio 28+ if it is not on this PC</li>
                  <li>Open OBS (enable WebSocket in Tools → WebSocket Server Settings)</li>
                  <li>
                    Come back and connect. Default password is often
                    <span class="text-gray-300 font-semibold">upforge</span>
                  </li>
                </ol>

                <p v-if="obsError" class="text-[12px] text-red-400 mb-4 leading-relaxed">{{ obsError }}</p>

                <div v-if="!obsConnected" class="space-y-2.5">
                  <button
                    type="button"
                    class="btn-primary w-full"
                    :disabled="obsConnecting"
                    @click="launchAndConnectObs"
                  >
                    {{ obsConnecting ? 'Working…' : 'Launch OBS & Connect' }}
                  </button>
                  <div class="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      class="btn-secondary w-full"
                      :disabled="obsConnecting"
                      @click="openObsDownload"
                    >
                      Download OBS
                    </button>
                    <button
                      type="button"
                      class="btn-secondary w-full"
                      :disabled="obsConnecting"
                      @click="connectObs"
                    >
                      Connect only
                    </button>
                  </div>
                  <p class="text-[11px] text-gray-600 leading-relaxed pt-1">
                    If Launch fails: download OBS, open it yourself, enable WebSocket, then use Connect only.
                  </p>
                </div>

                <div v-else class="space-y-2.5">
                  <div class="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      class="btn-secondary w-full"
                      :disabled="obsRepairRunning"
                      @click="repairObsSetup"
                    >
                      {{ obsRepairRunning ? 'Repairing…' : 'Repair Setup' }}
                    </button>
                    <button
                      type="button"
                      class="btn-secondary w-full"
                      :disabled="obsTestRecordingRunning"
                      @click="testObsRecording"
                    >
                      {{ obsTestRecordingRunning ? 'Testing…' : 'Test Recording' }}
                    </button>
                  </div>
                  <p
                    v-if="obsSetupMessage"
                    class="text-[11px] leading-relaxed"
                    :class="obsSetupMessageError ? 'text-red-400' : 'text-emerald-300/90'"
                  >
                    {{ obsSetupMessage }}
                  </p>
                </div>
              </div>

              <div
                v-if="!obsConnected"
                class="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3.5 mb-5"
              >
                <p class="text-[12px] font-semibold text-amber-200/90 leading-snug">
                  You can continue without OBS. Matches will not auto-record until it is connected.
                </p>
                <p class="text-[11px] text-amber-200/60 mt-1.5 leading-snug">
                  We will remind you on the dashboard until OBS is connected.
                </p>
              </div>

              <div class="wiz-actions">
                <button type="button" class="btn-primary w-full" @click="continueFromObs">
                  Continue
                </button>
                <p v-if="!obsConnected" class="text-[11px] text-gray-600 text-center">
                  OBS can be finished later in Settings → Recording
                </p>
              </div>
            </div>

            <!-- 5 · Ready -->
            <div v-else-if="step === 5" key="step5" class="wiz-step">
              <h2 class="text-[22px] font-black text-white tracking-tight leading-tight">
                {{ obsConnected ? 'You are set' : 'Almost set' }}
              </h2>
              <p class="text-sm mt-2 mb-6 leading-relaxed" :class="obsConnected ? 'text-gray-500' : 'text-amber-200/80'">
                {{ readyBlurb }}
              </p>

              <div class="rounded-xl border border-white/[0.08] overflow-hidden mb-5">
                <div
                  v-for="(row, idx) in summaryRows"
                  :key="row.label"
                  class="flex items-center justify-between gap-3 px-4 py-3"
                  :class="idx > 0 ? 'border-t border-white/[0.06]' : ''"
                >
                  <span class="text-[12px] text-gray-500">{{ row.label }}</span>
                  <span
                    class="text-[12px] font-semibold text-right"
                    :class="row.warn ? 'text-amber-300' : 'text-white'"
                  >
                    {{ row.value }}
                  </span>
                </div>
              </div>

              <div class="mb-5">
                <p class="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 mb-2.5">Hotkeys</p>
                <div class="grid grid-cols-3 gap-2.5">
                  <div
                    v-for="hk in HOTKEYS"
                    :key="hk.key"
                    class="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2.5 text-center"
                  >
                    <kbd class="text-[11px] font-black font-mono text-white">{{ hk.key }}</kbd>
                    <p class="text-[10px] text-gray-500 mt-1 leading-tight">{{ hk.action }}</p>
                  </div>
                </div>
              </div>

              <div
                v-if="gameTip"
                class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3.5 mb-5"
              >
                <p class="text-[12px] text-gray-400 leading-relaxed">
                  <span class="font-semibold text-gray-200">{{ gameTip.label }}</span>
                  {{ gameTip.body }}
                </p>
              </div>

              <div class="wiz-actions">
                <button
                  type="button"
                  class="btn-primary w-full"
                  :disabled="saving"
                  @click="handleComplete"
                >
                  <svg v-if="saving" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <template v-else>{{ firstMatchCta }}</template>
                </button>
                <button
                  v-if="!obsConnected"
                  type="button"
                  class="btn-ghost w-full"
                  @click="prevStep"
                >
                  Back to OBS setup
                </button>
                <p v-if="completeError" class="text-[12px] text-red-400 text-center">{{ completeError }}</p>
              </div>

              <div class="mt-6 pt-5 border-t border-white/[0.06] space-y-2.5">
                <p class="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 text-center">
                  Optional
                </p>
                <a
                  :href="DISCORD_INVITE_URL"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex w-full items-center justify-center gap-2.5 rounded-[10px] bg-[#5865F2] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#4752C4]"
                >
                  <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path
                      d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
                    />
                  </svg>
                  Join the UpForge Discord
                </a>

                <button
                  v-if="!discordLinked"
                  type="button"
                  class="flex w-full items-center justify-center gap-2 rounded-[10px] border border-[#5865F2]/35 bg-[#5865F2]/10 px-4 py-2.5 text-xs font-semibold text-[#c9cdfb] transition-colors hover:bg-[#5865F2]/18"
                  @click="openDiscordLink"
                >
                  Link Discord for notifications &amp; bot features
                </button>
                <p v-else class="text-[12px] text-emerald-400/90 text-center">
                  Discord linked · still join the server above for support
                </p>
              </div>
            </div>

          </Transition>
        </div>
      </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PRIMARY_GAME_ARTWORK, isPrimaryGame, type PrimaryGame } from '../lib/games'
import { resolveMaxValorantAccounts } from '../lib/valorant-account-cap'

const DISCORD_INVITE_URL = 'https://discord.gg/MDD3WVRaEq'
const OBS_DOWNLOAD_URL = 'https://obsproject.com/download'
const OBS_SKIP_KEY = 'upforge_obs_onboarding_skipped'
const TOTAL_STEPS = 5

type RiotAccount = {
  id: number
  riot_name: string
  riot_tag: string
  riot_region?: string | null
  is_active: boolean
}

const route = useRoute()
const router = useRouter()
const isPreview = computed(() => route.query.preview === '1')

const email = ref('')
const password = ref('')
const signInError = ref('')
const signInLoading = ref(false)
const isAuthed = ref(false)

const step = ref(1)
const slideDir = ref<'slide-left' | 'slide-right'>('slide-left')
const saving = ref(false)
const completeError = ref('')
const obsConnecting = ref(false)
const obsConnected = ref(false)
const obsError = ref('')
const obsRepairRunning = ref(false)
const obsTestRecordingRunning = ref(false)
const obsSetupMessage = ref('')
const obsSetupMessageError = ref(false)

const selectedGame = ref<PrimaryGame>('valorant')

const riotAccounts = ref<RiotAccount[]>([])
const riotAccountsMax = ref(1)
const showRiotForm = ref(true)
const riotName = ref('')
const riotTag = ref('')
const riotRegion = ref('na')
const riotBusy = ref(false)

const cs2SteamName = ref('')
const faceitNickname = ref('')
const cs2Linked = ref(false)

const steamSearch = ref('')
const steamResults = ref<Array<{ account_id: number; personaname: string }>>([])
const deadlockLinked = ref(false)

const lolName = ref('')
const lolTag = ref('')
const lolPlatform = ref('EUW1')
const lolLinked = ref(false)
const lolDisplayName = ref('')

const accountBusy = ref(false)
const accountsLoading = ref(false)
const accountError = ref('')
const accountSuccess = ref('')
const discordLinked = ref(false)

const stepLabels = ['Account', 'Game', 'Link', 'OBS', 'Ready'] as const

const GAMES = [
  { id: 'valorant' as const, name: 'Valorant', img: PRIMARY_GAME_ARTWORK.valorant, desc: 'Full AI coaching and VOD analysis' },
  { id: 'cs2' as const, name: 'CS2', img: PRIMARY_GAME_ARTWORK.cs2, desc: 'Demo analysis and FACEIT sync' },
  { id: 'deadlock' as const, name: 'Deadlock', img: PRIMARY_GAME_ARTWORK.deadlock, desc: 'Replay analysis and rank tracking' },
  { id: 'lol' as const, name: 'League of Legends', img: PRIMARY_GAME_ARTWORK.lol, desc: 'VOD coaching and match history' },
]

const LOL_PLATFORMS = [
  { value: 'EUW1', label: 'EUW' },
  { value: 'EUN1', label: 'EUNE' },
  { value: 'NA1', label: 'NA' },
  { value: 'KR', label: 'KR' },
  { value: 'BR1', label: 'BR' },
  { value: 'LA1', label: 'LAN' },
  { value: 'LA2', label: 'LAS' },
  { value: 'OC1', label: 'OCE' },
  { value: 'JP1', label: 'JP' },
  { value: 'TR1', label: 'TR' },
  { value: 'RU', label: 'RU' },
  { value: 'PH2', label: 'PH' },
  { value: 'SG2', label: 'SG' },
  { value: 'TH2', label: 'TH' },
  { value: 'TW2', label: 'TW' },
  { value: 'VN2', label: 'VN' },
]

const riotAccountsCanAdd = computed(() => riotAccounts.value.length < riotAccountsMax.value)

const gameCaptureLabel = computed(() => {
  if (selectedGame.value === 'cs2') return 'CS2'
  if (selectedGame.value === 'deadlock') return 'Deadlock'
  if (selectedGame.value === 'lol') return 'League'
  return 'Valorant'
})

const accountStepBlurb = computed(() => {
  if (selectedGame.value === 'valorant') {
    return 'Link the Riot ID you play on. Plus/Pro can add alts; we auto-switch when you queue on a linked account.'
  }
  if (selectedGame.value === 'cs2') return 'Save your Steam/in-game name so demos and stats match the right player.'
  if (selectedGame.value === 'deadlock') return 'Connect Steam so Deadlock match history and replays sync.'
  return 'Link your League Riot ID (can differ from Valorant).'
})

const accountLinked = computed(() => {
  if (selectedGame.value === 'valorant') return riotAccounts.value.length > 0
  if (selectedGame.value === 'cs2') return cs2Linked.value
  if (selectedGame.value === 'deadlock') return deadlockLinked.value
  return lolLinked.value
})

const firstMatchCta = 'Open dashboard'

const readyBlurb = computed(() => {
  if (obsConnected.value) {
    return 'Queue a ranked or competitive match. Keep UpForge and OBS open.'
  }
  return 'Connect OBS before you queue for auto-recording, or finish later in Settings → Recording. The dashboard will keep reminding you.'
})

const gameTip = computed(() => {
  if (selectedGame.value === 'cs2') {
    return {
      label: 'CS2:',
      body: 'Enable demo recording in CS2. FACEIT link is optional but improves match stats sync.',
    }
  }
  if (selectedGame.value === 'deadlock') {
    return {
      label: 'Deadlock:',
      body: 'Enable replay saving in game settings so stats and clips can attach after matches.',
    }
  }
  if (selectedGame.value === 'lol') {
    return {
      label: 'League:',
      body: 'You can upload VODs from upforge.gg if desktop capture is not ready yet.',
    }
  }
  return {
    label: 'Valorant:',
    body: 'Exclusive Fullscreen can block overlays. Use Windowed Fullscreen for the in-game HUD. Extra accounts live under Settings.',
  }
})

const HOTKEYS = [
  { key: 'F9', action: 'Save clip' },
  { key: 'F10', action: 'Overlay' },
  { key: 'F8', action: 'Screenshot' },
]

const summaryRows = computed(() => {
  const gameLabel =
    selectedGame.value === 'cs2'
      ? 'CS2'
      : selectedGame.value === 'deadlock'
        ? 'Deadlock'
        : selectedGame.value === 'lol'
          ? 'League of Legends'
          : 'Valorant'

  let accountValue = 'Not linked'
  if (selectedGame.value === 'valorant' && riotAccounts.value.length) {
    const active = riotAccounts.value.find((a) => a.is_active) ?? riotAccounts.value[0]
    accountValue =
      riotAccounts.value.length > 1
        ? `${active.riot_name}#${active.riot_tag} (+${riotAccounts.value.length - 1})`
        : `${active.riot_name}#${active.riot_tag}`
  } else if (selectedGame.value === 'cs2' && cs2Linked.value) {
    accountValue = cs2SteamName.value.trim() || 'Saved'
  } else if (selectedGame.value === 'deadlock' && deadlockLinked.value) {
    accountValue = 'Steam connected'
  } else if (selectedGame.value === 'lol' && lolLinked.value) {
    accountValue = lolDisplayName.value || 'Linked'
  }

  return [
    { label: 'Game', value: gameLabel, warn: false },
    { label: 'Account', value: accountValue, warn: !accountLinked.value },
    { label: 'OBS', value: obsConnected.value ? 'Connected' : 'Not connected', warn: !obsConnected.value },
    { label: 'Discord', value: discordLinked.value ? 'Linked' : 'Join / link', warn: !discordLinked.value },
  ]
})

watch(step, async (s) => {
  if (s === 2 || s === 3) await prefillGameFromUser()
  if (s === 3) await loadAccountState()
  if (s === 4 || s === 5) {
    try {
      const st = await window.api.obs.getStatus()
      obsConnected.value = st.connected
    } catch { /* ignore */ }
  }
  if (s === 5) await refreshDiscordStatus()
})

watch(selectedGame, async () => {
  accountError.value = ''
  accountSuccess.value = ''
  if (step.value === 3) {
    await loadAccountState()
  } else {
    showRiotForm.value = selectedGame.value === 'valorant' && riotAccounts.value.length === 0
  }
})

onMounted(async () => {
  await refreshAuthState()
  await ensureAuthedOrStay()
})

async function refreshAuthState() {
  const user = await window.api.auth.getUser()
  isAuthed.value = Boolean(user)
}

async function ensureAuthedOrStay() {
  const user = await window.api.auth.getUser()
  isAuthed.value = Boolean(user)
  if (user) {
    if (!isPreview.value) {
      step.value = Math.max(step.value, 2)
      await prefillGameFromUser()
    }
  }
}

async function prefillGameFromUser() {
  const user = (await window.api.auth.getUser()) as {
    primary_game?: string | null
    game_preference?: string | null
  } | null
  const raw = user?.primary_game ?? user?.game_preference
  if (isPrimaryGame(raw)) {
    selectedGame.value = raw
  }
}

function openRegister() {
  window.open('https://upforge.gg/register', '_blank')
}

async function handleSignIn() {
  signInError.value = ''
  signInLoading.value = true
  try {
    const result = await window.api.auth.login(email.value, password.value)
    if (result.ok) {
      isAuthed.value = true
      await prefillGameFromUser()
      nextStep()
    } else {
      signInError.value = (result as { error?: string }).error || 'Invalid email or password.'
    }
  } catch (e) {
    signInError.value = e instanceof Error ? e.message : 'Sign in failed'
  } finally {
    signInLoading.value = false
  }
}

async function loadAccountState() {
  accountError.value = ''
  accountSuccess.value = ''
  accountsLoading.value = true
  try {
    const refreshed = await window.api.auth.refreshUser().catch(() => null) as {
      riot_name?: string | null
      riot_tag?: string | null
      riot_region?: string | null
      riot_accounts?: RiotAccount[]
      max_valorant_accounts?: number
      tier?: string | null
      is_admin?: boolean
      deadlock_account_id?: number | null
      lol_riot_name?: string | null
      lol_riot_tag?: string | null
      lol_platform?: string | null
      primary_game?: string | null
      game_preference?: string | null
    } | null

    if (selectedGame.value === 'valorant') {
      let accounts: RiotAccount[] = []
      let max = resolveMaxValorantAccounts({
        tier: refreshed?.tier,
        isAdmin: refreshed?.is_admin,
        userMax: refreshed?.max_valorant_accounts,
      })
      try {
        const result = await window.api.auth.listRiotAccounts()
        accounts = Array.isArray(result?.accounts) ? result.accounts : []
        max = resolveMaxValorantAccounts({
          apiMax: result?.max,
          tier: refreshed?.tier,
          isAdmin: refreshed?.is_admin,
          userMax: refreshed?.max_valorant_accounts,
        })
      } catch {
        accounts = []
      }

      // Fallback: session still has a single Riot mirror before / when list is empty
      if (!accounts.length) {
        const user = refreshed ?? (await window.api.auth.getUser()) as {
          riot_name?: string | null
          riot_tag?: string | null
          riot_region?: string | null
          riot_accounts?: RiotAccount[]
          max_valorant_accounts?: number
          tier?: string | null
          is_admin?: boolean
        } | null
        if (user?.riot_accounts?.length) {
          accounts = user.riot_accounts
          max = resolveMaxValorantAccounts({
            apiMax: max,
            tier: user.tier ?? refreshed?.tier,
            isAdmin: user.is_admin ?? refreshed?.is_admin,
            userMax: user.max_valorant_accounts,
          })
        } else if (user?.riot_name?.trim() && user?.riot_tag?.trim()) {
          accounts = [{
            id: 0,
            riot_name: user.riot_name.trim(),
            riot_tag: user.riot_tag.trim(),
            riot_region: user.riot_region ?? null,
            is_active: true,
          }]
          max = resolveMaxValorantAccounts({
            apiMax: max,
            tier: user.tier ?? refreshed?.tier,
            isAdmin: user.is_admin ?? refreshed?.is_admin,
            userMax: user.max_valorant_accounts,
          })
        }
      }

      riotAccounts.value = accounts
      riotAccountsMax.value = max
      showRiotForm.value = accounts.length === 0
    } else if (selectedGame.value === 'cs2') {
      const settings = await window.api.settings.get()
      cs2SteamName.value = settings.cs2SteamName?.trim() || ''
      cs2Linked.value = Boolean(cs2SteamName.value)
      try {
        const faceit = await window.api.cs2.getFaceitConnection()
        if (faceit?.connected && faceit.nickname) faceitNickname.value = faceit.nickname
      } catch { /* optional */ }
    } else if (selectedGame.value === 'deadlock') {
      const user = (await window.api.auth.getUser()) as { deadlock_account_id?: number | null } | null
      deadlockLinked.value = Boolean(user?.deadlock_account_id)
    } else {
      const user = (await window.api.auth.getUser()) as {
        lol_riot_name?: string | null
        lol_riot_tag?: string | null
        lol_platform?: string | null
      } | null
      if (user?.lol_riot_name && user?.lol_riot_tag) {
        lolLinked.value = true
        lolDisplayName.value = `${user.lol_riot_name}#${user.lol_riot_tag}`
        if (user.lol_platform) lolPlatform.value = user.lol_platform
      } else {
        lolLinked.value = false
        lolDisplayName.value = ''
      }
    }
  } catch {
    accountError.value = 'Could not load account status. You can continue and link in Settings.'
  } finally {
    accountsLoading.value = false
  }
}

async function refreshDiscordStatus() {
  try {
    await window.api.auth.refreshUser().catch(() => null)
    const user = (await window.api.auth.getUser()) as { discord_username?: string | null } | null
    discordLinked.value = Boolean(user?.discord_username?.trim())
  } catch {
    discordLinked.value = false
  }
}

async function linkValorant() {
  accountError.value = ''
  accountSuccess.value = ''
  if (!riotName.value.trim() || !riotTag.value.trim()) {
    accountError.value = 'Enter your Riot name and tag (e.g. PlayerName + 1234).'
    return
  }
  riotBusy.value = true
  try {
    if (isPreview.value) {
      accountSuccess.value = 'Preview only · not saved'
      return
    }
    const result = await window.api.auth.linkRiotAccount({
      riot_name: riotName.value.trim(),
      riot_tag: riotTag.value.trim().replace(/^#/, ''),
      riot_region: riotRegion.value,
    })
    if (!result.ok) {
      accountError.value = result.error || 'Could not link Riot account'
      return
    }
    riotName.value = ''
    riotTag.value = ''
    accountSuccess.value = 'Riot account linked'
    showRiotForm.value = false
    await loadAccountState()
    await window.api.app.refreshDashboard().catch(() => null)
  } finally {
    riotBusy.value = false
  }
}

async function activateRiot(id: number) {
  if (isPreview.value) return
  riotBusy.value = true
  accountError.value = ''
  try {
    const result = await window.api.auth.activateRiotAccount(id)
    if (!result.ok) {
      accountError.value = result.error || 'Could not set active account'
      return
    }
    await loadAccountState()
  } finally {
    riotBusy.value = false
  }
}

async function saveCs2() {
  accountError.value = ''
  if (!cs2SteamName.value.trim()) {
    accountError.value = 'Enter your Steam / in-game name.'
    return
  }
  accountBusy.value = true
  try {
    if (!isPreview.value) {
      await window.api.settings.save({ cs2SteamName: cs2SteamName.value.trim() })
    }
    cs2Linked.value = true
    accountSuccess.value = 'CS2 name saved'
  } catch {
    accountError.value = 'Could not save CS2 name'
  } finally {
    accountBusy.value = false
  }
}

async function linkFaceit() {
  if (!faceitNickname.value.trim()) {
    accountError.value = 'Enter a FACEIT nickname.'
    return
  }
  accountBusy.value = true
  accountError.value = ''
  try {
    if (isPreview.value) {
      accountSuccess.value = 'Preview only · not saved'
      return
    }
    const result = await window.api.cs2.connectFaceit(faceitNickname.value.trim())
    if (!result.ok) {
      accountError.value = result.error || 'Could not link FACEIT'
      return
    }
    accountSuccess.value = 'FACEIT linked'
  } finally {
    accountBusy.value = false
  }
}

async function searchDeadlock() {
  const q = steamSearch.value.trim()
  if (!q) {
    accountError.value = 'Enter a Steam name or ID.'
    return
  }
  accountBusy.value = true
  accountError.value = ''
  steamResults.value = []
  try {
    steamResults.value = await window.api.deadlock.searchPlayers(q)
    if (!steamResults.value.length) accountError.value = 'No players found'
  } catch {
    accountError.value = 'Search failed'
  } finally {
    accountBusy.value = false
  }
}

async function connectDeadlock(accountId: number) {
  accountBusy.value = true
  accountError.value = ''
  try {
    if (isPreview.value) {
      deadlockLinked.value = true
      accountSuccess.value = 'Preview only · not saved'
      return
    }
    const result = await window.api.deadlock.connectAccount(accountId)
    if (!result?.ok && result?.error) {
      accountError.value = result.error
      return
    }
    deadlockLinked.value = true
    steamResults.value = []
    accountSuccess.value = 'Steam connected'
  } catch (e) {
    accountError.value = e instanceof Error ? e.message : 'Could not connect'
  } finally {
    accountBusy.value = false
  }
}

async function linkLol() {
  accountError.value = ''
  if (!lolName.value.trim() || !lolTag.value.trim()) {
    accountError.value = 'Enter your League Riot name and tag.'
    return
  }
  accountBusy.value = true
  try {
    if (isPreview.value) {
      lolLinked.value = true
      lolDisplayName.value = `${lolName.value.trim()}#${lolTag.value.trim().replace(/^#/, '')}`
      accountSuccess.value = 'Preview only · not saved'
      return
    }
    const result = await window.api.auth.linkLolAccount({
      riot_name: lolName.value.trim(),
      riot_tag: lolTag.value.trim().replace(/^#/, ''),
      lol_platform: lolPlatform.value,
    })
    if (!result.ok) {
      accountError.value = result.error || 'Could not link League account'
      return
    }
    lolLinked.value = true
    lolDisplayName.value = `${lolName.value.trim()}#${lolTag.value.trim().replace(/^#/, '')}`
    accountSuccess.value = 'League account linked'
  } finally {
    accountBusy.value = false
  }
}

function openObsDownload() {
  window.open(OBS_DOWNLOAD_URL, '_blank')
}

function openDiscordLink() {
  void window.api.app.openWebShell('/profile#discord').catch(() => {
    window.open('https://upforge.gg/profile#discord', '_blank')
  })
}

async function connectObs() {
  obsConnecting.value = true
  obsError.value = ''
  try {
    const result = await window.api.obs.connect()
    if (result.ok) {
      obsConnected.value = true
      clearObsSkipFlag()
    } else {
      obsError.value =
        result.error
        ?? 'Could not connect. Install OBS, open it, enable WebSocket, then try Connect only.'
    }
  } catch (e) {
    obsError.value = e instanceof Error ? e.message : 'Connection failed'
  } finally {
    obsConnecting.value = false
  }
}

async function launchAndConnectObs() {
  obsConnecting.value = true
  obsError.value = ''
  try {
    const result = await window.api.obs.launchAndConnect()
    if (result.ok) {
      obsConnected.value = true
      clearObsSkipFlag()
    } else {
      obsError.value =
        result.error
        ?? 'Could not launch OBS automatically. Download it, open it yourself, then use Connect only.'
    }
  } catch (e) {
    obsError.value = e instanceof Error ? e.message : 'Launch failed'
  } finally {
    obsConnecting.value = false
  }
}

async function repairObsSetup() {
  obsRepairRunning.value = true
  obsSetupMessage.value = ''
  obsSetupMessageError.value = false
  try {
    const result = await window.api.obs.repairSetup()
    if (result.ok) {
      obsSetupMessage.value = result.sceneCreated || result.inputCreated
        ? 'UpForge scene repaired in OBS'
        : 'UpForge scene is already configured'
    } else {
      obsSetupMessage.value = result.error ?? result.userMessage ?? 'Repair setup failed'
      obsSetupMessageError.value = true
    }
  } catch (e) {
    obsSetupMessage.value = e instanceof Error ? e.message : 'Repair setup failed'
    obsSetupMessageError.value = true
  } finally {
    obsRepairRunning.value = false
  }
}

async function testObsRecording() {
  obsTestRecordingRunning.value = true
  obsSetupMessage.value = ''
  obsSetupMessageError.value = false
  try {
    const result = await window.api.obs.testRecording()
    if (result.ok) {
      const sizeKb = result.fileSizeBytes ? Math.round(result.fileSizeBytes / 1024) : 0
      obsSetupMessage.value = `Test recording passed (${sizeKb} KB)`
    } else {
      obsSetupMessage.value = result.error ?? result.userMessage ?? 'Test recording failed'
      obsSetupMessageError.value = true
    }
  } catch (e) {
    obsSetupMessage.value = e instanceof Error ? e.message : 'Test recording failed'
    obsSetupMessageError.value = true
  } finally {
    obsTestRecordingRunning.value = false
  }
}

function clearObsSkipFlag() {
  try {
    localStorage.removeItem(OBS_SKIP_KEY)
  } catch { /* ignore */ }
}

function continueFromObs() {
  if (!obsConnected.value) {
    try {
      localStorage.setItem(OBS_SKIP_KEY, '1')
    } catch { /* ignore */ }
  } else {
    clearObsSkipFlag()
  }
  nextStep()
}

function nextStep() {
  if (step.value === 1 && !isAuthed.value && !isPreview.value) return
  slideDir.value = 'slide-left'
  step.value = Math.min(step.value + 1, TOTAL_STEPS)
}

function prevStep() {
  slideDir.value = 'slide-right'
  step.value = Math.max(step.value - 1, 1)
}

async function handleComplete() {
  if (saving.value) return
  completeError.value = ''
  if (isPreview.value) {
    router.push('/dashboard')
    return
  }
  saving.value = true
  try {
    const current = await window.api.settings.get()
    await window.api.settings.save({
      onboardingComplete: true,
      firstRun: false,
      primaryGame: selectedGame.value,
      trainerMouse: {
        ...current.trainerMouse,
        game: selectedGame.value,
      },
    })
    router.push('/dashboard')
  } catch (e) {
    console.error('[Onboarding] Failed to save settings:', e)
    completeError.value = 'Could not save setup. Check your connection and try again.'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.wiz-root {
  background: #111111;
  position: relative;
}

.wiz-shell {
  background: #111111;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.05) inset,
    0 24px 80px rgba(0, 0, 0, 0.55);
}

.wiz-step {
  padding: 28px 28px 32px;
}

.wiz-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}

.wiz-shell :deep(.btn-primary) {
  box-shadow: none;
  padding: 10px 16px;
}

.wiz-shell :deep(.btn-primary:hover:not(:disabled)) {
  box-shadow: none;
  filter: brightness(1.1);
  transform: none;
}

.wiz-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.wiz-input:focus {
  border-color: rgba(255, 70, 85, 0.4);
  background: rgba(255, 255, 255, 0.05);
}

.wiz-input::placeholder {
  color: #4b5563;
}

.slide-left-enter-active,
.slide-right-enter-active {
  transition: all 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-left-leave-active,
.slide-right-leave-active {
  transition: all 0.24s cubic-bezier(0.4, 0, 0.2, 1);
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.slide-left-enter-from {
  transform: translateX(40px);
  opacity: 0;
}
.slide-left-leave-to {
  transform: translateX(-40px);
  opacity: 0;
}

.slide-right-enter-from {
  transform: translateX(-40px);
  opacity: 0;
}
.slide-right-leave-to {
  transform: translateX(40px);
  opacity: 0;
}
</style>
