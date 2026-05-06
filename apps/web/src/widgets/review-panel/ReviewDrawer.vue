<template>
  <AppDrawer :open="ui.reviewOpen" title="Review" @close="ui.reviewOpen = false">
    <section v-if="review" class="review-summary">
      <StatusBadge
        :label="review.canApprove ? 'Can approve' : 'Cannot approve'"
        :tone="review.canApprove ? 'success' : 'danger'"
      />
      <p>{{ review.payload.approvalSummary }}</p>
      <h3>Blocking issues</h3>
      <ul>
        <li v-for="issue in review.payload.blockingIssues" :key="issue">{{ issue }}</li>
      </ul>
      <h3>Recommended changes</h3>
      <ul>
        <li v-for="change in review.payload.recommendedChanges" :key="change">{{ change }}</li>
      </ul>
    </section>
    <section v-else class="empty-state">
      <p>No review has been run yet.</p>
      <BaseButton :icon="SearchCheck" variant="primary" @click="store.reviewSpec()">Run Review</BaseButton>
    </section>
  </AppDrawer>
</template>

<script setup lang="ts">
import { SearchCheck } from 'lucide-vue-next';
import { computed } from 'vue';
import AppDrawer from '@/shared/ui/AppDrawer.vue';
import BaseButton from '@/shared/ui/BaseButton.vue';
import StatusBadge from '@/shared/ui/StatusBadge.vue';
import { useSpecSessionStore } from '@/stores/specSessionStore';
import { useUiStore } from '@/stores/uiStore';

const store = useSpecSessionStore();
const ui = useUiStore();
const review = computed(() => store.review);
</script>
