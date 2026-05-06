import { createRouter, createWebHistory } from 'vue-router';
import ProjectDetailsPage from '@/pages/ProjectDetailsPage.vue';
import ProjectsPage from '@/pages/ProjectsPage.vue';
import SpecWorkspacePage from '@/pages/SpecWorkspacePage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'projects', component: ProjectsPage },
    { path: '/projects/:projectId', name: 'project-details', component: ProjectDetailsPage },
    { path: '/sessions/:sessionId', name: 'spec-workspace', component: SpecWorkspacePage },
  ],
});
