<template>
  <n-config-provider :theme="osTheme === 'dark' ? darkTheme : undefined">
    <n-notification-provider>
      <provider />
      <n-grid x-gap="12" :cols="2">
        <n-gi>
          <basic-info />
          <heartbeat-info />
          <video-info />
        </n-gi>
        <n-gi>
          <system-info />
          <network-info />
          <n-card bordered shadow="always">
            <n-button type="primary" @click="checkAll" style="width: 100%;">完成设备检查</n-button>
          </n-card>
        </n-gi>
      </n-grid>
    </n-notification-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { 
  NGrid, NGi, darkTheme, NConfigProvider, useOsTheme, NButton, NCard, NNotificationProvider,
} from 'naive-ui';
import BasicInfo from './components/BasicInfo.vue';
import HeartbeatInfo from './components/HeartbeatInfo.vue';
import SystemInfo from './components/SystemInfo.vue';
import NetworkInfo from './components/NetworkInfo.vue';
import VideoInfo from './components/VideoInfo.vue';
import Provider from './components/Provider.vue';

const osTheme = useOsTheme();

const checkAll = () => {
  console.log('check all');
};
</script>