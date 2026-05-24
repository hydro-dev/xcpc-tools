<template>
    <n-card bordered shadow="always" style="margin-bottom: .25em;">
        <n-grid x-gap="12" :cols="2">
            <n-gi>
                <p><n-tag :type="!nowHeartbeat ? 'error' : 'success'">{{ nowHeartbeat || 'no center' }}</n-tag></p>
                <n-space>
                    <n-tag :type="onHeartbeat ? 'success' : 'error'">{{ onHeartbeat ? '已开启上报' : '未开启上报' }}</n-tag>
                    <n-button type="warning" size="small" @click="getHeartbeatVersion(nowHeartbeat)">中心状态</n-button>
                    <n-button :type="heartbeatServiceButtonType" size="small" @click="getHeartbeatService()">服务状态</n-button>
                </n-space>
            </n-gi>
            <n-gi>
                <n-input placeholder="IP/HOST/URL" v-model:value="editHeartbeat" size="large" style="width: 100%; margin-bottom: .5em;" />
                <n-grid x-gap="12" :cols="3" style="width: 100%;">
                    <n-gi>
                        <n-button type="primary" @click="saveHeartbeat(false)" style="width: 100%;">保存</n-button>
                    </n-gi>
                    <n-gi>
                        <n-button type="info" @click="testHeartbeat" style="width: 100%;">测试</n-button>
                    </n-gi>
                    <n-gi>
                        <n-button type="warning" @click="saveHeartbeat(true)" style="width: 100%;">强制保存</n-button>
                    </n-gi>
                </n-grid>
            </n-gi>
        </n-grid>
    </n-card>
</template>

<script setup lang="ts">
import { filesystem, os } from '@neutralinojs/lib';
import { NCard, NGrid, NGi, NButton, NInput, NSpace, NTag } from 'naive-ui';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { writePrivilegedFile } from '../utils/privileged';

const HEARTBEAT_SEARCH_PATHS = [
    '/usr/local/sbin/heartbeat',
    '/usr/local/bin/heartbeat',
    '/usr/sbin/heartbeat',
    '/usr/bin/heartbeat',
];

let cachedHeartbeatPath: string | null = null;

async function getHeartbeatPath(): Promise<string> {
    if (cachedHeartbeatPath) return cachedHeartbeatPath;
    for (const p of HEARTBEAT_SEARCH_PATHS) {
        try {
            const stat = await filesystem.getStats(p);
            if (stat.isFile) {
                cachedHeartbeatPath = p;
                return p;
            }
        } catch { /* not found, try next */ }
    }
    try {
        const res = await os.execCommand('which heartbeat');
        if (res.exitCode === 0 && res.stdOut.trim()) {
            cachedHeartbeatPath = res.stdOut.trim();
            return cachedHeartbeatPath;
        }
    } catch { /* ignore */ }
    throw new Error(
        `heartbeat not found in any of: ${HEARTBEAT_SEARCH_PATHS.join(', ')}`,
    );
}

const editHeartbeat = ref<string>('');
const nowHeartbeat = ref<string>('');
const onHeartbeat = ref<boolean>(false);
const heartbeatServiceResult = ref<string>('');

const heartbeatServiceButtonType = computed(() => {
    if (!heartbeatServiceResult.value) return 'warning';
    return heartbeatServiceResult.value === 'success' ? 'success' : 'error';
});

const checkHeartbeatServiceResult = async () => {
    try {
        const res = await os.execCommand('systemctl show heartbeat.service --property=Result');
        const result = res.stdOut.trim().split('=')[1];
        heartbeatServiceResult.value = result || '';
    } catch (error) {
        console.error('check heartbeat service result error:', error);
        heartbeatServiceResult.value = '';
    }
};

const getRealHeartbeatUrl = async () => {
    const iporHost = editHeartbeat.value.trim();
    if (iporHost.includes('http')) return iporHost;
    if (!iporHost.includes(':')) return `http://${iporHost}:5283/report`;
    return `http://${iporHost}/report`;
};

const getHeartbeatVersion = async (url: string) => {
    try {
        const version = await fetch(url.replace('/report', '/version')).then(res => res.json());
        if (!version) throw new Error('无法获取上报中心版本');
        window.$notification.success({ title: '连接上报中心成功', content: `上报中心版本：${version.version}`, duration: 3000 });
    } catch (error) {
        console.error(`get heartbeat error: ${error}`);
        window.$notification.error({ title: '获取中心版本失败', content: (error as any).message, duration: 3000 });
    }
};

const runHeartbeat = async (url: string) => {
    try {
        const heartbeatPath = await getHeartbeatPath();
        const res = await os.execCommand(`HEARTBEATURL=${url} '${heartbeatPath}'`);
        if (res.stdErr || res.exitCode) throw new Error(res.stdErr);
        console.log('run heartbeat on test', res);
    } catch (error) {
        console.error(`run heartbeat error: ${error}`);
        window.$notification.error({ title: '测试心跳上报URL失败', content: (error as any).message, duration: 3000 });
    }
};

const testHeartbeat = async () => {
    const url = await getRealHeartbeatUrl();
    try {
        await getHeartbeatVersion(url);
        await runHeartbeat(url);
    } catch (error) {
        console.error(`test heartbeat error: ${error}`);
        window.$notification.error({ title: '测试心跳上报URL失败', content: (error as any).message, duration: 3000 });
    }
};

const saveHeartbeat = async (force = false) => {
    const url = await getRealHeartbeatUrl();
    try {
        if (!force) {
            await getHeartbeatVersion(url);
            await runHeartbeat(url);
        }
        console.log('save heartbeat', url);
        await writePrivilegedFile('/etc/default/icpc-heartbeat', `HEARTBEATURL=${url}`);
        const res = await os.execCommand('systemctl enable heartbeat.timer --now');
        console.log('run enable heartbeat on save', res);
        nowHeartbeat.value = url;
        onHeartbeat.value = true;
        window.$notification.success({ title: '保存心跳上报URL成功', content: '请查看心跳上报状态', duration: 3000 });
    } catch (error) {
        console.error(`save heartbeat error: ${error}`);
        window.$notification.error({ title: '保存心跳上报URL失败', content: (error as any).message, duration: 3000 });
    }
};

const getHeartbeatService = async () => {
    try {
        const res = await os.execCommand('systemctl status heartbeat.service');
        console.log('systemctl status heartbeat.service', res.stdOut);
        await checkHeartbeatServiceResult();
        window.$notification.success({ title: '心跳上报服务状态', content: res.stdOut, duration: 10000 });
    } catch (error) {
        console.error(`get heartbeat service error: ${error}`);
        window.$notification.error({ title: '获取心跳上报服务状态失败', content: (error as any).message, duration: 3000 });
    }
};

onMounted(async () => {
    try {
        const res = await filesystem.readFile('/etc/default/icpc-heartbeat');
        console.log('icpc-heartbeat', res);
        nowHeartbeat.value = res.split('=')[1].trim();
        if (!nowHeartbeat.value) {
            const res = await os.execCommand('systemctl disable heartbeat.timer');
            console.log('disable heartbeat.timer', res);
            onHeartbeat.value = false;
        } else {
            const res = await os.execCommand('systemctl is-active heartbeat.timer');
            onHeartbeat.value = res.stdOut.trim() === 'active';
        }
        await checkHeartbeatServiceResult();
    } catch (error) {
        console.error('mount heartbeat error:', error);
    }
});

const pollInterval = setInterval(checkHeartbeatServiceResult, 30000);
onUnmounted(() => clearInterval(pollInterval));
</script>
