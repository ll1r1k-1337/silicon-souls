<template>
  <main v-if="workspace" class="workspace">
    <SpecTopBar />
    <section class="workspace-grid">
      <RichSpecEditor class="editor-pane" />
      <section class="side-pane-stack">
        <ActionQueuePanel class="action-pane" />
        <ChatPanel class="chat-pane" />
      </section>
    </section>
    <ArtifactsDrawer />
    <ReviewDrawer />
    <VersionHistoryDrawer />
    <ExportDialog />
    <SystemLogsDrawer />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import ArtifactsDrawer from '@/widgets/artifacts-panel/ArtifactsDrawer.vue';
import ReviewDrawer from '@/widgets/review-panel/ReviewDrawer.vue';
import SpecTopBar from '@/widgets/spec-workspace/SpecTopBar.vue';
import ActionQueuePanel from '@/widgets/spec-workspace/ActionQueuePanel.vue';
import ChatPanel from '@/widgets/spec-workspace/ChatPanel.vue';
import RichSpecEditor from '@/widgets/spec-workspace/RichSpecEditor.vue';
import VersionHistoryDrawer from '@/widgets/version-history/VersionHistoryDrawer.vue';
import ExportDialog from '@/features/export-spec/ExportDialog.vue';
import SystemLogsDrawer from '@/features/system-logs/SystemLogsDrawer.vue';
import { useSpecSessionStore } from '@/stores/specSessionStore';

const route = useRoute();
const store = useSpecSessionStore();
const sessionId = computed(() => String(route.params.sessionId));
const workspace = computed(() => store.workspace);

onMounted(() => store.loadWorkspace(sessionId.value));
watch(sessionId, (value) => store.loadWorkspace(value));
</script>
