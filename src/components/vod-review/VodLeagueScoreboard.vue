<script setup lang="ts">
import type { TeamPlayerSnapshot } from '../../../electron/main/riot-types'
import { getChampionImage } from '../../lib/lol'
import { formatScoreboardStat as stat, type groupScoreboardPlayers } from '../../lib/vod-scoreboard'

defineProps<{
  groups: ReturnType<typeof groupScoreboardPlayers>
  isOwnPlayer: (player: TeamPlayerSnapshot) => boolean
}>()
</script>

<template>
  <section class="league-scoreboard" aria-label="League match scoreboard">
    <p class="stat-note">Damage dealt is damage to champions. — means the stat was not captured. Final damage stats require Riot match sync.</p>
    <table>
      <thead><tr>
        <th scope="col">Player</th>
        <th scope="col">Kills</th><th scope="col">Deaths</th><th scope="col">Assists</th>
        <th scope="col">CS</th><th scope="col">Damage dealt</th><th scope="col">Damage taken</th><th scope="col">Vision score</th>
      </tr></thead>
      <tbody v-for="(group, index) in groups" :key="index">
        <tr><th colspan="8" scope="rowgroup" class="team-label" :class="{ allies: group.isAlly === true, enemies: group.isAlly === false }">{{ group.label }}</th></tr>
        <tr v-for="(player, row) in group.players" :key="player.puuid ?? `${index}-${row}`" :class="{ own: isOwnPlayer(player) }">
          <th scope="row" class="player-cell">
            <img v-if="player.agent && getChampionImage(player.agent)" :src="getChampionImage(player.agent)" :alt="player.agent" />
            <span>{{ player.summonerName || 'Unknown player' }}<small v-if="isOwnPlayer(player)">You</small><small>{{ player.agent }}</small></span>
          </th>
          <td>{{ stat(player.kills) }}</td><td>{{ stat(player.deaths) }}</td><td>{{ stat(player.assists) }}</td>
          <td>{{ stat(player.creepScore) }}</td><td>{{ stat(player.damageDealt) }}</td><td>{{ stat(player.damageTaken) }}</td><td>{{ stat(player.visionScore) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.league-scoreboard { flex-shrink: 0; max-height: 19rem; overflow: auto; background: #1a1a1a; border-top: 1px solid #ffffff1a; }
.stat-note { margin: 0; padding: 8px 12px; color: #9ca3af; font-size: 11px; }
table { width: 100%; min-width: 720px; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
thead { position: sticky; top: 0; z-index: 1; background: #1a1a1a; }
th, td { padding: 7px 12px; text-align: right; white-space: nowrap; }
thead th { color: #9ca3af; font-size: 10px; font-weight: 600; border-bottom: 1px solid #ffffff12; }
thead th:first-child, .team-label { text-align: left; }
.team-label { padding-top: 10px; font-size: 10px; color: #9ca3af; }
.allies { color: #60a5fa; } .enemies { color: #f87171; }
.player-cell { display: flex; align-items: center; gap: 8px; text-align: left; font-weight: 500; }
.player-cell img { width: 28px; height: 28px; border-radius: 4px; }
.player-cell small { margin-left: 7px; color: #9ca3af; font-size: 10px; }
td { color: #d1d5db; } .own { background: #ffffff08; color: #fff; }
</style>
