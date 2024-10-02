<template>
    <n-card bordered shadow="always">
        <n-grid x-gap="12" :cols="2">
            <n-gi>
                <p>XCPC-TOOLS 心跳上报状态：<n-tag :type="onHeartbeat ? 'success' : 'error'">{{ onHeartbeat ? '已开启' : '未开启' }}</n-tag></p>
                <p>当前上报中心：<n-tag :type="!heartbeaturl ? 'error' : 'success'">{{ heartbeaturl }}</n-tag></p>
            </n-gi>
            <n-gi>
                <n-input placeholder="请输入心跳上报URL" v-model:value="heartbeaturl" size="large" style="width: 100%; margin-bottom: .5em;" />
                <n-grid x-gap="12" :cols="2" style="width: 100%;">
                    <n-gi>
                        <n-button type="primary" @click="saveHeartbeat" style="width: 100%;">保存</n-button>
                    </n-gi>
                    <n-gi>
                        <n-button type="info" @click="runHeartbeat" style="width: 100%;">测试</n-button>
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

const heartbeaturl = ref<string>('');
const onHeartbeat = ref<boolean>(false);

const saveHeartbeat = async () => {
    try {
        console.log('save heartbeat', heartbeaturl.value);
        const res = await os.execCommand(`HEARTBEATURL=${heartbeaturl.value} /usr/sbin/icpc-heartbeat`);
        if (res.stdErr || res.exitCode) throw new Error(res.stdErr);
        console.log('run heartbeat on save', res);
        await filesystem.writeFile('/etc/default/icpc-heartbeat', `HEARTBEATURL=${heartbeaturl.value}`);
        const res2 = await os.execCommand('systemctl enable heartbeat.timer');
        console.log('run enable heartbeat on save', res2);
    } catch (error) {
        console.error(`save heartbeat error: ${error}`);
        window.$notification.error({ title: '保存心跳上报URL失败', content: (error as any).message });
    }
};

const runHeartbeat = async () => {
    try {
        const res = await os.execCommand(`HEARTBEATURL=${heartbeaturl.value} /usr/sbin/icpc-heartbeat`);
        if (res.stdErr || res.exitCode) throw new Error(res.stdErr);
        console.log('run heartbeat on test', res);
    } catch (error) {
        console.error(`run heartbeat error: ${error}`);
        window.$notification.error({ title: '测试心跳上报URL失败', content: (error as any).message });
    }
};

onMounted(async () => {
    try {
        const res = await filesystem.readFile('/etc/default/icpc-heartbeat');
        console.log('icpc-heartbeat', res);
        heartbeaturl.value = res.split('=')[1].trim();
        if (!heartbeaturl.value) {
            const res = await os.execCommand('systemctl disable heartbeat.timer');
            console.log('disable heartbeat.timer', res);
            onHeartbeat.value = false;
        } else {
            const res = await os.execCommand('systemctl status heartbeat | grep Active');
            console.log('systemctl status heartbeat status', res);
            if (!res.stdOut.includes('dead')) onHeartbeat.value = true;
        }
    } catch (error) {
        console.error('mount heartbeat error:', error);
    }
});
</script>
