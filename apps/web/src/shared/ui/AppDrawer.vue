<template>
  <Teleport to="body">
    <div v-if="open" class="drawer-backdrop" @click="$emit('close')">
      <aside class="drawer" @click.stop>
        <header class="drawer-header">
          <h2>{{ title }}</h2>
          <button class="icon-button" aria-label="Close" @click="$emit('close')">
            <X :size="18" />
          </button>
        </header>
        <div class="drawer-body">
          <slot />
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next';

defineProps<{
  open: boolean;
  title: string;
}>();

defineEmits<{
  close: [];
}>();
</script>
