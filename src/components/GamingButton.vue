<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="[variantClass, { 'w-full': block, 'opacity-50 pointer-events-none': disabled }]"
    class="group"
  >
    <span v-if="isPrimary" class="gaming-btn-bg" />
    <span class="gaming-btn-content">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'primary-sm' | 'secondary-sm'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    block?: boolean
  }>(),
  {
    variant: 'primary-sm',
    type: 'button',
    disabled: false,
    block: false,
  },
)

const isPrimary = computed(() => props.variant === 'primary-sm')

const variantClass = computed(() =>
  props.variant === 'secondary-sm' ? 'gaming-btn-secondary-sm' : 'gaming-btn-primary-sm',
)
</script>
