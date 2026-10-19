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
import { stopCameraScan } from './utils/quickConfigRuntime';
import { removePresentationCache } from './utils/system';

const scanning = new URLSearchParams(window.location.search).get('mode') === 'scan';
const scanSession = new URLSearchParams(window.location.search).get('session');
if (scanning) {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (token) window.NL_TOKEN = token;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
}
const validScan = Boolean(scanSession && (window.NL_TOKEN || sessionStorage.getItem('NL_TOKEN')));
if (!scanning || validScan) init();
const root = ReactDOM.createRoot(document.getElementById('root')!);
if (scanning && !validScan) {
    root.render(<p role="alert">扫码链接已失效，请从配置工具重新打开快速配置。</p>);
} else if (scanning) {
    const ScannerPage = React.lazy(() => import('./components/ScannerPage'));
    // This page owns one camera session and must not install the OOBE exit handler.
    root.render(
        <React.Suspense fallback={null}>
            <ScannerPage session={scanSession!} />
        </React.Suspense>,
    );
} else {
    const args = Array.isArray(window.NL_ARGS) ? window.NL_ARGS : [];
    if (hasPresentationArgument(args)) {
        if (!args.includes('--test')) {
            (async () => {
                await neutralinoWindow.setFullScreen();
                await neutralinoWindow.setAlwaysOnTop(true);
            })().catch(() => undefined);
        }
    }

    let closing = false;
    events.on('windowClose', async () => {
        if (closing) return;
        closing = true;
        try {
            await stopCameraScan();
            if (hasPresentationArgument(args)) await removePresentationCache();
        } finally {
            await app.exit();
        }
    }).catch(() => undefined);

    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>,
    );
}
