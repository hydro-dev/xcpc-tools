import './style.css';

import { app, events, init } from '@neutralinojs/lib';
import {
    create, NButton, NCard, NConfigProvider, NGi, NGrid, NInput,
    NNotificationProvider,
    NPopconfirm, NSpace, NStatistic, NTab, NTabPane, NTag,
} from 'naive-ui';
import { createApp } from 'vue';
import App from './App.vue';

const naive = create({
    components: [NButton, NGrid, NGi, NCard, NStatistic, NSpace, NConfigProvider, NTab, NTabPane, NTag, NNotificationProvider, NPopconfirm, NInput],
});

createApp(App).use(naive).mount('#app');

init();
// hack for: https://github.com/neutralinojs/neutralinojs/issues/1179
events.on('windowClose', () => {
    app.exit();
});
