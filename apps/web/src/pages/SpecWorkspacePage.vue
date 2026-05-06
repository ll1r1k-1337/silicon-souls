<template>
  <main v-if="workspace" class="workspace">
    <SpecTopBar />
    <section class="workspace-grid">
      <ChatPanel class="conversation-pane" />
      <MarkdownEditor class="editor-pane" />
    </section>
    <ArtifactsDrawer />
    <ReviewDrawer />
    <VersionHistoryDrawer />
    <ExportDialog />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import ArtifactsDrawer from '@/widgets/artifacts-panel/ArtifactsDrawer.vue';
import ReviewDrawer from '@/widgets/review-panel/ReviewDrawer.vue';
import SpecTopBar from '@/widgets/spec-workspace/SpecTopBar.vue';
import ChatPanel from '@/widgets/spec-workspace/ChatPanel.vue';
import MarkdownEditor from '@/widgets/spec-workspace/MarkdownEditor.vue';
import VersionHistoryDrawer from '@/widgets/version-history/VersionHistoryDrawer.vue';
import ExportDialog from '@/features/export-spec/ExportDialog.vue';
import { useSpecSessionStore } from '@/stores/specSessionStore';

const route = useRoute();
const store = useSpecSessionStore();
const sessionId = computed(() => String(route.params.sessionId));
const workspace = computed(() => store.workspace);

onMounted(() => store.loadWorkspace(sessionId.value));
watch(sessionId, (value) => store.loadWorkspace(value));
</script>
