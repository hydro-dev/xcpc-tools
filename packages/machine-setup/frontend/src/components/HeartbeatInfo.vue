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
                        <n-button style="width: 100%;">保存</n-button>
                    </n-gi>
                    <n-gi>
                        <n-button type="info" style="width: 100%;">测试</n-button>
                    </n-gi>
                </n-grid>
            </n-gi>
        </n-grid>
    </n-card>
</template>

<script setup lang="ts">
import { NCard, NGrid, NGi, NButton, NInput } from 'naive-ui';
import { ref } from 'vue';

const heartbeaturl = ref<string>('');
const onHeartbeat = ref<boolean>(false);
</script>
