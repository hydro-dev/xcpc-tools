<template>
    <n-card bordered title="网络信息" shadow="always">
        <n-grid x-gap="12" :cols="2">
            <n-gi>
                <p v-if="netInfo.length === 0">No network information found.</p>
                <div style="overflow: auto; height: 220px;">
                    <template v-for="info in netInfo" :key="info.dev">
                        <p>{{ info.dev }}/{{ info.mac }}</p>
                        <p>IPV4: {{ info.v4 }}</p>
                        <p>IPV6: {{ info.v6 }}</p>
                    </template>
                </div>
            </n-gi>
            <n-gi>
                <n-space>
                    <n-button size="small" type="primary" @click="statusDetect">查看detect-wifi服务</n-button>
                    <n-button size="small" type="warning" @click="runDetect">自动选择wifi网卡生成默认配置</n-button>
                    <p>非授权请勿手动设置wifi！</p>
                    <n-input size="small" v-model:value="ssid" placeholder="ssid" />
                    <n-input size="small" v-model:value="password" placeholder="password" />
                    <n-button size="small" type="info" @click="saveConfig">保存</n-button>
                </n-space>
            </n-gi>
        </n-grid>
    </n-card>
</template>

<script setup lang="ts">
import { filesystem, os } from '@neutralinojs/lib';
import { NCard, NGrid, NGi, NButton, NInput, NSpace } from 'naive-ui';
import { onMounted, ref } from 'vue';

const netInfo = ref<any[]>([]);

declare global {
    interface Window {
        ip: string;
    }
}

const statusDetect = async () => {
    try {
        const res = await os.execCommand(`systemctl status detect-wireless-interface`);
        if (res.stdErr) throw new Error(res.stdErr);
        window.$notification.success({ title: '状态获取成功', content: res.stdOut, duration: 10000 });
    } catch (error) {
        console.error(error);
        window.$notification.error({ title: '状态获取失败', content: (error as any).message, duration: 3000 });
    }
};

const runDetect = async () => {
    try {
        const config = await filesystem.readFile('/etc/default/wifi-setup');
        const res = await os.execCommand(`${config.replace(/\\n/g, ' ')} /usr/sbin/detect-wireless-interface`);
        if (res.stdErr) throw new Error(res.stdErr);
        window.$notification.success({ title: '自动选择wifi网卡成功', content: res.stdOut, duration: 10000 });
    } catch (error) {
        console.error(error);
        window.$notification.error({ title: '自动选择wifi网卡失败', content: (error as any).message, duration: 3000 });
    }
};

const ssid = ref('');
const password = ref('');

const saveConfig = async () => {
    try {
        const res = await os.execCommand(`WIFI_SSID=${ssid.value} WIFI_PASS=${password.value} /usr/sbin/detect-wireless-interface`);
        if (res.stdErr) throw new Error(res.stdErr);
        window.$notification.success({ title: '配置保存成功', content: res.stdOut, duration: 3000 });
    } catch (error) {
        console.error(error);
        window.$notification.error({ title: '配置保存失败', content: (error as any).message, duration: 3000 });
    }
};

onMounted(async () => {
    try {
        const res = await os.execCommand('ip --json address');
        const info = JSON.parse(res.stdOut);
        const ips = info.filter((i: any) => {
            const local = i.addr_info?.filter((a: any) => a.family === 'inet')[0]?.local;
            return local && (local.startsWith('10') || local.startsWith('192.168') || local.startsWith('172.16'));
        }).map((i: any) => ({ 
            v4: i.addr_info.filter((a: any) => a.family === 'inet').map((a: any) => a.local).join(', '),
            v6: i.addr_info.filter((a: any) => a.family === 'inet6').map((a: any) => a.local).join(', '),
            dev: i.ifname,
            mac: i.address
        }));
        netInfo.value = ips;
        window.ip = ips?.[0]?.v4;
    } catch (error) {
        console.error(error);
    
    }
});
</script>