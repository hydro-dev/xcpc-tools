<template>
    <n-card bordered title="网络信息" shadow="always">
        <n-grid x-gap="12" :cols="2">
            <n-gi v-for="info in netInfo" :key="info.ip">
                <p>{{ info.dev }}/{{ info.mac }}</p>
                <p>IP: {{ info.ip }}</p>
            </n-gi>
        </n-grid>
        <p v-if="netInfo.length === 0">No network information found.</p>
    </n-card>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const netInfo = ref<any[]>([]);
</script>