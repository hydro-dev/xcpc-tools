<template>
    <n-card bordered title="网络信息" shadow="always">
        <n-grid x-gap="12" :cols="2">
            <n-gi v-for="info in netInfo" :key="info.dev">
                <p>{{ info.dev }}/{{ info.mac }}</p>
                <p>IPV4: {{ info.v4 }}</p>
                <p>IPV6: {{ info.v6 }}</p>
            </n-gi>
        </n-grid>
        <p v-if="netInfo.length === 0">No network information found.</p>
    </n-card>
</template>

<script setup lang="ts">
import { os } from '@neutralinojs/lib';
import { onMounted, ref } from 'vue';

const netInfo = ref<any[]>([]);

onMounted(async () => {
    try {
        const res = await os.execCommand('ip --json address');
        const info = JSON.parse(res.stdOut);
        console.log(info);
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
    } catch (error) {
        console.error(error);
    
    }
});
</script>