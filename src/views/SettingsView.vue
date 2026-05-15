<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- Sticky tab bar -->
    <nav class="flex gap-0.5 px-3 pt-3 pb-2.5 border-b border-white/[0.05] flex-shrink-0">
      <button
        v-for="tab in SETTINGS_TABS"
        :key="tab.id"
        :class="[
          'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
          activeTab === tab.id
            ? 'bg-red-500/[0.12] text-red-400 ring-1 ring-red-500/20'
            : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
        ]"
        @click="activeTab = tab.id"
      >{{ tab.label }}</button>
    </nav>

    <!-- Scrollable content -->
    <div class="px-3 py-3 space-y-4 overflow-y-auto flex-1 min-h-0">

    <!-- Account card -->
    <section v-show="activeTab === 'general'">
      <h3 class="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Account</h3>
      <div v-if="user" class="bg-white/[0.02] border border-white/[0.05] rounded-xl overflow-hidden">
        <div class="flex items-center justify-between px-3 py-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500/30 to-orange-600/30 border border-white/[0.08] flex items-center justify-center flex-shrink-0">
              <span class="text-xs font-bold text-red-400">{{ user.name?.charAt(0).toUpperCase() }}</span>
            </div>
            <div class="min-w-0">
              <p class="text-xs font-medium truncate">{{ user.name }}</p>
              <p class="text-xs truncate mt-px">
                <span v-if="user.riot_name" class="text-red-400/70">{{ user.riot_name }}#{{ user.riot_tag }}</span>
                <span v-else class="text-gray-600 italic">No Riot ID linked</span>
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0 ml-2">
            <span
              class="text-xs px-2 py-0.5 rounded-full border capitalize"
              :class="getTierClass(user.tier)"
            >{{ user.tier || 'free' }}</span>
          </div>
        </div>
        <div class="flex items-center gap-2 px-3 py-2 border-t border-white/[0.04]">
          <button
            class="flex-1 text-xs text-gray-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg py-1.5 transition-colors"
            @click="openBilling"
          >Manage subscription</button>
          <button
            class="text-xs text-gray-600 hover:text-red-400 transition-colors px-3 py-1.5"
            @click="handleLogout"
          >Sign out</button>
        </div>
      </div>
      <div v-else class="h-[72px] bg-white/[0.02] border border-white/[0.05] rounded-xl animate-pulse" />
    </section>

    <!-- Usage / quota -->
    <section v-if="user && (user as UserWithUsage).analyses_used !== undefined" v-show="activeTab === 'general'">
      <h3 class="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Usage</h3>
      <div class="px-3 py-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl space-y-1.5">
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-400">Analyses this month</span>
          <span class="text-gray-300 font-medium tabular-nums">
            {{ (user as UserWithUsage).analyses_used }} / {{ (user as UserWithUsage).analyses_limit }}
          </span>
        </div>
        <div v-if="(user as UserWithUsage).analyses_limit" class="h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full transition-all"
            :style="{ width: usagePercent + '%' }"
          />
        </div>
      </div>
      <!-- Upgrade nudge when near/at limit -->
      <div
        v-if="usagePercent >= 80 && (user as UserWithUsage).analyses_limit && (user as UserWithUsage).analyses_limit! <= 5"
        class="mt-2 px-3 py-2.5 bg-purple-500/[0.07] border border-purple-500/20 rounded-xl"
      >
        <p class="text-xs text-purple-300 font-medium">
          {{ usagePercent >= 100 ? 'You\'ve used all your analyses this month.' : 'Running low on analyses.' }}
        </p>
        <p class="text-xs text-purple-400/60 mt-0.5 mb-2">Upgrade for more analyses and full history access.</p>
        <button
          class="w-full py-1.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white text-xs font-semibold rounded-lg transition-all shadow-sm shadow-purple-900/30"
          @click="openUpgrade"
        >Upgrade Plan →</button>
      </div>
    </section>

    <!-- Recording settings -->
    <section v-show="activeTab === 'recording'">
      <h3 class="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Recording</h3>
      <div class="px-3 py-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl space-y-3">
        <div>
          <label class="block text-xs text-gray-500 mb-1.5">Record game modes</label>
          <div class="grid grid-cols-2 gap-1">
            <button
              v-for="mode in GAME_MODES"
              :key="mode.value"
              :class="[
                'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all text-left',
                settings.recordedModes.includes(mode.value)
                  ? 'bg-red-500/[0.1] border-red-500/25 text-gray-200'
                  : 'bg-transparent border-white/[0.06] text-gray-600 hover:border-white/[0.1] hover:text-gray-400'
              ]"
              @click="toggleMode(mode.value)"
            >
              <div
                :class="[
                  'w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors',
                  settings.recordedModes.includes(mode.value) ? 'bg-red-500 border-red-500' : 'bg-transparent border-white/[0.2]'
                ]"
              >
                <svg v-if="settings.recordedModes.includes(mode.value)" class="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3.5" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <div class="min-w-0">
                <span class="text-xs font-medium leading-none block truncate">{{ mode.label }}</span>
                <span v-if="mode.hint" class="text-xs text-gray-700 leading-none block mt-0.5">{{ mode.hint }}</span>
              </div>
            </button>
          </div>
          <p class="text-xs text-gray-700 mt-1.5 px-0.5">Games in unselected modes will not be recorded.</p>
        </div>
        <!-- Quality + FPS side by side -->
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Quality</label>
            <select
              v-model="settings.recordingQuality"
              class="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white focus:outline-none focus:border-red-500/30 transition-colors"
              @change="debouncedSave"
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Frame rate</label>
            <select
              v-model.number="settings.recordingFps"
              class="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white focus:outline-none focus:border-red-500/30 transition-colors"
              @change="debouncedSave"
            >
              <option :value="24">24 FPS</option>
              <option :value="30">30 FPS</option>
              <option :value="60">60 FPS</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">Capture monitor</label>
          <select
            v-model="settings.captureMonitor"
            class="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white focus:outline-none focus:border-red-500/30 transition-colors"
            @change="debouncedSave"
          >
            <option value="auto">Auto-detect (recommended)</option>
            <option :value="0">Monitor 1 (primary)</option>
            <option :value="1">Monitor 2</option>
            <option :value="2">Monitor 3</option>
          </select>
          <p class="text-xs text-gray-700 mt-1 px-0.5">Only needed if auto-detect captures the wrong screen.</p>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">Bitrate</label>
          <select
            v-model.number="settings.recordingBitrate"
            class="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white focus:outline-none focus:border-red-500/30 transition-colors"
            @change="debouncedSave"
          >
            <option :value="4">4 Mbps — ~1.8 GB/hr (720p 30fps)</option>
            <option :value="6">6 Mbps — ~2.7 GB/hr (720p 60fps)</option>
            <option :value="8">8 Mbps — ~3.6 GB/hr (1080p 30fps)</option>
            <option :value="12">12 Mbps — ~5.4 GB/hr (1080p 30fps high)</option>
            <option :value="15">15 Mbps — ~6.8 GB/hr (1080p 60fps)</option>
            <option :value="20">20 Mbps — ~9.0 GB/hr (1080p 60fps high)</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">Save location</label>
          <div class="flex gap-1.5">
            <input
              :value="settings.savePath"
              readonly
              class="flex-1 min-w-0 px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-gray-400 cursor-default truncate"
            />
            <button
              class="px-2.5 py-1.5 text-xs text-gray-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] rounded-lg transition-colors flex-shrink-0"
              @click="changeSavePath"
            >Change</button>
          </div>
        </div>

        <!-- Storage usage -->
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs text-gray-500">Storage used</p>
            <p class="text-xs text-gray-700 mt-0.5">
              {{ storageCount === 0 ? 'No recordings saved' : `${storageCount} file${storageCount === 1 ? '' : 's'} · ${formatBytes(storageBytes)}` }}
            </p>
          </div>
          <button
            class="px-2.5 py-1.5 text-xs text-gray-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] rounded-lg transition-colors flex-shrink-0"
            @click="openRecordingsFolder"
          >Open folder</button>
        </div>

        <div>
          <label class="block text-xs text-gray-500 mb-1">Auto-delete clips after</label>
          <select
            v-model.number="settings.clipRetentionDays"
            class="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white focus:outline-none focus:border-red-500/30 transition-colors"
            @change="debouncedSave"
          >
            <option :value="0">Never (keep all clips)</option>
            <option :value="7">After 7 days</option>
            <option :value="14">After 14 days</option>
            <option :value="30">After 30 days</option>
            <option :value="60">After 60 days</option>
          </select>
          <p class="text-xs text-gray-700 mt-1 px-0.5">Local-only clips older than this are deleted on startup.</p>
        </div>
      </div>
    </section>

    <!-- Mouse & Trainer -->
    <section v-show="activeTab === 'trainer'">
      <h3 class="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Mouse & Trainer</h3>
      <div class="px-3 py-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl space-y-3">

        <!-- Game dropdown -->
        <div>
          <label class="block text-xs text-gray-500 mb-1">Game</label>
          <select
            v-model="settings.trainerMouse.game"
            class="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white focus:outline-none focus:border-red-500/30 transition-colors"
            @change="debouncedSave"
          >
            <option value="valorant">Valorant</option>
            <option value="cs2">CS2</option>
            <option value="apex">Apex Legends</option>
            <option value="overwatch2">Overwatch 2</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <!-- DPI quick-picks + custom input -->
        <div>
          <label class="block text-xs text-gray-500 mb-1.5">Mouse DPI</label>
          <div class="flex gap-1.5 mb-1.5">
            <button
              v-for="preset in [400, 800, 1600, 3200]"
              :key="preset"
              class="flex-1 py-1 text-[11px] font-semibold rounded-lg border transition-all"
              :class="settings.trainerMouse.dpi === preset
                ? 'border-[#ff4655]/50 text-[#ff4655]'
                : 'bg-white/[0.03] border-white/[0.07] text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]'"
              :style="settings.trainerMouse.dpi === preset ? { background: 'rgba(255,70,85,0.1)' } : {}"
              @click="settings.trainerMouse.dpi = preset; debouncedSave()"
            >{{ preset }}</button>
          </div>
          <input
            type="number"
            v-model.number="settings.trainerMouse.dpi"
            min="100"
            max="32000"
            step="100"
            placeholder="Custom DPI"
            class="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white focus:outline-none focus:border-[#ff4655]/30 transition-colors"
            @change="debouncedSave"
          />
        </div>

        <!-- Sensitivity -->
        <div>
          <label class="block text-xs text-gray-500 mb-1">In-game Sensitivity</label>
          <input
            type="number"
            v-model.number="settings.trainerMouse.sensitivity"
            min="0.01"
            max="20"
            step="0.01"
            class="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white focus:outline-none focus:border-[#ff4655]/30 transition-colors"
            @change="debouncedSave"
          />
        </div>

        <!-- eDPI display with visual bar -->
        <div class="px-3 py-2 bg-white/[0.02] border border-white/[0.04] rounded-lg">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-gray-600">eDPI</span>
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold font-mono tabular-nums text-gray-200">{{ Math.round(settings.trainerMouse.dpi * settings.trainerMouse.sensitivity) }}</span>
              <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                :class="eDpiLevelClass(settings.trainerMouse.dpi * settings.trainerMouse.sensitivity)"
              >{{ eDpiLabel(settings.trainerMouse.dpi * settings.trainerMouse.sensitivity) }}</span>
            </div>
          </div>
          <div class="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="eDpiBarClass(settings.trainerMouse.dpi * settings.trainerMouse.sensitivity)"
              :style="{ width: Math.min(100, (settings.trainerMouse.dpi * settings.trainerMouse.sensitivity) / 30) + '%' }"
            />
          </div>
          <p class="text-[10px] text-gray-700 mt-1.5">eDPI = DPI × sensitivity — calibrates aim trainer to match your in-game feel</p>
        </div>

        <!-- FOV + Polling Rate row -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Horizontal FOV</label>
            <input
              type="number"
              v-model.number="settings.trainerMouse.fov"
              min="60"
              max="120"
              step="1"
              class="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white focus:outline-none focus:border-red-500/30 transition-colors"
              @change="debouncedSave"
            />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Polling Rate (Hz)</label>
            <select
              v-model.number="settings.trainerMouse.pollingRate"
              class="w-full px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.07] rounded-lg text-xs text-white focus:outline-none focus:border-red-500/30 transition-colors"
              @change="debouncedSave"
            >
              <option :value="125">125 Hz</option>
              <option :value="250">250 Hz</option>
              <option :value="500">500 Hz</option>
              <option :value="1000">1000 Hz</option>
              <option :value="2000">2000 Hz</option>
              <option :value="4000">4000 Hz</option>
            </select>
          </div>
        </div>

        <!-- Raw input toggle -->
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs text-gray-300">Raw Input</p>
            <p class="text-xs text-gray-600 mt-0.5">Bypass Windows pointer acceleration</p>
          </div>
          <button
            :class="[
              'relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ml-4 overflow-hidden',
              settings.trainerMouse.rawInput ? 'bg-[#ff4655]' : 'bg-white/[0.1]'
            ]"
            @click="settings.trainerMouse.rawInput = !settings.trainerMouse.rawInput; debouncedSave()"
          >
            <span
              :class="[
                'absolute top-[2px] left-0 w-[14px] h-[14px] bg-white rounded-full shadow transition-transform',
                settings.trainerMouse.rawInput ? 'translate-x-[18px]' : 'translate-x-[2px]'
              ]"
            />
          </button>
        </div>

      </div>
    </section>

    <!-- Crosshair -->
    <section v-show="activeTab === 'trainer'">
      <h3 class="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Crosshair</h3>
      <div class="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
        <crosshair-settings-panel
          v-model="settings.crosshairSettings"
          @update:model-value="debouncedSave()"
        />
      </div>
    </section>

    <!-- Audio settings -->
    <section v-show="activeTab === 'recording'">
      <h3 class="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Audio</h3>
      <div class="bg-white/[0.02] border border-white/[0.05] rounded-xl divide-y divide-white/[0.04]">
        <div class="flex items-center justify-between px-3 py-2.5">
          <div>
            <p class="text-xs text-gray-300">Record game audio</p>
            <p class="text-xs text-gray-600 mt-0.5">Capture desktop audio in recordings</p>
          </div>
          <button
            :class="[
              'relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ml-4 overflow-hidden',
              settings.audioEnabled ? 'bg-red-500' : 'bg-white/[0.1]'
            ]"
            @click="toggleAudio"
          >
            <span
              :class="[
                'absolute top-[2px] left-0 w-[14px] h-[14px] bg-white rounded-full shadow transition-transform',
                settings.audioEnabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
              ]"
            />
          </button>
        </div>
      </div>
      <!-- Audio capture diagnostic -->
      <div v-if="fixingAudio" class="mt-1.5 px-0.5">
        <p class="text-xs text-gray-500">
          <span class="animate-pulse">●</span> Detecting audio capture…
        </p>
      </div>
      <div v-else-if="audioStatus !== null && audioStatus.winAudioMode === false" class="mt-1.5 px-0.5 space-y-1">
        <p class="text-xs text-amber-400/80">
          <template v-if="isMac">
            ⚠️ No virtual audio device found. Install
            <a href="https://existential.audio/blackhole/" target="_blank" class="underline hover:text-amber-300">BlackHole</a>
            to capture desktop/game audio.
          </template>
          <template v-else>
            ⚠️ Desktop audio capture unavailable. UpForge can attempt to auto-fix this for you.
          </template>
        </p>
        <button
          v-if="!isMac"
          class="text-xs bg-white/[0.07] hover:bg-white/[0.12] text-white px-3 py-1.5 rounded-lg transition-colors"
          @click="fixAudio"
        >
          Fix Audio Automatically
        </button>
        <button
          v-else
          class="text-xs bg-white/[0.07] hover:bg-white/[0.12] text-white px-3 py-1.5 rounded-lg transition-colors"
          @click="fixAudio"
        >
          Re-check Audio Devices
        </button>
      </div>
      <p v-else-if="audioStatus !== null && audioStatus.winAudioMode === 'desktop-capturer'" class="text-xs text-green-500/80 mt-1.5 px-0.5">
        ✓ Built-in audio capture active <span class="text-gray-600">(system audio via browser engine)</span>.
      </p>
      <p v-else-if="audioStatus !== null && audioStatus.winAudioMode" class="text-xs text-green-500/80 mt-1.5 px-0.5">
        ✓ Desktop audio capture ready
        <span v-if="audioStatus.winAudioMode?.startsWith('dshow:')" class="text-gray-600"> (Stereo Mix)</span>
        <span v-else-if="audioStatus.winAudioMode?.startsWith('wasapi')" class="text-gray-600"> (WASAPI loopback)</span>
        <span v-else-if="audioStatus.winAudioMode?.startsWith('avfoundation:')" class="text-gray-600"> (virtual loopback)</span>.
      </p>
    </section>

    <!-- Behaviour toggles -->
    <section v-show="activeTab === 'general'">
      <h3 class="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Behaviour</h3>
      <div class="bg-white/[0.02] border border-white/[0.05] rounded-xl divide-y divide-white/[0.04]">
        <div
          v-for="toggle in toggles"
          :key="toggle.key"
          class="flex items-center justify-between px-3 py-2.5"
        >
          <div>
            <p class="text-xs text-gray-300">{{ toggle.label }}</p>
            <p v-if="toggle.hint" class="text-xs text-gray-600 mt-0.5">{{ toggle.hint }}</p>
          </div>
          <button
            :class="[
              'relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ml-4 overflow-hidden',
              settings[toggle.key] ? 'bg-red-500' : 'bg-white/[0.1]'
            ]"
            @click="toggle.key === 'launchOnStartup' ? toggleLaunchOnStartup() : toggleKey(toggle.key)"
          >
            <span
              :class="[
                'absolute top-[2px] left-0 w-[14px] h-[14px] bg-white rounded-full shadow transition-transform',
                settings[toggle.key] ? 'translate-x-[18px]' : 'translate-x-[2px]'
              ]"
            />
          </button>
        </div>
      </div>
    </section>

    <!-- Shortcuts -->
    <section v-show="activeTab === 'trainer'">
      <h3 class="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">Shortcuts</h3>
      <div class="bg-white/[0.02] border border-white/[0.05] rounded-xl overflow-hidden divide-y divide-white/[0.04]">

        <!-- Static: open window -->
        <div class="flex items-center justify-between px-3 py-2.5">
          <div>
            <p class="text-xs text-gray-300">Open / focus window</p>
            <p class="text-xs text-gray-600 mt-0.5">Cannot be changed</p>
          </div>
          <div class="flex items-center gap-1">
            <kbd class="px-1.5 py-0.5 text-xs bg-white/[0.06] border border-white/[0.1] rounded text-gray-400">Ctrl</kbd>
            <span class="text-xs text-gray-600">+</span>
            <kbd class="px-1.5 py-0.5 text-xs bg-white/[0.06] border border-white/[0.1] rounded text-gray-400">Shift</kbd>
            <span class="text-xs text-gray-600">+</span>
            <kbd class="px-1.5 py-0.5 text-xs bg-white/[0.06] border border-white/[0.1] rounded text-gray-400">U</kbd>
          </div>
        </div>

        <!-- Configurable: save clip -->
        <div class="flex items-center justify-between px-3 py-2.5">
          <div>
            <p class="text-xs text-gray-300">Bookmark clip moment</p>
            <div v-if="hotkeyStatus['save-clip'] === false" class="flex items-center gap-1.5 mt-0.5">
              <svg class="w-3 h-3 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
              </svg>
              <p class="text-xs text-yellow-500/80">Failed to register — key may be in use</p>
            </div>
            <p v-else class="text-xs text-gray-600 mt-0.5">Press during a match to save a clip</p>
            <button
              v-if="hotkeyStatus['save-clip'] === false"
              class="mt-1.5 inline-flex items-center gap-1 text-xs text-yellow-400/80 hover:text-yellow-300 transition-colors"
              :disabled="conflictScanning"
              @click="findConflict"
            >
              <svg v-if="!conflictScanning" class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <svg v-else class="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              {{ conflictScanning ? 'Scanning…' : 'Find conflicting app' }}
            </button>
          </div>
          <button
            :class="[
              'min-w-[56px] px-2 py-1 rounded-lg border text-xs font-mono transition-all',
              rebinding === 'save-clip'
                ? 'bg-red-500/15 border-red-500/40 text-red-300 animate-pulse'
                : 'bg-white/[0.04] border-white/[0.08] text-gray-300 hover:border-white/[0.15] hover:text-white'
            ]"
            @click="startRebind('save-clip')"
          >
            {{ rebinding === 'save-clip' ? 'Press a key…' : formatKey(hotkeys['save-clip'] ?? 'F9') }}
          </button>
        </div>

        <!-- Configurable: toggle overlay -->
        <div class="flex items-center justify-between px-3 py-2.5">
          <div>
            <p class="text-xs text-gray-300">Toggle overlay</p>
            <p class="text-xs mt-0.5" :class="hotkeyStatus['toggle-overlay'] === false ? 'text-yellow-500/70' : 'text-gray-600'">
              {{ hotkeyStatus['toggle-overlay'] === false ? '⚠ Failed to register — key may be in use' : 'Show/hide the in-game overlay' }}
            </p>
          </div>
          <button
            :class="[
              'min-w-[56px] px-2 py-1 rounded-lg border text-xs font-mono transition-all',
              rebinding === 'toggle-overlay'
                ? 'bg-red-500/15 border-red-500/40 text-red-300 animate-pulse'
                : 'bg-white/[0.04] border-white/[0.08] text-gray-300 hover:border-white/[0.15] hover:text-white'
            ]"
            @click="startRebind('toggle-overlay')"
          >
            {{ rebinding === 'toggle-overlay' ? 'Press a key…' : formatKey(hotkeys['toggle-overlay'] ?? 'F10') }}
          </button>
        </div>

        <!-- Configurable: screenshot -->
        <div class="flex items-center justify-between px-3 py-2.5">
          <div>
            <p class="text-xs text-gray-300">Take screenshot</p>
            <p class="text-xs mt-0.5" :class="hotkeyStatus['take-screenshot'] === false ? 'text-yellow-500/70' : 'text-gray-600'">
              {{ hotkeyStatus['take-screenshot'] === false ? '⚠ Failed to register — key may be in use' : 'Save a screenshot during a match' }}
            </p>
          </div>
          <button
            :class="[
              'min-w-[56px] px-2 py-1 rounded-lg border text-xs font-mono transition-all',
              rebinding === 'take-screenshot'
                ? 'bg-red-500/15 border-red-500/40 text-red-300 animate-pulse'
                : 'bg-white/[0.04] border-white/[0.08] text-gray-300 hover:border-white/[0.15] hover:text-white'
            ]"
            @click="startRebind('take-screenshot')"
          >
            {{ rebinding === 'take-screenshot' ? 'Press a key…' : formatKey(hotkeys['take-screenshot'] ?? 'F8') }}
          </button>
        </div>

      </div>
      <p v-if="rebinding" class="text-xs text-gray-600 mt-1.5 px-0.5">Press Escape to cancel · changes apply immediately</p>

      <!-- Conflict finder results -->
      <Transition name="result-slide">
        <div v-if="conflictResults !== null" class="mt-2 rounded-xl border overflow-hidden" :class="conflictResults.found.length > 0 ? 'bg-yellow-500/[0.04] border-yellow-500/20' : 'bg-white/[0.02] border-white/[0.06]'">
          <div class="px-3 py-2.5 space-y-2">
            <template v-if="conflictResults.found.length > 0">
              <div class="flex items-center gap-2">
                <svg class="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                </svg>
                <p class="text-xs font-semibold text-yellow-400/90 uppercase tracking-widest">Conflicts detected</p>
              </div>
              <div v-for="c in conflictResults.found" :key="c.exe" class="pl-2 border-l border-yellow-500/20 space-y-0.5">
                <p class="text-xs text-gray-200 font-medium">{{ c.name }}</p>
                <p class="text-xs text-gray-500 leading-snug">{{ c.fix }}</p>
              </div>
            </template>
            <template v-else>
              <div class="flex items-center gap-2">
                <svg class="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                </svg>
                <p class="text-xs text-gray-400">No known conflicts found. Try rebinding to a different key.</p>
              </div>
            </template>
          </div>
          <div class="px-3 py-1.5 border-t border-white/[0.04]">
            <button class="text-xs text-gray-600 hover:text-gray-400 transition-colors" @click="conflictResults = null">Dismiss</button>
          </div>
        </div>
      </Transition>
    </section>

    <!-- OBS Integration -->
    <section v-if="user?.tier === 'pro'" v-show="activeTab === 'recording'">
      <h3 class="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">OBS Integration <span class="ml-1 text-red-400/80 normal-case tracking-normal font-normal">Pro</span></h3>
      <div class="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 space-y-3">
        <!-- Connection status -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div :class="['w-2 h-2 rounded-full flex-shrink-0', obsStatus?.connected ? 'bg-green-500' : 'bg-white/20']" />
            <span class="text-xs text-gray-300">
              <template v-if="obsStatus?.connected">
                OBS v{{ obsStatus.obsVersion ?? '?' }} connected
                <span v-if="obsStatus.recording" class="text-green-400 ml-1">· Recording</span>
                <span v-if="obsStatus.replayBufferActive" class="text-blue-400 ml-1">· Replay buffer active</span>
              </template>
              <template v-else>
                OBS not connected
              </template>
            </span>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="!obsStatus?.connected"
              :disabled="obsConnecting"
              class="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              @click="obsConnect"
            >
              {{ obsConnecting ? 'Connecting…' : 'Connect' }}
            </button>
            <button
              v-else
              class="text-xs bg-white/[0.07] hover:bg-white/[0.12] text-white px-3 py-1.5 rounded-lg transition-colors"
              @click="obsDisconnect"
            >
              Disconnect
            </button>
          </div>
        </div>

        <!-- Enable OBS toggle -->
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs text-gray-300">Use OBS for recording</p>
            <p class="text-xs text-gray-600 mt-0.5">Requires OBS 28+ with WebSocket server enabled</p>
          </div>
          <button
            :class="[
              'relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ml-4 overflow-hidden',
              settings.obsEnabled ? 'bg-red-500' : 'bg-white/[0.1]'
            ]"
            @click="settings.obsEnabled = !settings.obsEnabled; debouncedSave()"
          >
            <span :class="['absolute top-[2px] left-0 w-[14px] h-[14px] bg-white rounded-full shadow transition-transform', settings.obsEnabled ? 'translate-x-[18px]' : 'translate-x-[2px]']" />
          </button>
        </div>

        <!-- Host + Port -->
        <div class="grid grid-cols-[1fr_80px] gap-2">
          <div>
            <label class="text-xs text-gray-600 mb-1 block">WebSocket Host</label>
            <input
              v-model="settings.obsHost"
              type="text"
              class="w-full text-xs bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-white placeholder-gray-600 focus:outline-none focus:border-red-500/40"
              placeholder="localhost"
              @change="debouncedSave()"
            />
          </div>
          <div>
            <label class="text-xs text-gray-600 mb-1 block">Port</label>
            <input
              v-model.number="settings.obsPort"
              type="number"
              class="w-full text-xs bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-red-500/40"
              min="1"
              max="65535"
              @change="debouncedSave()"
            />
          </div>
        </div>

        <!-- Password -->
        <div>
          <label class="text-xs text-gray-600 mb-1 block">WebSocket Password <span class="text-gray-700">(leave blank if auth disabled)</span></label>
          <input
            v-model="settings.obsPassword"
            type="password"
            class="w-full text-xs bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-white placeholder-gray-600 focus:outline-none focus:border-red-500/40"
            placeholder="Optional"
            @change="debouncedSave()"
          />
        </div>

        <!-- Replay buffer seconds -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-gray-600">Replay buffer length</label>
            <span class="text-xs text-gray-400">{{ settings.obsReplayBufferSeconds }}s</span>
          </div>
          <input
            v-model.number="settings.obsReplayBufferSeconds"
            type="range"
            min="10"
            max="120"
            step="5"
            class="w-full accent-red-500"
            @input="debouncedSave()"
          />
          <p class="text-xs text-gray-700 mt-1">How many seconds of footage to save on each kill</p>
        </div>

        <!-- Error message -->
        <p v-if="obsStatus?.lastError" class="text-xs text-red-400/80">{{ obsStatus.lastError }}</p>
      </div>
    </section>

    <!-- OBS teaser (non-Pro) -->
    <section v-else-if="user && user.tier !== 'pro'" v-show="activeTab === 'recording'">
      <h3 class="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">OBS Integration</h3>
      <div class="flex items-center justify-between px-3 py-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl">
        <div class="flex items-center gap-2.5">
          <div class="w-6 h-6 rounded-md bg-white/[0.04] border border-white/[0.07] flex items-center justify-center flex-shrink-0">
            <svg class="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
          </div>
          <div>
            <p class="text-xs text-gray-500">Use OBS for recording with replay buffers</p>
            <p class="text-xs text-gray-700 mt-0.5">Available on Pro plan</p>
          </div>
        </div>
        <button
          class="flex-shrink-0 text-xs px-2.5 py-1 bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/25 text-red-400 hover:text-red-300 rounded-lg transition-colors"
          @click="openUpgrade"
        >Upgrade</button>
      </div>
    </section>

    <!-- System -->
    <section v-show="activeTab === 'system'">
      <h3 class="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2 px-0.5">System</h3>
      <div class="px-3 py-2.5 bg-white/[0.02] border border-white/[0.05] rounded-xl space-y-2.5">
        <!-- ffmpeg status -->
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs text-gray-400">Recording engine (ffmpeg)</p>
            <p v-if="ffmpegOk" class="text-xs text-green-500/70 mt-0.5">Ready</p>
            <p v-else class="text-xs text-yellow-500/70 mt-0.5">Not found — reinstall the app</p>
          </div>
          <div :class="['w-2 h-2 rounded-full flex-shrink-0', ffmpegOk ? 'bg-green-500' : 'bg-yellow-400']" />
        </div>

        <!-- Video encoder -->
        <div v-if="settings.cachedEncoder" class="flex items-center justify-between">
          <div>
            <p class="text-xs text-gray-400">Video encoder</p>
            <p class="text-xs text-green-500/70 mt-0.5">{{ encoderLabel }}</p>
          </div>
          <div class="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
        </div>

        <!-- Riot API connection test -->
        <div class="flex items-start justify-between">
          <div class="flex-1 min-w-0 pr-3">
            <p class="text-xs text-gray-400">Match Detection</p>
            <p v-if="riotApiResult === null" class="text-xs text-gray-600 mt-0.5">Open Valorant and start a match, then test</p>
            <p v-else-if="riotApiResult.processRunning && riotApiResult.logGameMode" class="text-xs text-green-500/70 mt-0.5 truncate">✓ In-game · {{ riotApiResult.logGameMode }} (log)</p>
            <p v-else-if="riotApiResult.processRunning && riotApiResult.gameMode" class="text-xs text-green-500/70 mt-0.5 truncate">✓ In-game · {{ riotApiResult.gameMode }} (api)</p>
            <p v-else-if="riotApiResult.processRunning" class="text-xs text-yellow-500/70 mt-0.5">✓ In-game process detected · mode unknown</p>
            <p v-else class="text-xs text-gray-600 mt-0.5">Not in a match · process={{ riotApiResult.processRunning }}</p>
          </div>
          <button
            class="text-xs text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0 mt-0.5"
            :disabled="testingRiotApi"
            @click="testRiotApi"
          >{{ testingRiotApi ? 'Testing…' : 'Test' }}</button>
        </div>
      </div>
    </section>

    <!-- Saved toast -->
    <Transition name="toast-slide">
      <div
        v-if="savedVisible"
        class="fixed bottom-5 right-5 flex items-center gap-2 px-4 py-2.5 bg-gray-900 border border-white/[0.08] rounded-xl shadow-xl text-sm text-white pointer-events-none"
      >
        <svg class="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
        </svg>
        {{ toastMessage || 'Settings saved' }}
      </div>
    </Transition>

    </div><!-- end scrollable content -->

    <!-- Persistent footer -->
    <div class="flex-shrink-0 px-3 pt-2 pb-3 border-t border-white/[0.04] space-y-2">
      <div class="flex items-center justify-between px-0.5">
        <p
          class="text-xs text-gray-700 cursor-default select-none"
          :class="{ 'text-amber-600': devTapCount > 0 && devTapCount < 5 }"
          @click="handleVersionTap"
        >UpForge Desktop v{{ appVersion }}<span v-if="devTapCount > 0 && devTapCount < 5" class="ml-1 text-amber-600/60">({{ 5 - devTapCount }} more)</span></p>
        <div class="flex items-center gap-3">
        <div class="flex items-center gap-3">
          <template v-if="!isDev">
            <button
              v-if="updatePhase === 'idle' || updatePhase === 'checking'"
              class="text-xs transition-colors"
              :class="updatePhase === 'checking' ? 'text-gray-500 cursor-default' : 'text-gray-600 hover:text-gray-400'"
              :disabled="updatePhase === 'checking'"
              @click="checkForUpdates"
            >{{ updatePhase === 'checking' ? 'Checking...' : updateUpToDate ? '✓ Up to date' : 'Check for updates' }}</button>
            <span v-else-if="updatePhase === 'downloading'" class="text-xs text-amber-500/80">Downloading {{ updatePercent }}%</span>
            <button
              v-else-if="updatePhase === 'ready'"
              class="text-xs text-red-400 hover:text-red-300 transition-colors"
              @click="installUpdate"
            >v{{ updateVersion }} ready · Restart now →</button>
          </template>
          <button class="text-xs text-gray-600 hover:text-gray-400 transition-colors" @click="openHelp">Get help</button>
          <button class="text-xs text-gray-600 hover:text-gray-400 transition-colors" @click="openSite">upforge.gg</button>
        </div>
      </div>
      <!-- Dev mode enabled indicator -->
      <div v-if="devModeActive" class="flex items-center justify-between px-0.5 py-1.5 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg">
        <div class="flex items-center gap-2">
          <div class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          <span class="text-xs text-amber-500/80 font-medium">Developer mode enabled</span>
        </div>
        <button class="text-xs text-amber-700 hover:text-amber-500 transition-colors" @click="disableDevMode">Disable</button>
      </div>
    </div>

  </div><!-- end flex column -->
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, toRaw } from 'vue'
import { useRouter } from 'vue-router'
import type { AppSettings } from '../env.d.ts'
import { getTierClass, getTierBadgeClass, formatGameMode } from '../lib/valorant'
import CrosshairSettingsPanel from '../components/CrosshairSettingsPanel.vue'

type UserWithUsage = {
  name: string
  email: string
  tier: string
  riot_name: string | null
  riot_tag: string | null
  analyses_used?: number
  analyses_limit?: number
}

const router = useRouter()
const user = ref<UserWithUsage | null>(null)

const SETTINGS_TABS = [
  { id: 'general',   label: 'General'   },
  { id: 'recording', label: 'Recording' },
  { id: 'trainer',   label: 'Trainer'   },
  { id: 'system',    label: 'System'    },
] as const
type SettingsTab = typeof SETTINGS_TABS[number]['id']
const activeTab = ref<SettingsTab>('general')

const appVersion = ref(__APP_VERSION__)
const isDev = ref(false)
const updatePhase = ref('idle')
const updateVersion = ref<string | undefined>(undefined)
const updatePercent = ref(0)
const updateUpToDate = ref(false) // brief "Up to date" flash
let upToDateTimer: ReturnType<typeof setTimeout> | null = null
const savedVisible = ref(false)
const storageBytes = ref(0)
const storageCount = ref(0)
const ffmpegOk = ref(true)
const isMac = ref(navigator.userAgent.toLowerCase().includes('mac'))
const audioStatus = ref<{ winAudioMode: string | false | null; audioEnabled: boolean } | null>(null)
const fixingAudio = ref(false)
const testingRiotApi = ref(false)
const riotApiResult = ref<{ portOpen: boolean; gameMode: string | null; logGameMode: string | null; processRunning: boolean } | null>(null)
let saveTimer: ReturnType<typeof setTimeout> | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null
const toastMessage = ref('')

// ── Dev mode unlock (tap version 5×) ─────────────────────────────────────────
const devModeActive = ref(false)
const devTapCount = ref(0)
let devTapTimer: ReturnType<typeof setTimeout> | null = null

async function handleVersionTap() {
  if (devModeActive.value) return
  devTapCount.value++
  if (devTapTimer) clearTimeout(devTapTimer)
  if (devTapCount.value >= 5) {
    devTapCount.value = 0
    devModeActive.value = true
    await window.api.settings.save({ devModeEnabled: true })
    showToast('Developer mode enabled — check the nav bar')
  } else {
    devTapTimer = setTimeout(() => { devTapCount.value = 0 }, 3000)
  }
}

async function disableDevMode() {
  devModeActive.value = false
  await window.api.settings.save({ devModeEnabled: false })
  showToast('Developer mode disabled')
}

// ── OBS Integration (Pro tier) ────────────────────────────────────────────────
type OBSStatus = {
  connected: boolean
  recording: boolean
  replayBufferActive: boolean
  outputPath: string | null
  lastError: string | null
  obsVersion: string | null
}
const obsStatus = ref<OBSStatus | null>(null)
const obsConnecting = ref(false)

async function obsConnect() {
  obsConnecting.value = true
  try {
    await window.api.settings.save({
      obsEnabled: settings.obsEnabled,
      obsHost: settings.obsHost,
      obsPort: settings.obsPort,
      obsPassword: settings.obsPassword,
      obsReplayBufferSeconds: settings.obsReplayBufferSeconds,
    })
    const result = await window.api.obs.connect()
    if (result.ok) {
      obsStatus.value = await window.api.obs.getStatus()
      showToast(`Connected to OBS v${result.version ?? '?'}`)
    } else {
      showToast(`OBS connection failed: ${result.error ?? 'Unknown error'}`)
    }
  } finally {
    obsConnecting.value = false
  }
}

async function obsDisconnect() {
  await window.api.obs.disconnect()
  obsStatus.value = await window.api.obs.getStatus()
  showToast('Disconnected from OBS')
}

async function refreshObsStatus() {
  try {
    obsStatus.value = await window.api.obs.getStatus()
  } catch { /* not available */ }
}

// ── Hotkeys ──────────────────────────────────────────────────────────────────
type HotkeyAction = 'save-clip' | 'toggle-overlay' | 'take-screenshot'
const hotkeys = reactive<Record<HotkeyAction, string>>({ 'save-clip': 'F9', 'toggle-overlay': 'F10', 'take-screenshot': 'F8' })
const hotkeyStatus = reactive<Record<HotkeyAction, boolean | null>>({ 'save-clip': null, 'toggle-overlay': null, 'take-screenshot': null })
const rebinding = ref<HotkeyAction | null>(null)
const conflictScanning = ref(false)
const conflictResults = ref<{ found: Array<{ exe: string; name: string; fix: string }> } | null>(null)

async function findConflict(): Promise<void> {
  conflictScanning.value = true
  conflictResults.value = null
  try {
    const result = await window.api.debug.findHotkeyConflict() as { supported: boolean; found: Array<{ exe: string; name: string; fix: string }> }
    conflictResults.value = result
  } finally {
    conflictScanning.value = false
  }
}

function formatKey(accelerator: string): string {
  return accelerator.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl')
}

function electronAccelerator(e: KeyboardEvent): string | null {
  const mods: string[] = []
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  const key = e.key
  // Reject modifier-only presses
  if (['Control', 'Shift', 'Alt', 'Meta', 'Escape'].includes(key)) return null
  // Allow bare function keys; otherwise require at least one modifier
  const isFKey = /^F\d+$/.test(key)
  if (!isFKey && mods.length === 0) return null
  const keyName = key.length === 1 ? key.toUpperCase() : key
  return [...mods, keyName].join('+')
}

function startRebind(action: HotkeyAction): void {
  rebinding.value = action
}

async function handleKeydown(e: KeyboardEvent): Promise<void> {
  if (!rebinding.value) return
  e.preventDefault()
  if (e.key === 'Escape') { rebinding.value = null; return }
  const acc = electronAccelerator(e)
  if (!acc) return
  const action = rebinding.value
  rebinding.value = null
  const result = await window.api.clips.setHotkey(action, acc) as { ok: boolean }
  if (result.ok) {
    hotkeys[action] = acc
    // Re-fetch status to update registration indicator
    loadHotkeyStatus()
    showSaved()
  }
}

async function loadHotkeyStatus(): Promise<void> {
  try {
    const bindings = await window.api.clips.getHotkeys() as Record<HotkeyAction, string>
    Object.assign(hotkeys, bindings)
    const status = await window.api.clips.getHotkeyStatus() as { saveClipRegistered: boolean; toggleOverlayRegistered: boolean; screenshotRegistered: boolean }
    hotkeyStatus['save-clip'] = status.saveClipRegistered
    hotkeyStatus['toggle-overlay'] = status.toggleOverlayRegistered
    hotkeyStatus['take-screenshot'] = status.screenshotRegistered
  } catch { /* non-critical */ }
}

const settings = reactive<AppSettings>({
  recordingQuality: '1080p',
  recordingBitrate: 6,
  recordingFps: 30,
  audioEnabled: true,
  savePath: '',
  launchOnStartup: false,
  autoDelete: true,
  recordedModes: ['COMPETITIVE', 'PREMIER'],
  autoAnalyse: true,
  firstRun: false,
  captureMonitor: 'auto',
  pregameKillList: [],
  clipRetentionDays: 0,
  notificationSound: true,
  cachedEncoder: null,
  cachedUseDdagrab: null,
  devModeEnabled: false,
  obsEnabled: false,
  obsHost: 'localhost',
  obsPort: 4455,
  obsPassword: '',
  obsReplayBufferSeconds: 30,
  trainerMouse: {
    dpi: 800,
    game: 'valorant',
    sensitivity: 0.5,
    fov: 103,
    rawInput: true,
    pollingRate: 1000,
  },
  crosshairSettings: {
    colorIndex: 1,
    customColor: '00FF6B',
    dotShow: true,
    dotRadius: 1.5,
    dotOpacity: 1.0,
    innerShow: true,
    innerThickness: 2,
    innerLength: 10,
    innerOffset: 4,
    innerOpacity: 1.0,
    outerShow: false,
    outerThickness: 2,
    outerLength: 5,
    outerOffset: 10,
    outerOpacity: 1.0,
    shadowShow: true,
  },
})

const GAME_MODES = [
  { value: 'COMPETITIVE', label: 'Competitive', hint: 'Ranked' },
  { value: 'PREMIER', label: 'Premier', hint: 'Team queue' },
  { value: 'CLASSIC', label: 'Unrated', hint: 'Casual 5v5' },
  { value: 'SPIKERUSH', label: 'Spike Rush', hint: '' },
  { value: 'SWIFTPLAY', label: 'Swift Play', hint: '' },
  { value: 'DEATHMATCH', label: 'Deathmatch', hint: 'Warm-up & practice' },
  { value: 'TEAMDEATHMATCH', label: 'Team Deathmatch', hint: 'HURM mode' }
]

const toggles: Array<{ key: keyof Pick<AppSettings, 'launchOnStartup' | 'autoDelete' | 'autoAnalyse' | 'notificationSound'>; label: string; hint: string | null }> = [
  { key: 'launchOnStartup', label: 'Launch on startup', hint: null },
  { key: 'autoDelete', label: 'Auto-delete after upload', hint: 'Frees disk space once recording is uploaded' },
  { key: 'autoAnalyse', label: 'Auto-analyse after game', hint: 'Automatically upload and analyse once a game ends' },
  { key: 'notificationSound', label: 'Notification sound', hint: 'Play a sound with system notifications' }
]

const usagePercent = computed(() => {
  const u = user.value as UserWithUsage | null
  if (!u?.analyses_used || !u?.analyses_limit) return 0
  return Math.min(100, Math.round((Math.max(0, u.analyses_used) / u.analyses_limit) * 100))
})

const encoderLabel = computed(() => {
  const enc = settings.cachedEncoder
  if (!enc) return null
  if (enc.includes('nvenc')) return `${enc} · NVIDIA hardware`
  if (enc.includes('amf')) return `${enc} · AMD hardware`
  if (enc.includes('qsv')) return `${enc} · Intel QuickSync`
  if (enc.includes('videotoolbox')) return `${enc} · Apple hardware`
  if (enc === 'libx264') return 'libx264 · software encoding'
  return enc
})

// tierClass and formatMode are imported from valorant.ts (shared helpers)

function showSaved(): void {
  toastMessage.value = ''
  savedVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { savedVisible.value = false }, 2000)
}

function showToast(msg: string): void {
  toastMessage.value = msg
  savedVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { savedVisible.value = false; toastMessage.value = '' }, 2500)
}

function debouncedSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    // toRaw strips Vue Proxy wrappers so arrays/objects serialize cleanly over IPC
    await window.api.settings.save(JSON.parse(JSON.stringify(toRaw(settings))))
    showSaved()
  }, 500)
}

function toggleKey(key: keyof Pick<AppSettings, 'launchOnStartup' | 'autoDelete' | 'autoAnalyse' | 'notificationSound'>): void {
  settings[key] = !settings[key]
  debouncedSave()
}

function toggleMode(value: string): void {
  const idx = settings.recordedModes.indexOf(value)
  if (idx === -1) {
    settings.recordedModes.push(value)
  } else {
    settings.recordedModes.splice(idx, 1)
  }
  debouncedSave()
}

function toggleLaunchOnStartup(): void {
  settings.launchOnStartup = !settings.launchOnStartup
  debouncedSave()
}

function toggleAudio(): void {
  settings.audioEnabled = !settings.audioEnabled
  debouncedSave()
}

async function fixAudio(): Promise<void> {
  fixingAudio.value = true
  try {
    const result = await window.api.recorder.fixAudio()
    if (!audioStatus.value) audioStatus.value = { winAudioMode: result.winAudioMode, audioEnabled: settings.audioEnabled }
    else audioStatus.value.winAudioMode = result.winAudioMode
  } catch { /* non-critical */ }
  finally { fixingAudio.value = false }
}

async function changeSavePath(): Promise<void> {
  const dir = await window.api.dialog.openDirectory()
  if (dir) {
    settings.savePath = dir
    debouncedSave()
  }
}

async function handleLogout(): Promise<void> {
  await window.api.auth.logout()
  router.push('/login')
}

async function checkForUpdates(): Promise<void> {
  updatePhase.value = 'checking'
  updateUpToDate.value = false
  if (upToDateTimer) clearTimeout(upToDateTimer)
  try {
    const result = await window.api.updater.check()
    if (result?.status === 'up-to-date') {
      updatePhase.value = 'idle'
      updateUpToDate.value = true
      upToDateTimer = setTimeout(() => { updateUpToDate.value = false }, 3000)
    }
  } catch {
    updatePhase.value = 'idle'
  }
}

async function installUpdate(): Promise<void> {
  updatePhase.value = 'installing'
  await window.api.updater.install()
}

async function testRiotApi(): Promise<void> {
  testingRiotApi.value = true
  try {
    const result = await window.api.debug.testRiotApi() as { portOpen: boolean; gameMode: string | null; logGameMode: string | null; processRunning: boolean }
    riotApiResult.value = result
  } catch {
    riotApiResult.value = { portOpen: false, gameMode: null, logGameMode: null, processRunning: false }
  } finally {
    testingRiotApi.value = false
  }
}

function openBilling(): void {
  window.open('https://upforge.gg/billing', '_blank')
}

function openUpgrade(): void {
  window.open('https://upforge.gg/pricing', '_blank')
}

function openSite(): void {
  window.open('https://upforge.gg', '_blank')
}

function openHelp(): void {
  window.open('https://upforge.gg/help', '_blank')
}

function eDpiLabel(edpi: number): string {
  if (edpi < 200) return 'Very low'
  if (edpi < 400) return 'Low'
  if (edpi < 700) return 'Medium'
  if (edpi < 1200) return 'High'
  return 'Very high'
}

function eDpiLevelClass(edpi: number): string {
  if (edpi < 400) return 'bg-blue-500/20 text-blue-400'
  if (edpi < 700) return 'bg-green-500/20 text-green-400'
  if (edpi < 1200) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}

function eDpiBarClass(edpi: number): string {
  if (edpi < 400) return 'bg-blue-500'
  if (edpi < 700) return 'bg-green-500'
  if (edpi < 1200) return 'bg-yellow-500'
  return 'bg-[#ff4655]'
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

async function loadStorageUsage(): Promise<void> {
  try {
    const usage = await window.api.storage.getUsage()
    storageBytes.value = usage.bytes
    storageCount.value = usage.count
  } catch { /* ignore */ }
}

function openRecordingsFolder(): void {
  window.api.storage.openFolder()
}

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  try {
    const [s, savedSettings] = await Promise.all([
      window.api.app.getStatus(),
      window.api.settings.get()
    ])
    isDev.value = s.isDev
    if (s.version) appVersion.value = s.version
    if (s.ffmpegOk !== undefined) ffmpegOk.value = s.ffmpegOk !== false
    Object.assign(settings, savedSettings)
    devModeActive.value = savedSettings.devModeEnabled ?? false
    // Use getStatus user as base
    if (s.user) user.value = s.user as UserWithUsage | null
    loadStorageUsage()
    loadHotkeyStatus()
  } catch (err) {
    console.error('[Settings] Failed to load status:', err)
    try {
      const savedSettings = await window.api.settings.get()
      Object.assign(settings, savedSettings)
    } catch { /* ignore */ }
  }

  // Also load richer profile data (includes usage stats) independently
  try {
    const audioSt = await window.api.recorder.getAudioStatus()
    audioStatus.value = audioSt
    // If detection hasn't run yet (app just started), auto-trigger it so the UI isn't stuck on null
    if (audioSt.winAudioMode === null && (navigator.userAgent.includes('Windows') || isMac.value)) {
      fixAudio()
    }
  } catch { /* non-critical */ }

  try {
    const prof = await window.api.profile.get()
    if (prof?.user) {
      user.value = {
        name: prof.user.name,
        email: prof.user.email,
        tier: prof.user.tier,
        riot_name: prof.user.riot_name,
        riot_tag: prof.user.riot_tag,
        analyses_used: prof.user.analysis_stats?.total ?? 0,
        analyses_limit: prof.user.analysis_stats?.limit ?? 1
      }
    }
  } catch { /* profile load failure is non-critical */ }

  // Load OBS status (non-critical)
  refreshObsStatus()

  // Hydrate update state and listen for live events
  try {
    const us = await window.api.updater.getState()
    updatePhase.value = us.phase
    updateVersion.value = us.version
    updatePercent.value = us.percent ?? 0
  } catch { /* ignore */ }
  const updaterCleanups = [
    window.api.on('updater:checking', () => { updatePhase.value = 'checking' }),
    window.api.on('updater:available', (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined
      updatePhase.value = 'available'
      updateVersion.value = info?.version
    }),
    window.api.on('updater:progress', (...args: unknown[]) => {
      updatePhase.value = 'downloading'
      updatePercent.value = typeof args[0] === 'number' ? args[0] : 0
    }),
    window.api.on('updater:downloaded', (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined
      updatePhase.value = 'ready'
      updateVersion.value = info?.version
    }),
    window.api.on('updater:not-available', () => { updatePhase.value = 'idle' }),
    window.api.on('updater:error', () => { updatePhase.value = 'idle' }),
  ]
  ;(window as Window & { _settingsUpdaterCleanups?: (() => void)[] })._settingsUpdaterCleanups = updaterCleanups
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.result-slide-enter-active {
  transition: opacity 0.2s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.result-slide-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.result-slide-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}
.result-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.toast-slide-enter-active {
  transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-slide-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.95);
}
.toast-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
