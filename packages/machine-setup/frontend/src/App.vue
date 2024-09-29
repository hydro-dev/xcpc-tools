<template>
  <n-config-provider :theme="osTheme === 'dark' ? darkTheme : undefined">
    <n-grid x-gap="12" :cols="2">
      <n-gi>
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
        <n-card bordered shadow="always" title="Stream Info">
            <p>摄像头服务: 未配置</p>
            <n-space style="width: 100%;">
                <n-button type="primary" style="width: 100%;">启动</n-button>
                <n-button type="info" style="width: 100%;">测试</n-button>
            </n-space>
            <p>麦克风服务: 未配置</p>
            <n-space style="width: 100%;">
                <n-button type="primary" style="width: 100%;">启动</n-button>
                <n-button type="info" style="width: 100%;">测试</n-button>
            </n-space>
        </n-card>
      </n-gi>
      <n-gi>
        <n-card bordered title="Machine Info" shadow="always">
            <n-grid x-gap="12" :cols="2">
                <n-gi>
                    <p>CPU: Unknown</p>
                    <p>Mem: Unknown</p>
                    <p>OS: Unknown</p>
                    <p>Image Version: Unknown</p>
                    <p>Displays: Unknown</p>
                </n-gi>
                <n-gi>
                    <p>gcc: Unknown</p>
                    <p>g++: Unknown</p>
                    <p>java: Unknown</p>
                    <p>kotlin: Unknown</p>
                    <p>python3: Unknown</p>
                    <p>pypy3: Unknown</p>
                </n-gi>
            </n-grid>
        </n-card>
        <n-card bordered title="Network Info" shadow="always">
            <p>IP: Unknown</p>
            <p>Mac: Unknown</p>
            <p>Interface: Unknown</p>
        </n-card>
      </n-gi>
    </n-grid>
  </n-config-provider>
</template>

<script setup lang="ts">
import { 
  NGrid, NGi, darkTheme, NConfigProvider, useOsTheme, NButton, NCard, NStatistic,
} from 'naive-ui';

const osTheme = useOsTheme();
</script>

<style scoped>

.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
