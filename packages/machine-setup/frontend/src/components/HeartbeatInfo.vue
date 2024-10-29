<template>
    <n-card bordered shadow="always" style="margin-bottom: .25em;">
        <n-grid x-gap="12" :cols="2">
            <n-gi>
                <p><n-tag :type="!nowHeartbeat ? 'error' : 'success'">{{ nowHeartbeat || 'no center' }}</n-tag></p>
                <n-space>
                    <n-tag :type="onHeartbeat ? 'success' : 'error'">{{ onHeartbeat ? '已开启上报' : '未开启上报' }}</n-tag>
                    <n-button type="warning" size="small" @click="getHeartbeatVersion(nowHeartbeat)">中心状态</n-button>
                    <n-button type="warning" size="small" @click="getHeartbeatTimer()">服务状态</n-button>
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
import { NCard, NGrid, NGi, NButton, NInput } from 'naive-ui';
import { onMounted, ref } from 'vue';

const editHeartbeat = ref<string>('');
const nowHeartbeat = ref<string>('');
const onHeartbeat = ref<boolean>(false);

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
        const res = await os.execCommand(`HEARTBEATURL=${url} /usr/sbin/icpc-heartbeat`);
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
        await filesystem.writeFile('/etc/default/icpc-heartbeat', `HEARTBEATURL=${url}`);
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

const getHeartbeatTimer = async () => {
    try {
        const res = await os.execCommand('systemctl status heartbeat.timer');
        console.log('systemctl status heartbeat.timer status', res.stdOut);
        window.$notification.success({ title: '心跳上报服务状态', content: res.stdOut, duration: 10000 });
    } catch (error) {
        console.error(`get heartbeat timer error: ${error}`);
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
            const res = await os.execCommand('systemctl status heartbeat.timer');
            console.log('systemctl status heartbeat.timer status', res.stdOut);
            if (!res.stdOut.includes('dead')) onHeartbeat.value = true;
        }
    } catch (error) {
        console.error('mount heartbeat error:', error);
    }
});
</script>
