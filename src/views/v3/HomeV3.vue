<script setup lang="ts">
import { plural } from '../../lib/plural'
/**
 * UI v3 Home (Coach) — board 4. Reading order: last match score → the coach's sentence →
 * one red action → recent form → focus → evidence. Real data only; honest empty states.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDashboard } from '../../composables/useDashboard'
import HomePregameV3 from '../../components/v3/home/HomePregameV3.vue'
import { recordingNeedsUserAction } from '../../lib/recording-library'
import { formatMapLabel, getAgentImage, getMapImage } from '../../lib/valorant'
import { decidedStats, type FocusUpdate } from '../../lib/focus'
import UfHeroBand from '../../components/v3/UfHeroBand.vue'
import UfButton from '../../components/v3/UfButton.vue'
import UfStatRow from '../../components/v3/UfStatRow.vue'
import UfIcon from '../../components/v3/UfIcon.vue'
import UfRoundsLine from '../../components/v3/UfRoundsLine.vue'
import UfSkeleton from '../../components/v3/UfSkeleton.vue'
import HomeFocusPanel from '../../components/v3/home/HomeFocusPanel.vue'
import HomeLiveStatus from '../../components/v3/home/HomeLiveStatus.vue'
import HomeRankStrip from '../../components/v3/home/HomeRankStrip.vue'
import StartingReportCardV3 from '../../components/v3/starting/StartingReportCardV3.vue'
import SessionCoachV3 from '../../components/v3/ideas/SessionCoachV3.vue'
import DashboardBanners from '../../components/dashboard/DashboardBanners.vue'
import GameSetup from '../../components/v3/games/GameSetup.vue'
import GameHomeSummary from '../../components/v3/games/GameHomeSummary.vue'
import GameFiles from '../../components/v3/games/GameFiles.vue'
import { useGameData } from '../../components/v3/games/useGameData'
import { GAME_NAME, type DemoGame } from '../../components/v3/games/game-data'
import DashboardDevTools from '../../components/dashboard/DashboardDevTools.vue'
import {
  analysedThisWeek,
  liveStatus,
  PRIMARY_LABEL, agentFullPortrait, coachLine, heroScore, homeStateNote, pickPrimaryAction, relativeDay, resultTone, resultWord,
} from '../../components/v3/home/home-v3'
import upforgeIcon from '../../assets/upforge-icon.webp'
import cs2Art from '../../assets/games/cs2-card-bg.webp'
import deadlockArt from '../../assets/games/deadlock-card-bg.webp'
import lolArt from '../../assets/games/lol-card-bg.webp'
import valorantArt from '../../assets/games/valorant-card-bg.webp'
import CoachRepliesV3 from '../../components/v3/roster-flow/CoachRepliesV3.vue'
import CoachInvitePromptV3 from '../../components/v3/roster-flow/CoachInvitePromptV3.vue'

const d = useDashboard()
const router = useRouter()
const focusLatest = ref<FocusUpdate | null>(null)
/** The focus panel has answered at least once (cache or network). Until then the coach line waits. */
const focusAnswered = ref(false)
function onFocusLatest(latest: FocusUpdate | null) {
  focusLatest.value = latest
  focusAnswered.value = true
}
/** Nothing to draw yet: first-ever load for this game. Cached data skips this entirely. */
const homeLoading = computed(() => d.analysesLoading.value && !d.dashboardAnalyses.value.length)
/** Sections that were skeletons fade in once; cached screens draw without animation. */
const fromSkeleton = homeLoading.value

// CS2 / Deadlock / League: setup steps until the game is set up, then its real stats (old game panels).
const gd = useGameData(d.primaryGame)
const demoGame = computed<DemoGame | null>(() => (d.isValorant.value ? null : d.primaryGame.value as DemoGame))
const gameSetupShown = computed(() => !!demoGame.value && gd.loaded.value && !gd.error.value && gd.setup.value?.ready === false)

const last = computed(() => d.dashboardAnalyses.value[0] ?? null)
const recent = computed(() => d.dashboardAnalyses.value.slice(0, 4))
const score = computed(() => heroScore(last.value))
const tone = computed(() => resultTone(last.value?.won))
const gameArt = computed(() => ({ valorant: valorantArt, cs2: cs2Art, deadlock: deadlockArt, lol: lolArt })[d.primaryGame.value])
const heroArt = computed(() => (d.isValorant.value && last.value?.map ? getMapImage(last.value.map) : '') || gameArt.value)
const heroAgent = computed(() => (d.isValorant.value ? agentFullPortrait(getAgentImage(last.value?.agent)) : ''))
const heroMeta = computed(() => {
  const a = last.value
  if (!a) return ''
  return [a.map ? formatMapLabel(a.map) : null, a.agent, d.formatMode(a.game_mode), relativeDay(a.created_at)].filter(Boolean).join(' · ')
})
const heroStats = computed(() => {
  const a = last.value
  if (!a) return []
  const out: Array<{ v: string; l: string }> = []
  if (a.kills != null && a.deaths != null) out.push({ v: `${a.kills}/${a.deaths}/${a.assists ?? 0}`, l: 'K/D/A' })
  if (a.hs_pct != null) out.push({ v: `${Math.round(a.hs_pct)}%`, l: 'headshots' })
  const acs = d.displayAcs(a)
  if (acs != null) out.push({ v: String(acs), l: 'ACS' })
  return out
})

const coach = computed(() => coachLine(focusLatest.value, d.lastInsight.value, last.value
  ? { won: last.value.won, mapLabel: last.value.map ? formatMapLabel(last.value.map) : null, roundsWon: last.value.rounds_won, roundsLost: last.value.rounds_lost }
  : null))
// Board 13: an early read (under 10 matches) or a welcome back after 14+ days away.
const stateNote = computed(() => (homeLoading.value ? null : homeStateNote(d.dashboardAnalyses.value)))
const coachPending = computed(() => !coach.value && (homeLoading.value || (d.isValorant.value && !focusAnswered.value)))
const primary = computed(() => pickPrimaryAction({
  hasMatch: !!last.value, obsConnected: d.status.value.obsConnected, isValorant: d.isValorant.value,
}))
// Live pipeline: one quiet line while something is happening (old dashboard: Live ops panel).
const live = computed(() => {
  const s = d.status.value
  const uploading = d.pendingRecordings.value.find(r => d.recInFlight(r) && d.recUploadProgress(r) != null)
  const analysing = d.pendingRecordings.value.filter(r => r.pipelineStatus === 'analysing')
  const p = analysing.length === 1 ? analysing[0].analysisProgress : null
  return liveStatus({
    recording: s.recording,
    recordingStarting: s.recordingStarting,
    waitingForMatch: s.waitingForMatch,
    elapsed: d.recordingElapsed.value,
    uploadPct: uploading ? d.recUploadProgress(uploading) : null,
    uploads: d.inFlightUploadCount.value,
    analysisPct: typeof p === 'number' && Number.isFinite(p) ? p : null,
    analyses: d.inFlightAnalysisCount.value,
  })
})
const weekCount = computed(() => analysedThisWeek(d.dashboardAnalyses.value))

// Weekly drill from the existing weekly plan (Valorant only; old dashboard right rail).
const drillBusy = ref(false)
async function runWeeklyDrill() {
  const plan = d.weeklyFocus.value
  if (!plan || drillBusy.value) return
  drillBusy.value = true
  try {
    await window.api.trainer.launch({ scenario: plan.drill.scenario, difficulty: 'medium', duration: 60 })
  } catch {
    await d.router.push('/training')
  } finally {
    drillBusy.value = false
  }
}

// Round shape of the last synced match (derived on the PC from the Riot match; Valorant focus loop).
const rounds = computed(() => focusLatest.value?.rounds ?? null)
const reportMatchId = computed(() => (d.isValorant.value ? focusLatest.value?.match_id ?? null : null))
function openReport(): void { if (reportMatchId.value) router.push(`/report/${reportMatchId.value}`).catch(() => {}) }
const roundsTitle = computed(() => {
  const r = rounds.value
  if (!r) return ''
  return `${r.map ? `${formatMapLabel(r.map)} · ` : ''}${r.ally}–${r.enemy}`
})
const decided = computed(() => decidedStats(rounds.value))

const needsAction = computed(() => d.pendingRecordings.value.filter(recordingNeedsUserAction).length)

const form = computed(() => d.lastFivePerf.value)
const formStats = computed(() => {
  const f = form.value
  if (!f) return []
  const items: Array<{ value: string; caption: string; sub?: string; tone?: 'win' | 'loss' }> = [
    { value: `${f.wins}–${f.losses}`, caption: 'Won–lost', sub: `Last ${f.wl.length} analysed matches` },
  ]
  if (f.avgAcs != null) items.push({ value: String(f.avgAcs), caption: 'Average ACS', sub: 'Combat score per round' })
  if (f.avgHs != null) items.push({ value: `${f.avgHs}%`, caption: 'Headshots', sub: 'Average across those matches' })
  if (f.avgScore != null) items.push({ value: String(f.avgScore), caption: 'Coach score', sub: 'Average AI review score' })
  return items
})

const nextSteps = computed(() => [
  d.status.value.obsConnected
    ? { title: 'Play a match', text: 'Recording starts by itself when the match loads.' }
    : { title: 'Set up recording', text: 'Two minutes in Settings. Recording is optional for match notes.' },
  { title: 'Get your coach note', text: 'Straight after the match: what cost you rounds, in one sentence.' },
  { title: 'Work on one habit', text: 'Your focus is checked automatically over your next games.' },
])

async function runPrimary() {
  if (primary.value === 'open_last_match' && last.value) await d.openAnalysisRow(last.value)
  else if (primary.value === 'setup_recording') await d.router.push('/settings?tab=recording')
  else await window.api.app.syncFocus?.()
}
</script>

<template>
  <div class="home3">
    <DashboardBanners />

    <UfHeroBand :art="heroArt" :agent="heroAgent" :tone="tone" :result="last ? resultWord(last.won) : ''"
      :meta="last ? heroMeta : homeLoading ? '' : 'No analysed matches yet'" :art-position="d.isValorant.value ? 'center 40%' : 'center'">
      <div v-if="homeLoading" role="status" aria-label="Loading your last match"><UfSkeleton :w="320" :h="112" /></div>
      <div v-else-if="score" class="uf-d1" :class="{ 'uf-reveal': fromSkeleton }" :aria-label="`${score.won} to ${score.lost}`">
        {{ score.won }}<span class="home3-dash">–</span>{{ score.lost }}
      </div>
      <div v-else-if="last" class="uf-d2">{{ last.map ? formatMapLabel(last.map) : d.theme.value.name }}</div>
      <div v-else class="uf-d2">Your coach is ready</div>
      <template #stats>
        <template v-if="homeLoading"><UfSkeleton v-for="i in 3" :key="i" :w="110" :h="26" /></template>
        <span v-for="s in heroStats" :key="s.l" class="home3-stat" :class="{ 'uf-reveal': fromSkeleton }"><span class="uf-d4">{{ s.v }}</span><span class="uf-t4">{{ s.l }}</span></span>
      </template>
    </UfHeroBand>

    <HomeRankStrip v-if="d.isValorant.value" class="home3-rank" />

    <div class="home3-body" :class="{ 'uf-refreshing': d.refreshing.value }">
      <div class="home3-main">
        <SessionCoachV3 v-if="d.isValorant.value" @warmup="d.router.push('/training')" />
        <p v-if="d.refreshFailed.value && !homeLoading" class="uf-t4 home3-stale" role="status">
          Couldn't refresh · showing your last data
          <button type="button" class="uf-link" @click="d.retryRefresh()">Retry</button>
        </p>
        <HomePregameV3 />
        <StartingReportCardV3 :game="d.primaryGame.value" mode="home" />
        <HomeLiveStatus v-if="live" :status="live" :busy="d.stopping.value" @stop="d.stopRecording()" @open="d.router.push('/recordings')" />
        <section class="uf-rise uf-d2s home3-coach" aria-label="Coach">
          <p class="home3-coach-k"><img :src="upforgeIcon" alt="" width="16" height="16"><span class="uf-t4" style="color: var(--uf-muted)">Your coach</span></p>
          <p v-if="stateNote" class="home3-state uf-t4" :data-kind="stateNote.kind"><span class="uf-label">{{ stateNote.label }}</span> {{ stateNote.line }}</p>
          <div v-if="coachPending" class="home3-coach-skel" role="status" aria-label="Loading your coach">
            <UfSkeleton :w="'min(760px, 100%)'" :h="30" />
            <UfSkeleton :w="'min(520px, 80%)'" :h="30" />
            <UfSkeleton :w="'min(420px, 60%)'" :h="16" />
          </div>
          <template v-else-if="coach">
            <p class="uf-t1" :class="{ 'uf-reveal': fromSkeleton }">{{ coach.headline }}</p>
            <p v-if="coach.next" class="uf-t2">{{ coach.next }}</p>
            <!-- Match report: the full free data report for the match this note came from -->
            <button v-if="reportMatchId" type="button" class="uf-link" style="align-self: flex-start" @click="openReport">Open match report →</button>
          </template>
          <template v-else>
            <p class="uf-t1">{{ d.status.value.obsConnected ? 'Play a match and your coach will read it.' : 'Set up recording and play a match. Your coach reads it straight after.' }}</p>
            <p class="uf-t2">{{ d.isValorant.value ? 'For Valorant, your recent matches can be checked now — no recording needed.' : d.emptyCoachingMessage.value }}</p>
          </template>
        </section>

        <div v-if="homeLoading" class="home3-actions" aria-hidden="true">
          <UfSkeleton :w="210" :h="46" /><UfSkeleton :w="150" :h="46" />
        </div>
        <div v-else class="uf-rise uf-d3s home3-actions">
          <UfButton :variant="gameSetupShown ? 'secondary' : 'primary'" :icon="primary === 'open_last_match' ? 'play' : primary === 'setup_recording' ? 'settings' : 'spark'"
            @click="runPrimary">{{ PRIMARY_LABEL[primary] }}</UfButton>
          <UfButton variant="secondary" icon="matches" @click="d.router.push('/recordings')">All matches</UfButton>
          <UfButton v-if="d.lastInsight.value" variant="link" @click="d.trainLastInsight()">Train this</UfButton>
        </div>

        <button v-if="needsAction" type="button" class="home3-attention" @click="d.router.push('/recordings')">
          <span class="home3-dot" />
          <span class="uf-t3">{{ needsAction }} recording{{ needsAction === 1 ? '' : 's' }} waiting for you</span>
          <span class="uf-t4">Upload or analyse in Matches →</span>
        </button>

        <!-- Roster flow: newest unopened coach reply (hidden when there is none). -->
        <CoachRepliesV3 />
        <CoachInvitePromptV3 />

        <template v-if="demoGame">
          <div v-if="!gd.loaded.value" class="home3-block" role="status" :aria-label="`Checking your ${GAME_NAME[demoGame]} setup`">
            <UfSkeleton :w="180" :h="12" /><UfSkeleton :w="'min(520px, 100%)'" :lines="3" />
          </div>
          <section v-else-if="gd.error.value && !gd.setup.value?.ready" class="home3-block" aria-label="Game setup">
            <p class="uf-t2">Couldn't check your {{ GAME_NAME[demoGame] }} setup right now.</p>
            <button type="button" class="uf-link" @click="gd.load(true)">Try again →</button>
          </section>
          <GameSetup v-else-if="gameSetupShown && gd.setup.value" :game="demoGame" :setup="gd.setup.value"
            :busy="gd.cs2.detecting" :error="gd.cs2.detectError" @run="gd.runSetup" />
          <GameHomeSummary v-else :game="demoGame" :data="gd" />
        </template>

        <section v-if="rounds" class="home3-rounds uf-rise uf-d4s" aria-label="Rounds in your last synced match">
          <div class="home3-form-head">
            <p class="uf-label">Rounds · {{ roundsTitle }}</p>
            <span class="home3-legend uf-t4">
              <span><i class="is-w" />Won</span><span><i class="is-l" />Lost</span><span v-if="decided.length"><i class="is-df" />You died first</span>
            </span>
          </div>
          <UfRoundsLine :rounds="rounds.rounds.map(r => ({ won: r.won, marked: r.diedFirst }))" />
          <template v-if="decided.length">
            <p class="uf-label home3-decided">What decided it</p>
            <UfStatRow :items="decided" />
          </template>
        </section>

        <section v-if="homeLoading" class="home3-form" aria-hidden="true">
          <UfSkeleton :w="120" :h="12" />
          <div class="home3-form-skel"><UfSkeleton v-for="i in 4" :key="i" :h="64" /></div>
        </section>
        <section v-else-if="formStats.length" class="home3-form uf-rise uf-d4s" aria-label="Recent form">
          <div class="home3-form-head">
            <p class="uf-label">Recent form</p>
            <ol class="home3-wl" aria-label="Results, newest first">
              <li v-for="(w, i) in form!.wl" :key="i" :class="w === true ? 'is-w' : w === false ? 'is-l' : ''"
                :aria-label="w === true ? 'Win' : w === false ? 'Loss' : 'Unknown result'" />
            </ol>
          </div>
          <UfStatRow :items="formStats" />
        </section>
        <section v-else-if="!demoGame" class="home3-form" aria-label="What happens next">
          <p class="uf-label">What happens next</p>
          <ol class="home3-steps">
            <li v-for="(s, i) in nextSteps" :key="i" class="home3-step">
              <span class="uf-d3" style="color: var(--uf-faint)">{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="uf-t3">{{ s.title }}</span><span class="uf-t4">{{ s.text }}</span>
            </li>
          </ol>
        </section>

        <DashboardDevTools />
      </div>

      <aside class="home3-side" aria-label="Focus, practice and recent matches">
        <HomeFocusPanel v-if="d.isValorant.value" @latest="onFocusLatest" />
        <div v-if="d.isValorant.value" class="uf-hair" />

        <template v-if="demoGame === 'cs2' || demoGame === 'deadlock'">
          <GameFiles :game="demoGame" :data="gd" />
          <div class="uf-hair" />
        </template>

        <section v-if="d.isValorant.value" class="home3-block" aria-label="Practice">
          <div class="home3-row-head"><p class="uf-label">Warm-up</p><span v-if="d.trainerSessionCount.value" class="uf-t4">{{ plural(d.trainerSessionCount.value, 'drill') }} done</span></div>
          <template v-if="d.weeklyFocus.value">
            <p class="uf-t3">This week: {{ d.weeklyFocus.value.drill.label }}</p>
            <p class="uf-t4">{{ d.weeklyFocus.value.goal }}</p>
          </template>
          <p v-if="d.trainerLastSession.value" class="uf-t4">Last drill: {{ d.trainerLastSession.value.scenario }} · {{ d.trainerLastSession.value.score }}</p>
          <p v-else-if="!d.weeklyFocus.value" class="uf-t4" style="color: var(--uf-muted)">A few minutes of aim drills before you queue.</p>
          <span class="home3-links">
            <button v-if="d.weeklyFocus.value" type="button" class="uf-link" :disabled="drillBusy" @click="runWeeklyDrill">Run it →</button>
            <button type="button" class="uf-link" @click="d.router.push('/training')">Open practice →</button>
          </span>
        </section>
        <div v-if="d.isValorant.value" class="uf-hair" />

        <section class="home3-block" aria-label="Recent matches">
          <div class="home3-row-head"><p class="uf-label">Recent</p><button type="button" class="uf-link" @click="d.router.push('/recordings')">All →</button></div>
          <p v-if="weekCount" class="uf-t4">{{ weekCount }} analysed this week</p>
          <template v-if="homeLoading">
            <div v-for="i in 4" :key="i" class="home3-recent home3-recent--skel" aria-hidden="true">
              <span class="home3-recent-text"><UfSkeleton :w="90" :h="14" /><UfSkeleton :w="130" :h="11" /></span>
              <UfSkeleton :w="46" :h="22" />
            </div>
          </template>
          <p v-else-if="!recent.length" class="uf-t4">No analysed matches yet.</p>
          <button v-for="a in recent" :key="a.id" type="button" class="home3-recent" :class="{ 'uf-reveal': fromSkeleton }" @click="d.openAnalysisRow(a)">
            <span class="home3-recent-text"><span class="uf-t3">{{ a.map ? formatMapLabel(a.map) : 'Match' }}</span>
              <span class="uf-t4">{{ [a.agent, relativeDay(a.created_at)].filter(Boolean).join(' · ') }}</span></span>
            <span v-if="a.rounds_won != null && a.rounds_lost != null" class="uf-d4"
              :style="{ color: a.won === true ? 'var(--uf-win)' : a.won === false ? 'var(--uf-loss)' : 'var(--uf-bone)' }">{{ a.rounds_won }}–{{ a.rounds_lost }}</span>
            <UfIcon v-else name="play" :size="14" />
          </button>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.home3 { height: 100%; display: flex; flex-direction: column; overflow-y: auto; background: var(--uf-bg); container-type: inline-size; }
.home3-dash { color: #2a3038; padding: 0 14px; }
.home3-stat { display: inline-flex; gap: 8px; align-items: baseline; }
.home3-rank { padding-left: 40px; padding-right: 40px; }
.home3-body { flex: 1; display: flex; min-height: 0; }
.home3-main { flex: 1; min-width: 0; padding: 28px 40px 24px; display: flex; flex-direction: column; gap: 22px; }
.home3-coach { display: flex; flex-direction: column; gap: 10px; max-width: 820px; }
.home3-coach p { margin: 0; }
.home3-coach-k { display: flex; gap: 8px; align-items: center; }
.home3-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.home3-attention { display: flex; gap: 12px; align-items: center; padding: 12px 0; background: none; border: 0; border-top: 1px solid var(--uf-line); border-bottom: 1px solid var(--uf-line); cursor: pointer; text-align: left; }
.home3-dot { width: 8px; height: 8px; background: var(--uf-gold); flex: none; }
.home3-form { margin-top: auto; display: flex; flex-direction: column; gap: 14px; }
.home3-form p { margin: 0; }
.home3-form-head { display: flex; justify-content: space-between; align-items: center; }
.home3-wl { display: flex; gap: 4px; margin: 0; padding: 0; list-style: none; }
.home3-wl li { width: 14px; height: 14px; background: rgba(236, 232, 225, 0.18); }
.home3-wl li.is-w { background: var(--uf-win); }
.home3-wl li.is-l { background: rgba(232, 80, 91, 0.55); }
.home3-steps { display: flex; margin: 0 -24px; padding: 0; list-style: none; }
.home3-step { flex: 1; display: flex; flex-direction: column; gap: 6px; padding: 0 24px; border-left: 1px solid var(--uf-line); }
.home3-step:first-child { border-left: 0; }
.home3-side { width: 360px; flex: none; border-left: 1px solid var(--uf-line); padding: 26px 30px 18px; display: flex; flex-direction: column; gap: 18px; overflow-y: auto; }
.home3-block { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.home3-block p { margin: 0; }
.home3-links { display: flex; gap: 18px; }
.home3-row-head { display: flex; justify-content: space-between; align-items: baseline; width: 100%; }
.home3-recent { width: 100%; display: flex; align-items: center; gap: 12px; padding: 9px 0; background: none; border: 0; border-top: 1px solid var(--uf-line); cursor: pointer; text-align: left; color: var(--uf-muted); }
.home3-recent:hover .uf-t3 { color: #fff; }
.home3-recent-text { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
@container (max-width: 1000px) { .home3-body { flex-direction: column; } .home3-side { width: auto; border-left: 0; border-top: 1px solid var(--uf-line); } }
.home3-rounds { display: flex; flex-direction: column; gap: 12px; margin-top: 32px; }
.home3-legend { display: flex; gap: 16px; }
.home3-legend > span { display: inline-flex; align-items: center; gap: 6px; }
.home3-legend i { display: inline-block; width: 9px; height: 9px; }
.home3-legend i.is-w { background: var(--uf-win); }
.home3-legend i.is-l { background: rgba(236, 232, 225, 0.22); }
.home3-legend i.is-df { width: 12px; height: 3px; background: var(--uf-red); }
.home3-decided { margin-top: 14px; }
.home3-coach-skel { display: flex; flex-direction: column; gap: 10px; }
.home3-form-skel { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
.home3-recent--skel { cursor: default; }
.home3-recent-text :deep(.uf-skel) + :deep(.uf-skel) { margin-top: 5px; }
.home3-stale { margin: 0; display: flex; gap: 10px; align-items: baseline; }
.home3-state { margin: 0 0 10px; color: var(--uf-muted); display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.home3-state .uf-label { color: var(--uf-faint); }
</style>
