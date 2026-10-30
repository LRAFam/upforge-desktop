<script setup lang="ts">
/** Home: one-line reminder for players who said "I have a coach" during onboarding, until they join one. */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import UfButton from '../UfButton.vue'
import { readJoinCoachLater, setJoinCoachLater } from './roster-flow'
import { useStudentHub } from './useStudentHub'

const router = useRouter()
const { hub, refresh } = useStudentHub()
const wanted = ref(readJoinCoachLater())
const show = computed(() => wanted.value && hub.value != null && (hub.value.coaches?.length ?? 0) === 0)

function dismiss() { setJoinCoachLater(false); wanted.value = false }
function go() { router.push({ path: '/rosters', query: { join: '1' } }).catch(() => {}) }

onMounted(() => {
  if (!wanted.value) return
  void refresh().then((h) => { if (h?.coaches?.length) dismiss() })
})
</script>

<template>
  <section v-if="show" class="cip3 uf-reveal" aria-label="Join your coach">
    <span class="uf-label">Working with a coach?</span>
    <p class="uf-t3 cip3-line">Paste the invite link they shared and send them your matches from here.</p>
    <div class="cip3-actions">
      <UfButton variant="link" @click="go">Join your coach</UfButton>
      <button type="button" class="cip3-dismiss uf-t4" @click="dismiss">Not now</button>
    </div>
  </section>
</template>

<style scoped>
.cip3 { display: flex; flex-direction: column; gap: 6px; padding-top: 16px; border-top: 1px solid var(--uf-line); }
.cip3-line { margin: 0; }
.cip3-actions { display: flex; align-items: center; gap: 16px; }
.cip3-dismiss { background: none; border: 0; padding: 0; color: var(--uf-faint); cursor: pointer; }
.cip3-dismiss:hover { color: var(--uf-muted); }
</style>
