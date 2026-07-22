import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './style.css';

import {
    app, events, init, window as neutralinoWindow,
} from '@neutralinojs/lib';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { hasPresentationArgument } from './utils/mode';
import { removePresentationCache } from './utils/system';

init();
const args = Array.isArray(window.NL_ARGS) ? window.NL_ARGS : [];
if (hasPresentationArgument(args)) {
    if (!args.includes('--test')) {
        (async () => {
            await neutralinoWindow.setFullScreen();
            await neutralinoWindow.setAlwaysOnTop(true);
        })().catch(() => undefined);
    }
    events.on('windowClose', async () => {
        await removePresentationCache();
        await app.exit();
    }).catch(() => undefined);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
