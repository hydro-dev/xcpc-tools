<template>
    <n-card bordered shadow="always" title="@Hydro/XCPC-TOOLS Setup Tool">
        <n-statistic title="座位号" value="未配置" style="text-align: center; font-size: 8em;" />
    </n-card>
    <n-card bordered shadow="always">
        <n-input placeholder="请输入座位号" type="text" size="large" style="width: 100%; margin-bottom: .5em;" />
        <n-space style="width: 100%;">
            <n-button type="primary" style="width: 100%;">保存</n-button>
            <n-button type="info" style="width: 100%;">放大显示</n-button>
        </n-space>
    </n-card>
</template>

<script setup lang="ts">
import { NCard, NButton, NInput } from 'naive-ui';
</script>