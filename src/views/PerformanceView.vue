<template>
  <div v-if="uiV3" class="uf-pf">
    <header class="uf-pf-head uf-rise">
      <span class="uf-label">PC performance · Windows</span>
      <h1 class="uf-d2" style="margin: 0">Performance</h1>
    </header>

    <section v-if="platform && platform !== 'win32'" class="uf-pf-sec">
      <p class="uf-t2">Performance boost (process priority &amp; power plan) is Windows-only.</p>
      <UfButton variant="link" @click="$router.push('/stats')">View your game stats &amp; coaching data</UfButton>
    </section>

    <template v-else>
      <section class="uf-pf-hero uf-rise uf-d1s">
        <p class="uf-t1" style="margin: 0"><span class="uf-pf-dot" :class="boosted ? 'on' : ''" />{{ boosted ? 'Boost is active.' : 'Standard mode.' }} Power plan: {{ powerPlan || '—' }}.</p>
        <div class="uf-pf-row">
          <UfButton v-if="!boosted" variant="primary" :disabled="loading" @click="runBoost">{{ loading ? 'Optimising…' : 'Boost performance' }}</UfButton>
          <UfButton v-else :disabled="loading" @click="restore">Restore</UfButton>
          <UfButton v-if="!diagnostics" :disabled="diagLoading" @click="runDiagnostics">{{ diagLoading ? 'Analysing…' : 'Run diagnostics' }}</UfButton>
        </div>
      </section>

      <section v-if="!boosted && !results.length" class="uf-pf-sec">
        <span class="uf-label">What gets optimised</span>
        <div v-for="item in previewItems" :key="item.name" class="uf-pf-line">
          <span class="uf-t3">{{ item.name }}</span>
          <span class="uf-t4">{{ item.description }}</span>
        </div>
      </section>

      <section v-if="results.length" class="uf-pf-sec">
        <span class="uf-label">Results</span>
        <div v-for="result in results" :key="result.name" class="uf-pf-line">
          <span class="uf-t3"><span :class="result.success ? 'uf-pf-ok' : 'uf-pf-bad'">{{ result.success ? '✓' : '!' }}</span> {{ result.name }}</span>
          <span class="uf-t4" :class="result.success ? '' : 'uf-pf-bad'">{{ result.message }}</span>
        </div>
        <p v-if="hasAdminFailures" class="uf-t4 uf-pf-note">Some optimisations require administrator privileges. Try running UpForge as administrator for full boost.</p>
        <p v-if="hagsNeedsReboot" class="uf-t4 uf-pf-note">Hardware-Accelerated GPU Scheduling enabled — reboot your PC to activate it. This can give a significant FPS boost in Valorant.</p>
      </section>

      <section v-if="diagnostics" class="uf-pf-sec">
        <div class="uf-pf-sec-head">
          <span class="uf-label">System diagnostics</span>
          <button type="button" class="uf-link" @click="diagnostics = null">Dismiss</button>
        </div>
        <p v-if="diagnostics.bottleneck !== 'unknown'" class="uf-t3" style="margin: 0">
          {{ diagnostics.bottleneck === 'cpu' ? 'CPU bottleneck — your CPU is limiting your FPS.' :
             diagnostics.bottleneck === 'gpu' ? 'GPU bottleneck — your GPU is the limiting factor.' :
             'Balanced — no clear bottleneck detected.' }}
        </p>
        <div v-for="m in ([
          { key: 'gpu', label: 'GPU', detail: diagnostics.gpuName || '—', value: diagnostics.gpuUsagePct, extra: diagnostics.gpuTempC > 0 ? diagnostics.gpuTempC + '°C' : '—', warn: false },
          { key: 'cpu', label: 'CPU', detail: `${diagnostics.cpuSpeedMhz} / ${diagnostics.cpuMaxMhz} MHz`, value: diagnostics.cpuUsagePct, extra: 'Load trend', warn: false },
          { key: 'ram', label: 'RAM', detail: `${diagnostics.ramUsedMb} / ${diagnostics.ramTotalMb} MB`, value: ramUsagePct(diagnostics), extra: `${diagnostics.ramSpeedMhz} MHz${!diagnostics.xmpEnabled ? ' — XMP may be off' : ''}`, warn: !diagnostics.xmpEnabled },
        ] as const)" :key="m.key" class="uf-pf-stat">
          <div class="uf-pf-stat-name"><span class="uf-label">{{ m.label }}</span><span class="uf-t4 uf-pf-trunc">{{ m.detail }}</span></div>
          <span class="uf-d4" :class="statHigh(m.key, m.value) ? 'uf-pf-bad' : ''">{{ m.value }}%</span>
          <div class="uf-pf-bar"><div class="uf-fill" :class="statHigh(m.key, m.value) ? 'high' : ''" :style="{ width: Math.min(100, m.value) + '%' }" /></div>
          <svg class="uf-pf-spark" viewBox="0 0 60 20" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke-width="1.5" :points="sparklinePolyline(m.key)" /></svg>
          <span class="uf-t4 uf-pf-avg">{{ statAverage(m.key) !== null ? `avg ${statAverage(m.key)}%` : '' }}</span>
          <span class="uf-t4 uf-pf-extra" :class="m.warn ? 'uf-pf-warn' : ''">{{ m.extra }}</span>
        </div>
        <p v-for="(w, i) in diagnostics.warnings" :key="i" class="uf-t4 uf-pf-note">{{ w }}</p>
        <template v-if="diagnostics.topProcesses.length">
          <span class="uf-label" style="margin-top: 10px">Top CPU processes</span>
          <div v-for="proc in diagnostics.topProcesses.slice(0, 5)" :key="proc.name" class="uf-pf-proc">
            <span class="uf-t3 uf-pf-trunc" style="flex: 1">{{ proc.name }}</span>
            <span class="uf-t3 uf-num" :class="proc.cpuPct > 10 ? 'uf-pf-bad' : 'uf-pf-muted'">{{ proc.cpuPct.toFixed(1) }}%</span>
            <button type="button" class="uf-link" :disabled="killingProcesses.has(proc.name)" :aria-label="`Close ${proc.name}`" @click="killProcess(proc.name)">{{ killingProcesses.has(proc.name) ? 'Closing…' : 'Kill' }}</button>
          </div>
        </template>
      </section>

      <section class="uf-pf-sec">
        <span class="uf-label">Auto-close before game</span>
        <p class="uf-t4">Apps added here are closed automatically when a game is detected starting.</p>
        <div v-for="(proc, i) in pregameKillList" :key="proc" class="uf-pf-proc">
          <span class="uf-t3 uf-pf-trunc" style="flex: 1">{{ proc }}</span>
          <button type="button" class="uf-link" :aria-label="`Remove ${proc}`" @click="removeFromKillList(i)">Remove</button>
        </div>
        <div class="uf-pf-row">
          <input v-model="newKillEntry" type="text" placeholder="e.g. Discord.exe" class="uf-pf-input" aria-label="App to close before a game" @keydown.enter="addToKillList" />
          <UfButton @click="addToKillList">Add</UfButton>
        </div>
      </section>

      <p class="uf-t4">For maximum effect, run UpForge as administrator.</p>
    </template>
  </div>
  <template v-else>
  <div class="px-3 py-3 space-y-3">

    <!-- macOS notice -->
    <div
      v-if="platform && platform !== 'win32'"
      class="space-y-3"
    >
      <div class="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.07] text-gray-400 text-xs">
        <svg class="w-3.5 h-3.5 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
        </svg>
        <span>Performance boost (process priority &amp; power plan) is Windows-only.</span>
      </div>
      <button
        class="w-full py-2.5 text-xs font-medium text-gray-400 hover:text-white transition-colors border border-white/[0.10] hover:border-white/[0.12] rounded-xl"
        @click="$router.push('/stats')"
      >View your game stats &amp; coaching data →</button>
    </div>

    <template v-else>

      <!-- Status card -->
      <div
        :class="[
          'rounded-xl border transition-all overflow-hidden',
          boosted
            ? 'bg-green-500/[0.07] border-green-500/25'
            : 'bg-white/[0.02] border-white/[0.09]'
        ]"
      >
        <div class="flex items-center gap-3 px-3 py-2.5">
          <div class="relative flex-shrink-0">
            <div :class="['w-2.5 h-2.5 rounded-full', boosted ? 'bg-green-400' : 'bg-gray-700']" />
            <div v-if="boosted" class="absolute inset-0 w-2.5 h-2.5 rounded-full bg-green-400 animate-ping opacity-60" />
          </div>
          <div class="flex-1 min-w-0">
            <p :class="['text-xs font-semibold', boosted ? 'text-green-300' : 'text-gray-400']">
              {{ boosted ? 'Boost Active' : 'Standard Mode' }}
            </p>
            <p class="text-xs text-gray-600 mt-0.5">
              Power plan: <span class="text-gray-400">{{ powerPlan || '—' }}</span>
            </p>
          </div>
          <button
            v-if="boosted"
            class="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded border border-white/[0.07] hover:border-white/[0.15]"
            @click="restore"
            :disabled="loading"
          >
            Restore
          </button>
        </div>
      </div>

      <!-- Boost button -->
      <button
        v-if="!boosted"
        type="button"
        :disabled="loading"
        class="btn-primary w-full"
        @click="runBoost"
      >
        <span v-if="loading" class="flex items-center justify-center gap-2">
          <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Optimising…
        </span>
        <span v-else class="flex items-center justify-center gap-2">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          Boost Performance
        </span>
      </button>

      <!-- What this does (pre-boost) -->
      <div v-if="!boosted && !results.length" class="space-y-1.5">
        <p class="text-xs text-gray-600 uppercase tracking-wider font-semibold px-0.5">What gets optimised</p>
        <div class="space-y-1">
          <div
            v-for="item in previewItems"
            :key="item.name"
            class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.07]"
          >
            <svg class="w-3.5 h-3.5 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" :d="item.iconPath" />
            </svg>
            <div class="min-w-0">
              <p class="text-xs font-medium text-gray-300">{{ item.name }}</p>
              <p class="text-xs text-gray-600">{{ item.description }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Results (post-boost) -->
      <div v-if="results.length" class="space-y-1.5">
        <p class="text-xs text-gray-600 uppercase tracking-wider font-semibold px-0.5">Results</p>
        <div class="space-y-1">
          <div
            v-for="result in results"
            :key="result.name"
            :class="[
              'flex items-center gap-2.5 px-3 py-2 rounded-lg border',
              result.success
                ? 'bg-green-500/[0.05] border-green-500/20'
                : 'bg-white/[0.02] border-white/[0.09]'
            ]"
          >
            <!-- Success: check circle / Failure: warning triangle -->
            <svg v-if="result.success" class="w-3.5 h-3.5 flex-shrink-0 text-green-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <svg v-else class="w-3.5 h-3.5 flex-shrink-0 text-orange-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div class="min-w-0 flex-1">
              <p class="text-xs font-medium text-gray-300">{{ result.name }}</p>
              <p :class="['text-xs', result.success ? 'text-gray-500' : 'text-orange-500/80']">
                {{ result.message }}
              </p>
            </div>
          </div>
        </div>

        <!-- Admin note if any failed -->
        <div
          v-if="hasAdminFailures"
          class="flex items-start gap-2 px-3 py-2 rounded-lg bg-orange-500/[0.06] border border-orange-500/20 text-xs text-orange-400/80 mt-1"
        >
          <svg class="w-3 h-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <span>Some optimisations require administrator privileges. Try running UpForge as administrator for full boost.</span>
        </div>

        <!-- HAGS reboot notice -->
        <div
          v-if="hagsNeedsReboot"
          class="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-500/[0.07] border border-blue-500/20 text-xs text-blue-300/90"
        >
          <svg class="w-3 h-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          <span>Hardware-Accelerated GPU Scheduling enabled — reboot your PC to activate it. This can give a significant FPS boost in Valorant.</span>
        </div>
      </div>

      <!-- Diagnostics panel -->
      <div v-if="diagnostics" class="space-y-1.5">
        <div class="flex items-center justify-between px-0.5">
          <p class="text-xs text-gray-600 uppercase tracking-wider font-semibold">System Diagnostics</p>
          <button
            class="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            @click="diagnostics = null"
          >dismiss</button>
        </div>

        <!-- Bottleneck badge -->
        <div
          v-if="diagnostics.bottleneck !== 'unknown'"
          :class="[
            'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold',
            diagnostics.bottleneck === 'cpu'
              ? 'bg-orange-500/[0.08] border-orange-500/25 text-orange-300'
              : diagnostics.bottleneck === 'gpu'
              ? 'bg-yellow-500/[0.08] border-yellow-500/25 text-yellow-300'
              : 'bg-green-500/[0.07] border-green-500/20 text-green-300'
          ]"
        >
          <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span>
            {{ diagnostics.bottleneck === 'cpu' ? 'CPU Bottleneck — CPU is limiting your FPS' :
               diagnostics.bottleneck === 'gpu' ? 'GPU Bottleneck — GPU is the limiting factor' :
               'Balanced — No clear bottleneck detected' }}
          </span>
        </div>

        <!-- Stat grid -->
        <div class="grid grid-cols-2 gap-1">
          <div class="rounded-lg border border-white/[0.09] bg-white/[0.02] px-3 py-2.5 space-y-2">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-xs font-medium uppercase tracking-wide text-gray-600">GPU</p>
                <p class="truncate text-xs font-semibold text-gray-300">{{ diagnostics.gpuName || '—' }}</p>
              </div>
              <div class="text-right">
                <p class="text-lg font-black tabular-nums" :class="statValueClass('gpu', diagnostics.gpuUsagePct)">{{ diagnostics.gpuUsagePct }}%</p>
                <p v-if="statAverage('gpu') !== null" class="text-[10px] text-gray-500">vs avg: {{ statAverage('gpu') }}%</p>
              </div>
            </div>
            <div class="h-1 overflow-hidden rounded-full bg-white/[0.07]">
              <div class="h-full rounded-full transition-all" :class="statBarClass('gpu', diagnostics.gpuUsagePct)" :style="{ width: diagnostics.gpuUsagePct + '%' }" />
            </div>
            <div class="flex items-center justify-between gap-2">
              <svg viewBox="0 0 60 20" class="h-5 w-[60px] overflow-visible">
                <polygon :points="sparklineArea('gpu')" :class="sparklineFillClass('gpu', diagnostics.gpuUsagePct)" />
                <polyline fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" :points="sparklinePolyline('gpu')" :class="sparklineLineClass('gpu', diagnostics.gpuUsagePct)" />
              </svg>
              <p class="text-[10px] text-gray-600">{{ diagnostics.gpuTempC > 0 ? diagnostics.gpuTempC + '°C' : '—' }}</p>
            </div>
          </div>

          <div class="rounded-lg border border-white/[0.09] bg-white/[0.02] px-3 py-2.5 space-y-2">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-gray-600">CPU</p>
                <p class="text-xs text-gray-500">{{ diagnostics.cpuSpeedMhz }} / {{ diagnostics.cpuMaxMhz }} MHz</p>
              </div>
              <div class="text-right">
                <p class="text-lg font-black tabular-nums" :class="statValueClass('cpu', diagnostics.cpuUsagePct)">{{ diagnostics.cpuUsagePct }}%</p>
                <p v-if="statAverage('cpu') !== null" class="text-[10px] text-gray-500">vs avg: {{ statAverage('cpu') }}%</p>
              </div>
            </div>
            <div class="h-1 overflow-hidden rounded-full bg-white/[0.07]">
              <div class="h-full rounded-full transition-all" :class="statBarClass('cpu', diagnostics.cpuUsagePct)" :style="{ width: diagnostics.cpuUsagePct + '%' }" />
            </div>
            <div class="flex items-center justify-between gap-2">
              <svg viewBox="0 0 60 20" class="h-5 w-[60px] overflow-visible">
                <polygon :points="sparklineArea('cpu')" :class="sparklineFillClass('cpu', diagnostics.cpuUsagePct)" />
                <polyline fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" :points="sparklinePolyline('cpu')" :class="sparklineLineClass('cpu', diagnostics.cpuUsagePct)" />
              </svg>
              <p class="text-[10px] text-gray-600">Load trend</p>
            </div>
          </div>

          <div class="col-span-2 rounded-lg border border-white/[0.09] bg-white/[0.02] px-3 py-2.5 space-y-2">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-gray-600">RAM</p>
                <p class="text-xs text-gray-500">{{ diagnostics.ramUsedMb }} / {{ diagnostics.ramTotalMb }} MB</p>
              </div>
              <div class="text-right">
                <p class="text-lg font-black tabular-nums" :class="statValueClass('ram', ramUsagePct(diagnostics))">{{ ramUsagePct(diagnostics) }}%</p>
                <p v-if="statAverage('ram') !== null" class="text-[10px] text-gray-500">vs avg: {{ statAverage('ram') }}%</p>
              </div>
            </div>
            <div class="h-1 overflow-hidden rounded-full bg-white/[0.07]">
              <div class="h-full rounded-full transition-all" :class="statBarClass('ram', ramUsagePct(diagnostics))" :style="{ width: ramUsagePct(diagnostics) + '%' }" />
            </div>
            <div class="flex items-center justify-between gap-2">
              <svg viewBox="0 0 60 20" class="h-5 w-[60px] overflow-visible">
                <polygon :points="sparklineArea('ram')" :class="sparklineFillClass('ram', ramUsagePct(diagnostics))" />
                <polyline fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" :points="sparklinePolyline('ram')" :class="sparklineLineClass('ram', ramUsagePct(diagnostics))" />
              </svg>
              <p class="text-[10px]" :class="!diagnostics.xmpEnabled ? 'text-orange-400' : 'text-gray-600'">{{ diagnostics.ramSpeedMhz }} MHz{{ !diagnostics.xmpEnabled ? ' — XMP may be off' : '' }}</p>
            </div>
          </div>
        </div>

        <!-- Warnings -->
        <div v-if="diagnostics.warnings.length" class="space-y-1">
          <div
            v-for="(w, i) in diagnostics.warnings"
            :key="i"
            class="flex items-start gap-2 px-3 py-2 rounded-lg bg-orange-500/[0.06] border border-orange-500/20 text-xs text-orange-400/90"
          >
            <svg class="w-3 h-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <span>{{ w }}</span>
          </div>
        </div>

        <!-- Top processes -->
        <div v-if="diagnostics.topProcesses.length" class="space-y-1">
          <p class="text-xs text-gray-600 uppercase tracking-wider font-semibold px-0.5">Top CPU Processes</p>
          <div class="space-y-0.5">
            <div
              v-for="proc in diagnostics.topProcesses.slice(0, 5)"
              :key="proc.name"
              class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.07]"
            >
              <p class="text-xs text-gray-400 truncate flex-1">{{ proc.name }}</p>
              <p class="text-xs font-semibold flex-shrink-0" :class="proc.cpuPct > 10 ? 'text-orange-400' : 'text-gray-500'">{{ proc.cpuPct.toFixed(1) }}%</p>
              <button
                class="text-xs px-1.5 py-0.5 rounded border border-red-500/30 text-red-400/80 hover:text-red-300 hover:border-red-400/50 transition-colors flex-shrink-0 disabled:opacity-40"
                :disabled="killingProcesses.has(proc.name)"
                @click="killProcess(proc.name)"
              >
                <span v-if="killingProcesses.has(proc.name)">killing…</span>
                <span v-else>Kill</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Diagnostics button -->
      <button
        v-if="!diagnostics"
        :disabled="diagLoading"
        class="w-full py-2 rounded-xl text-xs font-medium transition-all
               bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] hover:border-white/[0.15]
               text-gray-400 hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
        @click="runDiagnostics"
      >
        <span v-if="diagLoading" class="flex items-center justify-center gap-2">
          <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Analysing…
        </span>
        <span v-else class="flex items-center justify-center gap-2">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
          </svg>
          Run Diagnostics
        </span>
      </button>

      <!-- Pre-game auto-close list -->
      <div class="space-y-1.5">
        <p class="text-xs text-gray-600 uppercase tracking-wider font-semibold px-0.5">Auto-Close Before Game</p>
        <p class="text-xs text-gray-700 px-0.5">Apps added here are closed automatically when a game is detected starting.</p>

        <!-- Existing entries -->
        <div v-if="pregameKillList.length" class="space-y-0.5">
          <div
            v-for="(proc, i) in pregameKillList"
            :key="proc"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.07]"
          >
            <p class="text-xs text-gray-400 flex-1 truncate">{{ proc }}</p>
            <button
              class="text-xs text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
              @click="removeFromKillList(i)"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Add input -->
        <div class="flex gap-1.5">
          <input
            v-model="newKillEntry"
            type="text"
            placeholder="e.g. Discord.exe"
            class="flex-1 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-gray-300
                   placeholder:text-gray-700 focus:outline-none focus:border-white/20"
            @keydown.enter="addToKillList"
          />
          <button
            class="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08]
                   text-xs text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0"
            @click="addToKillList"
          >Add</button>
        </div>
      </div>

      <!-- Admin tip (always show) -->
      <p class="text-xs text-gray-700 text-center px-2">
        For maximum effect, run UpForge as administrator
      </p>

    </template>
  </div>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { uiV3 } from '../lib/ui-v3'
import UfButton from '../components/v3/UfButton.vue'

interface OptimizationResult {
  name: string
  success: boolean
  message: string
}

interface PerformanceStatus {
  boosted: boolean
  powerPlan: string
  platform: string
}

interface DiagnosticsReport {
  gpuName: string
  gpuUsagePct: number
  gpuTempC: number
  cpuUsagePct: number
  cpuSpeedMhz: number
  cpuMaxMhz: number
  ramUsedMb: number
  ramTotalMb: number
  ramSpeedMhz: number
  topProcesses: { name: string; cpuPct: number }[]
  xmpEnabled: boolean | null
  bottleneck: 'cpu' | 'gpu' | 'none' | 'unknown'
  warnings: string[]
}

const loading = ref(false)
const boosted = ref(false)
const powerPlan = ref('')
const platform = ref('')
const results = ref<OptimizationResult[]>([])
const diagnostics = ref<DiagnosticsReport | null>(null)
const diagLoading = ref(false)
const killingProcesses = ref(new Set<string>())
const pregameKillList = ref<string[]>([])
const newKillEntry = ref('')

type PerfMetric = 'gpu' | 'cpu' | 'ram'
const PERF_HISTORY_KEYS: Record<PerfMetric, string> = {
  gpu: 'perf-history-gpu',
  cpu: 'perf-history-cpu',
  ram: 'perf-history-ram',
}

const hagsNeedsReboot = computed(() =>
  results.value.some((r) => r.name === 'HAGS' && r.success && r.message.includes('reboot'))
)

// Heroicons outline paths (24px viewBox, stroke-based)
const previewItems = [
  {
    name: 'Power Plan',
    description: 'Switch to High Performance for maximum CPU & GPU throughput',
    iconPath: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
  },
  {
    name: 'Xbox Game DVR',
    description: 'Disable background Game Bar capture — a major FPS killer in Valorant',
    iconPath: 'M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z',
  },
  {
    name: 'GPU Scheduling',
    description: 'Set GPU Priority 8 & SystemResponsiveness=0 so Windows favours your game',
    iconPath: 'M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z',
  },
  {
    name: 'NVIDIA GPU',
    description: 'Force GPU to max performance mode, preventing mid-round clock drops',
    iconPath: 'M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3',
  },
  {
    name: 'RAM Cleanup',
    description: 'Trim idle background processes to free memory for the game',
    iconPath: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
  },
  {
    name: 'Network Latency',
    description: 'Disable Nagle algorithm to reduce ping spikes',
    iconPath: 'M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z',
  },
  {
    name: 'DNS Cache',
    description: 'Flush DNS to ensure fastest server connections',
    iconPath: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99',
  },
  {
    name: 'Temp Files',
    description: 'Clean stale temp files to reduce I/O load',
    iconPath: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
  },
  {
    name: 'Process Priority',
    description: 'Elevate game process to High priority for stable FPS',
    iconPath: 'M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18',
  },
  {
    name: 'HAGS',
    description: 'Enable Hardware-Accelerated GPU Scheduling for lower latency & higher FPS',
    iconPath: 'M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z',
  },
]

const hasAdminFailures = computed(() =>
  results.value.some((r) => !r.success && r.message.toLowerCase().includes('administrator'))
)

function ramUsagePct(report: DiagnosticsReport): number {
  if (report.ramTotalMb <= 0) return 0
  return Math.round((report.ramUsedMb / report.ramTotalMb) * 100)
}

function statUsage(metric: PerfMetric, report: DiagnosticsReport): number {
  if (metric === 'gpu') return report.gpuUsagePct
  if (metric === 'cpu') return report.cpuUsagePct
  return ramUsagePct(report)
}

function readPerfHistory(metric: PerfMetric): number[] {
  try {
    const raw = localStorage.getItem(PERF_HISTORY_KEYS[metric])
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === 'number') : []
  } catch {
    return []
  }
}

function writePerfHistory(metric: PerfMetric, values: number[]) {
  localStorage.setItem(PERF_HISTORY_KEYS[metric], JSON.stringify(values.slice(-7)))
}

function updatePerfHistory(report: DiagnosticsReport) {
  ;(['gpu', 'cpu', 'ram'] as PerfMetric[]).forEach((metric) => {
    const next = [...readPerfHistory(metric), statUsage(metric, report)].slice(-7)
    writePerfHistory(metric, next)
  })
}

function normalizedHistory(metric: PerfMetric): number[] {
  const history = readPerfHistory(metric).slice(-7)
  const lastValue = history.length ? history[history.length - 1] : 0
  while (history.length < 7) history.unshift(lastValue)
  return history
}

function statAverage(metric: PerfMetric): number | null {
  const history = readPerfHistory(metric)
  if (!history.length) return null
  return Math.round(history.reduce((sum, value) => sum + value, 0) / history.length)
}

function statValueClass(metric: PerfMetric, value: number): string {
  if (metric === 'ram') {
    if (value < 70) return 'text-emerald-400'
    if (value <= 90) return 'text-yellow-400'
    return 'text-red-400'
  }
  if (value < 50) return 'text-emerald-400'
  if (value <= 80) return 'text-yellow-400'
  return 'text-red-400'
}

/** v3: true in the same band statValueClass marks red. */
function statHigh(metric: PerfMetric, value: number): boolean {
  return metric === 'ram' ? value > 90 : value > 80
}

function statBarClass(metric: PerfMetric, value: number): string {
  if (metric === 'ram') {
    if (value < 70) return 'bg-emerald-500'
    if (value <= 90) return 'bg-yellow-500'
    return 'bg-red-500'
  }
  if (value < 50) return 'bg-emerald-500'
  if (value <= 80) return 'bg-yellow-500'
  return 'bg-red-500'
}

function sparklineLineClass(metric: PerfMetric, value: number): string {
  if (metric === 'ram') {
    if (value < 70) return 'stroke-emerald-400'
    if (value <= 90) return 'stroke-yellow-400'
    return 'stroke-red-400'
  }
  if (value < 50) return 'stroke-emerald-400'
  if (value <= 80) return 'stroke-yellow-400'
  return 'stroke-red-400'
}

function sparklineFillClass(metric: PerfMetric, value: number): string {
  if (metric === 'ram') {
    if (value < 70) return 'fill-emerald-500/12'
    if (value <= 90) return 'fill-yellow-500/12'
    return 'fill-red-500/12'
  }
  if (value < 50) return 'fill-emerald-500/12'
  if (value <= 80) return 'fill-yellow-500/12'
  return 'fill-red-500/12'
}

function sparklinePolyline(metric: PerfMetric): string {
  const points = normalizedHistory(metric)
  return points.map((value, index) => `${index * 10},${20 - (Math.max(0, Math.min(100, value)) / 100) * 18}`).join(' ')
}

function sparklineArea(metric: PerfMetric): string {
  const line = sparklinePolyline(metric)
  return `0,20 ${line} 60,20`
}

async function loadStatus() {
  try {
    const status = await window.api.performance.getStatus() as PerformanceStatus
    boosted.value = status.boosted
    powerPlan.value = status.powerPlan
    platform.value = status.platform
  } catch {
    platform.value = navigator.platform.toUpperCase().includes('MAC') ? 'darwin' : 'win32'
  }
}

async function runBoost() {
  loading.value = true
  results.value = []
  try {
    const res = await window.api.performance.boost() as OptimizationResult[]
    results.value = res
    const anySuccess = res.some((r) => r.success)
    if (anySuccess) boosted.value = true
    await loadStatus()
  } catch (err) {
    results.value = [{ name: 'Boost', success: false, message: String(err) }]
  } finally {
    loading.value = false
  }
}

async function restore() {
  loading.value = true
  try {
    const res = await window.api.performance.restore() as OptimizationResult[]
    results.value = res
    boosted.value = false
    await loadStatus()
  } catch (err) {
    results.value = [{ name: 'Restore', success: false, message: String(err) }]
  } finally {
    loading.value = false
  }
}

async function runDiagnostics() {
  diagLoading.value = true
  try {
    diagnostics.value = await window.api.performance.diagnostics() as DiagnosticsReport | null
    if (diagnostics.value) updatePerfHistory(diagnostics.value)
  } catch {
    diagnostics.value = null
  } finally {
    diagLoading.value = false
  }
}

async function killProcess(name: string) {
  killingProcesses.value = new Set([...killingProcesses.value, name])
  try {
    await window.api.performance.killProcess(name)
    // Remove killed process from the list
    if (diagnostics.value) {
      diagnostics.value = {
        ...diagnostics.value,
        topProcesses: diagnostics.value.topProcesses.filter((p) => p.name !== name),
      }
    }
  } finally {
    const next = new Set(killingProcesses.value)
    next.delete(name)
    killingProcesses.value = next
  }
}

async function loadPregameKillList() {
  try {
    pregameKillList.value = await window.api.performance.getPregameKillList()
  } catch {
    pregameKillList.value = []
  }
}

async function addToKillList() {
  const entry = newKillEntry.value.trim()
  if (!entry || pregameKillList.value.includes(entry)) return
  const updated = [...pregameKillList.value, entry]
  await window.api.performance.setPregameKillList(updated)
  pregameKillList.value = updated
  newKillEntry.value = ''
}

async function removeFromKillList(index: number) {
  const updated = pregameKillList.value.filter((_, i) => i !== index)
  await window.api.performance.setPregameKillList(updated)
  pregameKillList.value = updated
}

onMounted(async () => {
  await loadStatus()
  await loadPregameKillList()
})
</script>

<style scoped>
.uf-pf { height: 100%; overflow: auto; padding: 32px 40px 48px; background: var(--uf-bg); color: var(--uf-bone); display: flex; flex-direction: column; gap: 28px; max-width: 1100px; }
.uf-pf p { margin: 0; }
.uf-pf-head { display: flex; flex-direction: column; gap: 10px; }
.uf-pf-hero { display: flex; flex-direction: column; gap: 18px; padding: 22px 0; border-top: 1px solid var(--uf-line); border-bottom: 1px solid var(--uf-line); }
.uf-pf-dot { display: inline-block; width: 10px; height: 10px; margin: 0 12px 4px 0; background: var(--uf-faint); vertical-align: middle; }
.uf-pf-dot.on { background: var(--uf-win); }
.uf-pf-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.uf-pf-sec { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.uf-pf-sec > .uf-pf-line, .uf-pf-sec > .uf-pf-stat, .uf-pf-sec > .uf-pf-proc, .uf-pf-sec > .uf-pf-sec-head, .uf-pf-sec > .uf-pf-row { align-self: stretch; }
.uf-pf-sec-head { display: flex; align-items: baseline; justify-content: space-between; }
.uf-pf-line { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 16px; align-items: baseline; padding: 10px 0; border-top: 1px solid var(--uf-line); }
.uf-pf-ok { color: var(--uf-win); }
.uf-pf-bad { color: var(--uf-loss) !important; }
.uf-pf-muted { color: var(--uf-muted); }
.uf-pf-warn { color: var(--uf-gold) !important; }
.uf-pf-note { padding-left: 12px; border-left: 2px solid var(--uf-gold); color: var(--uf-muted); }
.uf-pf-stat { display: grid; grid-template-columns: 220px 80px minmax(80px, 1fr) 60px 70px 170px; gap: 16px; align-items: center; padding: 12px 0; border-top: 1px solid var(--uf-line); }
.uf-pf-stat-name { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.uf-pf-trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uf-pf-bar { height: 4px; background: var(--uf-raised); }
.uf-pf-bar > div { height: 100%; background: var(--uf-bone); }
.uf-pf-bar > div.high { background: var(--uf-loss); }
.uf-pf-spark { width: 60px; height: 20px; stroke: var(--uf-muted); }
.uf-pf-avg, .uf-pf-extra { white-space: nowrap; }
.uf-pf-extra { text-align: right; }
.uf-pf-proc { display: flex; align-items: center; gap: 16px; padding: 8px 0; border-top: 1px solid var(--uf-line); }
.uf-pf-input { flex: 1; max-width: 360px; height: 44px; padding: 0 12px; background: var(--uf-raised); border: 1px solid var(--uf-line-2); border-radius: 0; color: var(--uf-bone); font: 400 15px/1 var(--uf-body); outline: none; }
.uf-pf-input:focus { border-color: var(--uf-red); }
@media (max-width: 900px) { .uf-pf-stat { grid-template-columns: 1fr 70px; } .uf-pf-bar, .uf-pf-spark, .uf-pf-avg { display: none; } .uf-pf-extra { grid-column: 1 / -1; text-align: left; } .uf-pf-line { grid-template-columns: 1fr; gap: 4px; } }
</style>
