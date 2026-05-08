<template>
  <span class="badge" :data-tone="tone" :title="title">{{ label }}</span>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  title?: string;
}>();
</script>
