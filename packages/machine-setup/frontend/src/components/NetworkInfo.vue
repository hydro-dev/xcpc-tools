<template>
    <n-card bordered title="网络信息" shadow="always">
        <template #header-extra>
            <n-button size="small" type="primary" @click="getIp">刷新</n-button>
        </template>
        <p v-if="netInfo.length === 0">No network information found.</p>
        <div style="overflow: auto; height: 220px;">
            <template v-for="info in netInfo" :key="info.dev">
                <p style="font-weight: bold; margin: 0.5em 0 0.2em;">{{ info.dev }} / {{ info.mac }}</p>
                <p style="margin: 0 0 0 1em;">IPV4: {{ info.v4 }}</p>
                <p style="margin: 0 0 0.5em 1em;">IPV6: {{ info.v6 }}</p>
            </template>
        </div>
    </n-card>
</template>

<script setup lang="ts">
import { os } from '@neutralinojs/lib';
import { NCard, NButton } from 'naive-ui';
import { onMounted, onUnmounted, ref } from 'vue';

interface NetInterface {
    dev: string;
    mac: string;
    v4: string;
    v6: string;
}

interface AddrInfo {
    family: 'inet' | 'inet6';
    local: string;
}

interface IpAddrEntry {
    ifname: string;
    address: string;
    addr_info: AddrInfo[];
}

const netInfo = ref<NetInterface[]>([]);

declare global {
    interface Window {
        ip: string;
    }
}

const isPrivateIPv4 = (ip: string) => {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    return false;
};

const getIp = async () => {
    try {
        const res = await os.execCommand('ip --json address');
        const entries: IpAddrEntry[] = JSON.parse(res.stdOut);
        const ips = entries
            .filter((e) => e.addr_info.some((a) => a.family === 'inet' && isPrivateIPv4(a.local)))
            .map((e) => ({
                dev: e.ifname,
                mac: e.address,
                v4: e.addr_info.filter((a) => a.family === 'inet').map((a) => a.local).join(', '),
                v6: e.addr_info.filter((a) => a.family === 'inet6').map((a) => a.local).join(', '),
            }));
        netInfo.value = ips;
        window.ip = ips[0]?.v4;
    } catch (error) {
        console.error(error);
    }
};

let intervalId: NodeJS.Timeout;

onMounted(async () => {
    await getIp();
    intervalId = setInterval(getIp, 5000);
});

onUnmounted(() => {
    clearInterval(intervalId);
});
</script>