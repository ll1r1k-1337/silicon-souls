<template>
  <span class="badge" :data-tone="tone">{{ label }}</span>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}>();
</script>
