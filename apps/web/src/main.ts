import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './app/router';
import { useUiStore } from './stores/uiStore';
import './assets/main.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

useUiStore(pinia).initializeTheme();

app.mount('#app');
