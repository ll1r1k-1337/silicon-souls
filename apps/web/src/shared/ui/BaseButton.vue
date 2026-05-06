<template>
  <button class="button" :class="[`button-${variant}`]" :disabled="disabled">
    <component :is="icon" v-if="icon" class="button-icon" aria-hidden="true" />
    <span><slot /></span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  icon?: unknown;
}>();
</script>
