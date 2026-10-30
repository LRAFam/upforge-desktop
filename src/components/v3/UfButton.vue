<script setup lang="ts">
import UfIcon from './UfIcon.vue'
import type { UfIconName } from './uf-icons'

/** primary: the one red action per screen · secondary: outlined · link: text with an arrow. */
withDefaults(defineProps<{ variant?: 'primary' | 'secondary' | 'link'; icon?: UfIconName; disabled?: boolean }>(), { variant: 'secondary' })
defineEmits<{ click: [MouseEvent] }>()
</script>

<template>
  <button v-if="variant === 'primary'" type="button" class="uf-btn-primary" :disabled="disabled" @click="$emit('click', $event)">
    <span><UfIcon v-if="icon" :name="icon" :size="16" /><slot /></span>
  </button>
  <button v-else-if="variant === 'secondary'" type="button" class="uf-btn-secondary" :disabled="disabled" @click="$emit('click', $event)">
    <UfIcon v-if="icon" :name="icon" :size="16" /><slot />
  </button>
  <button v-else type="button" class="uf-link" :disabled="disabled" @click="$emit('click', $event)"><slot /> →</button>
</template>
