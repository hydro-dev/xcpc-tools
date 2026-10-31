// Run with: node scripts/test-video-player.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

const filename = path.join(__dirname, '../packages/ui/app/components/VideoPlayer.tsx');
const { code } = transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'tsx', format: 'cjs' });

function mount({ hlsSupported = true } = {}) {
    let cleanup;
    const players = [];
    const requests = [];
    const errors = [];
    const listeners = new Map();
    const video = {
        // Modern browsers can report native HLS support even when hls.js is available.
        canPlayType: () => 'maybe',
        addEventListener: (event, handler) => listeners.set(event, handler),
        removeEventListener: (event) => listeners.delete(event),
        play: () => Promise.resolve(),
        pause: () => { video.paused = true; },
        load: () => {},
        removeAttribute: (name) => { delete video[name]; },
    };
    class Hls {
        static Events = { ERROR: 'error', MEDIA_ATTACHED: 'attached' };
        static isSupported = () => hlsSupported;
        handlers = {};
        constructor() { players.push(this); }
        on(event, handler) { this.handlers[event] = handler; }
        attachMedia() { this.handlers.attached(); }
        loadSource(src) { this.source = src; }
        destroy() { this.destroyed = true; }
    }
    const module = { exports: {} };
    const mocks = {
        '@mantine/core': {},
        'hls.js': Hls,
        'mpegts.js': { isSupported: () => { throw new Error('HLS must not use the MPEG-TS player'); } },
        react: {
            useRef: () => ({ current: video }),
            useState: (initial) => [initial, (value) => { if (typeof value === 'string' && value) errors.push(value); }],
            useEffect: (effect) => { cleanup = effect(); },
            createElement: () => null,
        },
    };
    const window = { location: { href: 'http://monitor/' } };
    vm.runInNewContext(code, {
        module,
        require: (name) => {
            assert.ok(name in mocks, `Unexpected import: ${name}`);
            return mocks[name];
        },
        window,
        URL,
        fetch: async (src) => { requests.push(src); return { ok: true }; },
    }, { filename });
    module.exports.default({ client: { ip: 'camera', camera: '/webcam/index.m3u8?cookieCheck=1' } });
    return { players, requests, errors, video, cleanup };
}

async function main() {
    const live = mount();
    assert.equal(live.players.length, 1, 'hls.js must take priority over native canPlayType');
    assert.equal(live.video.src, undefined, 'native playback must not start alongside hls.js');
    assert.equal(live.players[0].source, 'http://camera/webcam/index.m3u8?cookieCheck=1');
    live.cleanup();
    assert.equal(live.players[0].destroyed, true);

    const failed = mount();
    failed.players[0].handlers.error('error', { fatal: true, details: 'manifestLoadError' });
    assert.match(failed.errors[0], /manifestLoadError/);
    assert.equal(failed.players[0].destroyed, true);
    failed.cleanup();

    const unsupported = mount({ hlsSupported: false });
    await Promise.resolve();
    assert.equal(unsupported.players.length, 0);
    assert.equal(unsupported.requests.length, 0, 'Native HLS must not be requested when hls.js is unsupported');
    assert.equal(unsupported.video.src, undefined, 'Native HLS must not be assigned to the video element');
    assert.match(unsupported.errors[0], /does not support playback with hls\.js/);
    unsupported.cleanup();
    console.log('PASS: hls.js only, unsupported-browser error, playback error and cleanup');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
