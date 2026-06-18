<template>
  <div class="h-full text-white flex flex-col overflow-hidden bg-[#111111]">

    <!-- Toolbar: filters + session count (nav already labels this view) -->
    <div class="flex-shrink-0 px-4 py-2.5 border-b border-white/[0.08] space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex gap-1.5 flex-wrap flex-1 min-w-0">
          <button
            v-for="f in RESULT_FILTERS"
            :key="f"
            class="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all border"
            :class="activeFilter === f
              ? 'bg-red-500/15 text-red-400 border-red-500/30'
              : 'text-gray-500 border-white/[0.10] hover:text-gray-300 hover:bg-white/[0.03] hover:border-white/[0.12]'"
            @click="activeFilter = f"
          >{{ f }}</button>
        </div>
        <p class="text-[10px] text-gray-600 tabular-nums flex-shrink-0">
          <span class="font-bold text-gray-400">{{ filteredAnalyses.length }}</span>
          <span class="text-gray-700"> / {{ allAnalyses.length }}</span>
          <span class="ml-1 uppercase tracking-wide">sessions</span>
        </p>
      </div>
      <div v-if="availableMaps.length > 1" class="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5 -mx-1 px-1">
        <button
          class="history-map-pill history-map-pill--all flex-shrink-0"
          :class="{ 'history-map-pill--active': activeMap === null }"
          @click="activeMap = null"
        >
          <div class="history-map-pill__shade history-map-pill__shade--all" />
          <span class="history-map-pill__label">All maps</span>
        </button>
        <button
          v-for="map in availableMaps"
          :key="map"
          class="history-map-pill flex-shrink-0"
          :class="{ 'history-map-pill--active': activeMap === map }"
          @click="activeMap = map"
        >
          <img
            v-if="getMapImage(map)"
            :src="getMapImage(map)"
            class="history-map-pill__bg object-cover"
            alt=""
          />
          <div class="history-map-pill__shade" />
          <span class="history-map-pill__label">{{ formatMapLabel(map) }}</span>
        </button>
      </div>
    </div>

    <!-- Split: session list + detail -->
    <div class="flex flex-1 min-h-0 flex-col lg:flex-row">

      <!-- Left: compact session list -->
      <div
        class="history-list flex flex-col min-h-0 border-b border-white/[0.08] lg:border-b-0 lg:border-r lg:w-[min(400px,38%)] xl:w-[min(440px,36%)] flex-shrink-0"
        :class="selectedId && 'hidden lg:flex'"
      >
        <div class="flex-1 overflow-y-auto px-3 py-3 scrollbar-hide">
          <div v-if="loading" class="space-y-2">
            <div v-for="i in 6" :key="i" class="h-16 rounded-xl bg-white/[0.02] animate-pulse border border-white/[0.07]" />
          </div>

          <div v-else-if="filteredAnalyses.length === 0" class="flex items-center justify-center py-12 px-2">
            <div class="text-center">
              <p class="text-sm font-semibold text-gray-300">{{ allAnalyses.length === 0 ? 'No sessions yet' : 'No matches for this filter' }}</p>
              <p class="mt-1 text-xs text-gray-600">Record or upload a match to build your archive.</p>
            </div>
          </div>

          <div v-else class="space-y-4">
            <section v-for="group in groupedAnalyses" :key="group.label" class="space-y-1.5">
              <div class="flex items-center gap-2 px-1 py-0.5">
                <span class="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-600">{{ group.label }}</span>
                <span class="text-[9px] text-gray-700">{{ group.items.length }}</span>
                <div class="flex-1 h-px bg-white/[0.05]" />
              </div>

              <button
                v-for="a in group.items"
                :key="a.id"
                type="button"
                class="history-list-row w-full text-left rounded-xl border px-2.5 py-2 transition-all"
                :class="[
                  selectedId === a.id
                    ? 'border-red-500/35 bg-red-500/[0.08] shadow-[0_0_0_1px_rgba(239,68,68,0.12)]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]',
                  a.won === true ? 'history-list-row--won' : a.won === false ? 'history-list-row--lost' : '',
                ]"
                @click="selectSession(a)"
              >
                <div class="flex items-center gap-2.5">
                  <div
                    class="history-list-thumb relative h-12 w-[54px] flex-shrink-0 rounded-lg overflow-hidden border border-white/10 bg-black/50"
                    :style="a.agent ? { boxShadow: `inset 0 0 0 1px ${getAgentColor(a.agent)}33` } : {}"
                  >
                    <img
                      v-if="a.map && getMapImage(a.map)"
                      :src="getMapImage(a.map)"
                      class="absolute inset-0 h-full w-full object-cover opacity-55"
                      alt=""
                    />
                    <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
                    <img
                      v-if="a.agent && getAgentImage(a.agent)"
                      :src="getAgentImage(a.agent)"
                      class="relative mx-auto mt-1 h-8 w-8 object-contain drop-shadow-md"
                      alt=""
                    />
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1 min-w-0">
                      <span class="text-xs font-bold text-white truncate">{{ a.agent || 'Unknown' }}</span>
                      <span class="text-gray-700">·</span>
                      <span class="text-xs text-gray-400 truncate">{{ formatMapLabel(a.map) || '—' }}</span>
                    </div>
                    <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-gray-600">
                      <span>{{ formatDate(a.created_at) }}</span>
                      <span
                        v-if="a.rank && getRankIconUrl(a.rank)"
                        class="inline-flex items-center gap-0.5 rounded border border-white/[0.08] bg-white/[0.03] px-1 py-px"
                        :title="a.rank"
                      >
                        <img :src="getRankIconUrl(a.rank)!" class="h-3.5 w-3.5 object-contain" :alt="a.rank" />
                        <span class="text-[9px] font-semibold" :style="{ color: getRankHexColor(a.rank) }">{{ a.rank }}</span>
                      </span>
                      <span
                        v-if="a.won != null"
                        class="font-bold"
                        :class="a.won ? 'text-green-500/80' : 'text-red-500/70'"
                      >{{ a.won ? 'W' : 'L' }}</span>
                      <span v-if="a.rounds_won != null && a.rounds_lost != null" class="tabular-nums">{{ a.rounds_won }}–{{ a.rounds_lost }}</span>
                      <span v-if="a.kills != null" class="tabular-nums font-mono text-gray-500">{{ a.kills }}/{{ a.deaths }}/{{ a.assists }}</span>
                    </div>
                  </div>

                  <div class="flex flex-shrink-0 flex-col items-end gap-0.5">
                    <span
                      v-if="a.overall_score != null"
                      class="text-sm font-black tabular-nums leading-none"
                      :class="a.overall_score >= 78 ? 'text-green-400' : a.overall_score >= 50 ? 'text-yellow-400' : 'text-red-400'"
                    >{{ a.overall_score * 10 }}</span>
                    <span
                      v-else-if="['queued', 'processing', 'pending'].includes(a.status)"
                      class="text-[9px] text-gray-600"
                    >…</span>
                    <span
                      v-if="a.overall_score != null"
                      class="rounded px-1 py-px text-[8px] font-bold"
                      :class="scoreGradeBadgeClass(a.overall_score)"
                    >{{ scoreGrade(a.overall_score) }}</span>
                  </div>
                </div>
              </button>
            </section>
          </div>
        </div>
      </div>

      <!-- Right: overview or session detail -->
      <div
        class="history-detail flex flex-1 flex-col min-h-0 min-w-0 bg-[#0e0e0e]"
        :class="!selectedId && 'hidden lg:flex'"
      >
        <!-- Mobile back -->
        <div v-if="selectedId" class="lg:hidden flex-shrink-0 px-3 py-2 border-b border-white/[0.08]">
          <button
            type="button"
            class="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white"
            @click="selectedId = null"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
            All sessions
          </button>
        </div>

        <div class="flex-1 overflow-y-auto scrollbar-hide p-4">
          <!-- Overview when nothing selected (desktop) -->
          <div v-if="!selectedAnalysis" class="space-y-4 max-w-2xl">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.24em] text-red-400/80">Archive overview</p>
              <p class="mt-1 text-sm text-gray-500">Select a session from the list to view coaching detail and open the VOD.</p>
            </div>

            <div v-if="allAnalyses.length" class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div class="rounded-xl border border-white/[0.10] px-2 py-2.5 text-center bg-[#161616]">
                <div class="text-sm font-black text-white tabular-nums">{{ allAnalyses.length }}</div>
                <div class="text-[8px] text-gray-600 mt-0.5 uppercase tracking-wide">Games</div>
              </div>
              <div class="rounded-xl border border-white/[0.10] px-2 py-2.5 text-center bg-[#161616]">
                <div class="text-sm font-black tabular-nums" :class="winRate >= 50 ? 'text-green-400' : 'text-red-400'">{{ winRate }}%</div>
                <div class="text-[8px] text-gray-600 mt-0.5 uppercase tracking-wide">Win rate</div>
              </div>
              <div class="rounded-xl border border-white/[0.10] px-2 py-2.5 text-center bg-[#161616]">
                <div class="text-sm font-black tabular-nums" :class="avgScore !== null ? scoreColor(avgScore) : 'text-gray-600'">{{ avgScore != null ? avgScore * 10 : '—' }}</div>
                <div class="text-[8px] text-gray-600 mt-0.5 uppercase tracking-wide">Avg score</div>
              </div>
              <div class="rounded-xl border border-white/[0.10] px-2 py-2.5 text-center bg-[#161616]">
                <div class="text-sm font-black text-white tabular-nums">{{ avgKD }}</div>
                <div class="text-[8px] text-gray-600 mt-0.5 uppercase tracking-wide">Avg K/D</div>
              </div>
            </div>

            <div v-if="topAgent || topMap" class="grid sm:grid-cols-2 gap-2">
              <div v-if="topAgent" class="flex items-center gap-3 rounded-xl border border-white/[0.10] bg-[#161616] px-3 py-3">
                <div class="h-12 w-12 rounded-xl overflow-hidden border border-white/10 p-1" :style="{ background: `linear-gradient(145deg, ${getAgentColor(topAgent)}33, #111)` }">
                  <img v-if="getAgentImage(topAgent)" :src="getAgentImage(topAgent)" class="h-full w-full object-contain" alt="" />
                </div>
                <div>
                  <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">Most played agent</p>
                  <p class="text-sm font-bold text-white">{{ topAgent }}</p>
                </div>
              </div>
              <div v-if="topMap" class="flex items-center gap-3 rounded-xl border border-white/[0.10] bg-[#161616] px-3 py-3">
                <div class="h-16 w-24 flex-shrink-0 rounded-lg overflow-hidden border border-white/10">
                  <img
                    v-if="getMapImage(topMap)"
                    :src="getMapImage(topMap)"
                    class="h-full w-full object-cover"
                    alt=""
                  />
                </div>
                <div>
                  <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">Top map</p>
                  <p class="text-sm font-bold text-white">{{ formatMapLabel(topMap) }}</p>
                </div>
              </div>
            </div>

            <div v-if="chartData" class="rounded-xl border border-white/[0.10] overflow-hidden bg-[#161616]">
              <div class="flex items-center gap-2 px-4 py-2 border-b border-white/[0.07]">
                <span class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-500">Score trend</span>
                <div class="flex-1" />
                <span class="text-[9px] font-bold" :class="chartData.up ? 'text-green-400' : 'text-red-400'">
                  {{ chartData.up ? '↑' : '↓' }} {{ chartData.last * 10 }}
                </span>
              </div>
              <div class="px-3 py-2">
                <svg width="100%" :height="chartData.H" :viewBox="`0 0 ${chartData.W} ${chartData.H}`" preserveAspectRatio="none" class="block h-24 w-full">
                  <defs>
                    <linearGradient id="hist-area-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" :stop-color="chartData.up ? '#4ade80' : '#f87171'" stop-opacity="0.3"/>
                      <stop offset="100%" :stop-color="chartData.up ? '#4ade80' : '#f87171'" stop-opacity="0"/>
                    </linearGradient>
                  </defs>
                  <line v-for="gl in chartData.gridLines" :key="gl.score" :x1="chartData.pad" :y1="gl.y" :x2="chartData.W - chartData.pad" :y2="gl.y" stroke="rgba(255,255,255,0.05)" stroke-width="0.75"/>
                  <path :d="chartData.areaPath" fill="url(#hist-area-grad)" />
                  <path :d="chartData.linePath" fill="none" :stroke="chartData.up ? '#4ade80' : '#f87171'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <div class="flex justify-between mt-1">
                  <span class="text-[8px] text-gray-700">{{ chartData.firstDate }}</span>
                  <span class="text-[8px] text-gray-700">{{ chartData.lastDate }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Session detail -->
          <div v-else class="space-y-4">
            <!-- Map + agent hero -->
            <div class="history-hero relative overflow-hidden rounded-2xl border border-white/[0.10]">
              <div class="absolute inset-0">
                <img
                  v-if="selectedAnalysis.map && getMapImage(selectedAnalysis.map)"
                  :src="getMapImage(selectedAnalysis.map)"
                  class="h-full w-full object-cover"
                  alt=""
                />
                <div class="absolute inset-0 bg-gradient-to-r from-black/92 via-black/72 to-black/45" />
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
              </div>
              <div class="relative flex flex-col lg:flex-row gap-4 p-4 min-h-[180px]">
                <div class="flex items-end gap-4 flex-1 min-w-0">
                  <div
                    class="relative h-24 w-24 flex-shrink-0 rounded-2xl overflow-hidden border border-white/15 bg-black/50 shadow-2xl"
                    :style="selectedAnalysis.agent ? { boxShadow: `0 0 32px ${getAgentColor(selectedAnalysis.agent)}33` } : {}"
                  >
                    <img
                      v-if="selectedAnalysis.agent && getAgentImage(selectedAnalysis.agent)"
                      :src="getAgentImage(selectedAnalysis.agent)"
                      class="h-full w-full object-contain p-2"
                      alt=""
                    />
                  </div>
                  <div class="min-w-0 pb-1">
                    <p class="text-[10px] font-black uppercase tracking-[0.22em] text-red-400/90">Session review</p>
                    <h2 class="text-xl font-black text-white truncate">{{ selectedAnalysis.agent || 'Unknown agent' }}</h2>
                    <p class="text-sm text-gray-300 font-medium">{{ formatMapLabel(selectedAnalysis.map) || 'Unknown map' }}</p>
                    <div class="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        v-if="selectedAnalysis.agent"
                        class="rounded px-1.5 py-px text-[9px] font-bold uppercase"
                        :style="{ color: getRoleColor(getAgentRole(selectedAnalysis.agent)), backgroundColor: getRoleColor(getAgentRole(selectedAnalysis.agent)) + '22' }"
                      >{{ getAgentRole(selectedAnalysis.agent) }}</span>
                      <span
                        v-if="isDisplayableGameMode(selectedAnalysis.game_mode)"
                        class="rounded-full border border-white/10 bg-white/[0.05] px-2 py-px text-[9px] font-semibold text-gray-500"
                      >{{ formatGameMode(selectedAnalysis.game_mode) }}</span>
                      <span class="text-[10px] text-gray-500">{{ formatDate(selectedAnalysis.created_at) }}</span>
                      <span
                        v-if="selectedAnalysis.rank && getRankIconUrl(selectedAnalysis.rank)"
                        class="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-1.5 py-0.5"
                      >
                        <img :src="getRankIconUrl(selectedAnalysis.rank)!" class="h-4 w-4 object-contain" :alt="selectedAnalysis.rank" />
                        <span class="text-[10px] font-bold" :style="{ color: getRankHexColor(selectedAnalysis.rank) }">{{ selectedAnalysis.rank }}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  v-if="selectedAnalysis.map && getMapImage(selectedAnalysis.map)"
                  class="relative h-36 w-full sm:w-56 lg:w-60 flex-shrink-0 rounded-xl overflow-hidden border border-white/15 shadow-xl self-stretch sm:self-center"
                >
                  <img :src="getMapImage(selectedAnalysis.map)" class="h-full w-full object-cover" alt="" />
                  <div class="absolute inset-0 bg-gradient-to-r from-black/25 via-black/10 to-black/50" />
                  <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/15" />
                  <p class="absolute bottom-2 left-2.5 text-[10px] font-bold uppercase tracking-wider text-white/90 drop-shadow-md">
                    {{ formatMapLabel(selectedAnalysis.map) }}
                  </p>
                  <div
                    v-if="selectedAnalysis.overall_score != null"
                    class="absolute inset-y-0 right-0 flex w-[42%] min-w-[5.5rem] flex-col items-center justify-center gap-1 border-l border-white/10 bg-black/45 px-2 py-3 backdrop-blur-md"
                  >
                    <span
                      class="text-3xl font-black tabular-nums leading-none drop-shadow-lg"
                      :class="selectedAnalysis.overall_score >= 78 ? 'text-green-400' : selectedAnalysis.overall_score >= 50 ? 'text-yellow-400' : 'text-red-400'"
                    >{{ selectedAnalysis.overall_score * 10 }}</span>
                    <span class="rounded-md px-2 py-0.5 text-[10px] font-bold text-center leading-tight" :class="scoreGradeBadgeClass(selectedAnalysis.overall_score)">
                      {{ scoreGrade(selectedAnalysis.overall_score) }} · {{ scoreLabel(selectedAnalysis.overall_score) }}
                    </span>
                  </div>
                </div>

                <div
                  v-else-if="selectedAnalysis.overall_score != null"
                  class="flex flex-col items-end justify-center flex-shrink-0 rounded-xl border border-white/15 bg-black/40 px-4 py-3 backdrop-blur-sm"
                >
                  <span
                    class="text-4xl font-black tabular-nums leading-none"
                    :class="selectedAnalysis.overall_score >= 78 ? 'text-green-400' : selectedAnalysis.overall_score >= 50 ? 'text-yellow-400' : 'text-red-400'"
                  >{{ selectedAnalysis.overall_score * 10 }}</span>
                  <span class="mt-1 rounded-md px-2 py-0.5 text-xs font-bold" :class="scoreGradeBadgeClass(selectedAnalysis.overall_score)">
                    {{ scoreGrade(selectedAnalysis.overall_score) }} · {{ scoreLabel(selectedAnalysis.overall_score) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Match stats -->
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <div v-if="selectedAnalysis.rank && getRankIconUrl(selectedAnalysis.rank)" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
                <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">Rank</p>
                <div class="mt-1 flex items-center gap-1.5">
                  <img :src="getRankIconUrl(selectedAnalysis.rank)!" class="h-6 w-6 object-contain" :alt="selectedAnalysis.rank" />
                  <p class="text-xs font-bold leading-tight" :style="{ color: getRankHexColor(selectedAnalysis.rank) }">{{ selectedAnalysis.rank }}</p>
                </div>
              </div>
              <div class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-center">
                <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">Result</p>
                <p class="mt-1 text-sm font-black" :class="selectedAnalysis.won ? 'text-green-400' : selectedAnalysis.won === false ? 'text-red-400' : 'text-gray-500'">
                  {{ selectedAnalysis.won == null ? '—' : selectedAnalysis.won ? 'WIN' : 'LOSS' }}
                </p>
              </div>
              <div v-if="selectedAnalysis.rounds_won != null" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-center">
                <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">Rounds</p>
                <p class="mt-1 text-sm font-black tabular-nums text-gray-200">{{ selectedAnalysis.rounds_won }}–{{ selectedAnalysis.rounds_lost }}</p>
              </div>
              <div v-if="selectedAnalysis.kills != null" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-center">
                <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">K/D/A</p>
                <p class="mt-1 text-sm font-black tabular-nums font-mono text-gray-200">
                  {{ selectedAnalysis.kills }}/{{ selectedAnalysis.deaths }}/{{ selectedAnalysis.assists }}
                </p>
              </div>
              <div v-if="displayAcs(selectedAnalysis) != null" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-center">
                <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">ACS</p>
                <p class="mt-1 text-sm font-black tabular-nums text-gray-200">{{ displayAcs(selectedAnalysis) }}</p>
              </div>
              <div v-if="selectedAnalysis.hs_pct != null" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-center">
                <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">Headshot</p>
                <p class="mt-1 text-sm font-black tabular-nums" :class="selectedAnalysis.hs_pct >= 25 ? 'text-orange-400' : 'text-gray-300'">{{ selectedAnalysis.hs_pct }}%</p>
              </div>
              <div v-if="expandedDetail?.ally_score != null" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-center">
                <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">Scoreline</p>
                <p class="mt-1 text-sm font-black tabular-nums">
                  <span :class="(expandedDetail.ally_score ?? 0) > (expandedDetail.enemy_score ?? 0) ? 'text-green-400' : 'text-white'">{{ expandedDetail.ally_score }}</span>
                  <span class="text-gray-600">–</span>
                  <span class="text-gray-500">{{ expandedDetail.enemy_score }}</span>
                </p>
              </div>
            </div>

            <div v-if="detailLoading" class="flex items-center justify-center gap-2 py-10">
              <svg class="h-5 w-5 animate-spin text-gray-600" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span class="text-sm text-gray-500">Loading coaching detail…</span>
            </div>

            <template v-else>
              <TacticalIntelBrief v-if="expandedBrief" :brief="expandedBrief" />

              <div v-else-if="expandedDetail?.verdict" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                <p class="text-[9px] font-bold uppercase tracking-[0.16em] text-gray-600 mb-1.5">Coach verdict</p>
                <p class="text-sm italic leading-relaxed text-gray-400">{{ expandedDetail.verdict }}</p>
              </div>

              <div v-if="expandedDetail?.priority_improvements?.length && !expandedBrief?.improvements.length" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 space-y-2">
                <p class="text-[9px] font-black uppercase tracking-widest text-gray-600">Focus areas</p>
                <div v-for="(imp, i) in expandedDetail.priority_improvements" :key="i" class="flex gap-2">
                  <span class="text-[10px] font-bold flex-shrink-0" :class="i === 0 ? 'text-red-400' : 'text-gray-600'">{{ i + 1 }}</span>
                  <p class="text-sm text-gray-400 leading-relaxed">{{ imp }}</p>
                </div>
              </div>

              <div v-if="expandedDetail?.coaching_tags?.length" class="flex flex-wrap gap-1.5">
                <span
                  v-for="tag in expandedDetail.coaching_tags"
                  :key="tag"
                  class="rounded-full border border-red-500/15 bg-red-500/10 px-2.5 py-0.5 text-[9px] font-semibold capitalize text-red-400/80"
                >{{ tag.replace(/_/g, ' ') }}</span>
              </div>

              <p v-if="!expandedDetail && !expandedBrief && !detailLoading" class="text-sm text-gray-600 text-center py-4">
                No structured coaching notes for this session.
              </p>
            </template>

            <button
              type="button"
              class="w-full rounded-xl border border-red-500/30 bg-red-500/10 py-3 text-sm font-bold text-red-100 transition-colors hover:border-red-500/45 hover:bg-red-500/15 disabled:opacity-50"
              :disabled="timelineLoadingId === selectedAnalysis.id"
              @click="openTimeline(selectedAnalysis.id)"
            >
              {{ timelineLoadingId === selectedAnalysis.id ? 'Opening VOD…' : 'Open VOD review →' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { AnalysisItem } from '../env.d.ts'
import {
  getAgentImage,
  getAgentRole,
  getAgentColor,
  getMapImage,
  getRankIconUrl,
  getRankHexColor,
  getRoleColor,
  formatGameMode,
  formatMapLabel,
  isDisplayableGameMode,
  normalizeCombatScoreToAcs,
  normalizeMapAssetKey,
  NON_MAP_NAMES,
} from '../lib/valorant'
import { buildTacticalIntelBrief } from '../lib/coaching-brief'
import type { TacticalIntelBrief as TacticalIntelBriefData } from '../lib/coaching-brief'
import TacticalIntelBrief from '../components/TacticalIntelBrief.vue'
import { pendingTimeline } from '../stores/pendingTimeline'

const router = useRouter()
const RESULT_FILTERS = ['All', 'Wins', 'Losses', 'Scored'] as const
const allAnalyses = ref<AnalysisItem[]>([])
const loading = ref(true)
const activeFilter = ref<(typeof RESULT_FILTERS)[number]>('All')
const activeMap = ref<string | null>(null)
const timelineLoadingId = ref<number | null>(null)

const selectedId = ref<number | null>(null)
const detailLoading = ref(false)
const expandedDetail = ref<{
  verdict: string | null
  top_issue: string | null
  priority_improvements: string[]
  coaching_tags: string[]
  ally_score: number | null
  enemy_score: number | null
} | null>(null)

const expandedBrief = computed((): TacticalIntelBriefData | null => {
  const d = expandedDetail.value
  const raw = d?.top_issue ?? d?.verdict ?? null
  if (!raw) return null
  return buildTacticalIntelBrief(raw, {
    improvements: d?.priority_improvements ?? [],
    tags: d?.coaching_tags ?? [],
    source: 'coaching',
  })
})

function displayAcs(a: AnalysisItem): number | null {
  return normalizeCombatScoreToAcs(a.combat_score, a.rounds_won, a.rounds_lost)
}

function pickTopByCount(
  analyses: AnalysisItem[],
  pick: (item: AnalysisItem) => string | null | undefined,
): string | null {
  const counts = new Map<string, number>()
  for (const item of analyses) {
    const key = pick(item)
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let best: string | null = null
  let max = 0
  for (const [key, count] of counts) {
    if (count > max) {
      max = count
      best = key
    }
  }
  return best
}

const topAgent = computed(() => pickTopByCount(allAnalyses.value, a => a.agent))
const topMap = computed(() => {
  const key = pickTopByCount(allAnalyses.value, a => {
    if (!a.map) return null
    const normalized = normalizeMapAssetKey(a.map)
    return normalized && !NON_MAP_NAMES.has(normalized) ? normalized : null
  })
  return key
})

const selectedAnalysis = computed(() =>
  allAnalyses.value.find(a => a.id === selectedId.value) ?? null,
)

function isWideLayout(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
}

onMounted(async () => {
  window.api.discord.setState('reviewing').catch(() => {})
  allAnalyses.value = await window.api.analyses.get(100).catch(() => [])
  loading.value = false
})

onUnmounted(() => {
  window.api.discord.setState('idle').catch(() => {})
})

const availableMaps = computed(() => {
  const keys = new Set<string>()
  for (const a of allAnalyses.value) {
    if (!a.map) continue
    const key = normalizeMapAssetKey(a.map)
    if (!key || NON_MAP_NAMES.has(key)) continue
    keys.add(key)
  }
  return [...keys].sort((a, b) => formatMapLabel(a).localeCompare(formatMapLabel(b)))
})

const filteredAnalyses = computed(() => {
  let list = allAnalyses.value
  switch (activeFilter.value) {
    case 'Wins': list = list.filter(a => a.won); break
    case 'Losses': list = list.filter(a => a.won === false || a.won === 0 as unknown); break
    case 'Scored': list = list.filter(a => a.overall_score != null); break
  }
  if (activeMap.value) list = list.filter(a => normalizeMapAssetKey(a.map) === activeMap.value)
  return list
})

watch([filteredAnalyses, loading], () => {
  if (loading.value) return
  const list = filteredAnalyses.value
  if (!list.length) {
    selectedId.value = null
    expandedDetail.value = null
    return
  }
  const stillVisible = selectedId.value != null && list.some(a => a.id === selectedId.value)
  if (stillVisible) return
  if (isWideLayout()) {
    void selectSession(list[0])
  } else {
    selectedId.value = null
    expandedDetail.value = null
  }
})

const groupedAnalyses = computed(() => {
  const groups: Array<{ label: 'Today' | 'Yesterday' | 'This Week' | 'Earlier'; items: AnalysisItem[] }> = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This Week', items: [] },
    { label: 'Earlier', items: [] },
  ]

  for (const analysis of filteredAnalyses.value) {
    const label = getDateGroup(analysis.created_at)
    const group = groups.find(entry => entry.label === label)
    if (group) group.items.push(analysis)
  }

  return groups.filter(group => group.items.length > 0)
})

const winRate = computed(() => {
  const withResult = allAnalyses.value.filter(a => a.won != null)
  if (!withResult.length) return 0
  return Math.round((withResult.filter(a => a.won).length / withResult.length) * 100)
})

const avgScore = computed<number | null>(() => {
  const scored = allAnalyses.value.filter(a => a.overall_score != null)
  if (!scored.length) return null
  return Math.round(scored.reduce((sum, a) => sum + (a.overall_score ?? 0), 0) / scored.length)
})

const avgKD = computed<string>(() => {
  const withKD = allAnalyses.value.filter(a => a.kda != null)
  if (!withKD.length) return '—'
  return (withKD.reduce((sum, a) => sum + (a.kda ?? 0), 0) / withKD.length).toFixed(2)
})

const chartData = computed(() => {
  const scored = [...allAnalyses.value].filter(a => a.overall_score != null).reverse()
  if (scored.length < 2) return null
  const scores = scored.map(a => a.overall_score!)
  const min = Math.min(...scores, 0)
  const max = Math.max(...scores, 100)
  const range = max - min || 1
  const W = 100, H = 64, pad = 4
  const pts = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * (W - pad * 2)
    const y = H - pad - ((s - min) / range) * (H - pad * 2)
    return `${x.toFixed(1)} ${y.toFixed(1)}`
  })
  const areaPath = `M ${pts[0]} ` + pts.slice(1).map(p => `L ${p}`).join(' ') +
    ` L ${(pad + (W - pad * 2)).toFixed(1)} ${H} L ${pad} ${H} Z`
  const linePath = `M ${pts[0]} ` + pts.slice(1).map(p => `L ${p}`).join(' ')
  const last = scores[scores.length - 1]
  const up = last >= scores[0]
  const gridLines = [0, 50, 100].map(score => ({
    score,
    y: parseFloat((H - pad - ((score - min) / range) * (H - pad * 2)).toFixed(1)),
  }))
  const firstDate = formatDate(scored[0].created_at)
  const lastDate = formatDate(scored[scored.length - 1].created_at)
  return { areaPath, linePath, W, H, up, last, gridLines, pad, firstDate, lastDate }
})

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400'
  if (score >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

function scoreGrade(score: number): string {
  if (score >= 90) return 'S'
  if (score >= 78) return 'A'
  if (score >= 65) return 'B'
  if (score >= 50) return 'C'
  if (score >= 35) return 'D'
  return 'E'
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Outstanding'
  if (score >= 78) return 'Strong Game'
  if (score >= 65) return 'Solid'
  if (score >= 50) return 'Room to Improve'
  if (score >= 35) return 'Below Average'
  return 'Lots to Work On'
}

function scoreGradeBadgeClass(score: number): string {
  if (score >= 90) return 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
  if (score >= 78) return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
  if (score >= 65) return 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
  if (score >= 50) return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
  if (score >= 35) return 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
  return 'bg-red-500/20 text-red-400 border border-red-500/30'
}

function getDateGroup(d: string): 'Today' | 'Yesterday' | 'This Week' | 'Earlier' {
  const target = new Date(d)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const diffDays = Math.floor((startOfToday.getTime() - startOfTarget.getTime()) / 86_400_000)

  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return 'This Week'
  return 'Earlier'
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

async function selectSession(a: AnalysisItem) {
  selectedId.value = a.id
  expandedDetail.value = null
  if (!a.overall_score && !['queued', 'processing', 'pending'].includes(a.status)) {
    detailLoading.value = false
    return
  }
  detailLoading.value = true
  try {
    expandedDetail.value = await window.api.analyses.getDetail(a.id)
  } catch { /* ignore */ } finally {
    detailLoading.value = false
  }
}

async function openTimeline(id: number) {
  timelineLoadingId.value = id
  try {
    const data = await window.api.analyses.getTimeline(id)
    if (data) {
      pendingTimeline.value = data
      router.push({ path: '/vod-review', query: { timelineId: id } })
    } else {
      router.push('/vod-review')
    }
  } catch {
    router.push('/vod-review')
  } finally {
    timelineLoadingId.value = null
  }
}
</script>

<style scoped>
.scrollbar-hide {
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

.history-list-row {
  position: relative;
}

.history-list-row--won::before,
.history-list-row--lost::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 999px;
}

.history-list-row--won::before {
  background: #22c55e;
}

.history-list-row--lost::before {
  background: #ef4444;
}

.history-hero {
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
}

.history-map-pill {
  position: relative;
  overflow: hidden;
  width: 5.75rem;
  height: 2.75rem;
  border-radius: 0.625rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}

.history-map-pill:hover {
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.history-map-pill--active {
  border-color: rgba(239, 68, 68, 0.5);
  box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.12), 0 6px 16px rgba(0, 0, 0, 0.35);
}

.history-map-pill--all {
  width: 4.75rem;
  background: rgba(255, 255, 255, 0.03);
}

.history-map-pill__bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transition: transform 0.35s ease;
}

.history-map-pill:hover .history-map-pill__bg {
  transform: scale(1.06);
}

.history-map-pill__shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.88) 0%,
    rgba(0, 0, 0, 0.42) 42%,
    rgba(0, 0, 0, 0.12) 100%
  );
  transition: background 0.2s;
}

.history-map-pill__shade--all {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.06) 0%,
    rgba(255, 255, 255, 0.02) 100%
  );
}

.history-map-pill--active .history-map-pill__shade:not(.history-map-pill__shade--all) {
  background: linear-gradient(
    to top,
    rgba(127, 29, 29, 0.72) 0%,
    rgba(0, 0, 0, 0.55) 48%,
    rgba(0, 0, 0, 0.2) 100%
  );
}

.history-map-pill--active .history-map-pill__shade--all {
  background: linear-gradient(
    135deg,
    rgba(239, 68, 68, 0.22) 0%,
    rgba(255, 255, 255, 0.04) 100%
  );
}

.history-map-pill__label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  padding: 0.3rem 0.4rem;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: center;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.65);
  line-height: 1.1;
}

.history-map-pill--active .history-map-pill__label {
  color: #fff;
  background: rgba(0, 0, 0, 0.52);
}
</style>
