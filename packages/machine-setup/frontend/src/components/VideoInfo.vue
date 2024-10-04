<template>
    <n-card bordered shadow="always">
        <n-tabs default-value="video" justify-content="space-evenly" type="line" animated>
            <n-tab-pane name="video" label="摄像头">
                <n-grid x-gap="12" :cols="2">
                    <n-gi>
                        <p>摄像头服务：未启动</p>
                        {{ cameraInfo }}
                        <n-grid x-gap="12" :cols="2">
                            <n-gi>
                                <n-button size="small" type="primary">启动</n-button>
                            </n-gi>
                            <n-gi>
                                <n-button size="small" type="error">测试</n-button>
                            </n-gi>
                        </n-grid>
                    </n-gi>
                    <n-gi>
                        <p>修改配置 <n-button size="small" type="primary">保存</n-button></p>
                        <n-input type="textarea" rows="4" placeholder="配置文件" v-model:value="cameraInfo"></n-input>
                    </n-gi>
                </n-grid> 
            </n-tab-pane>
            <n-tab-pane name="desktop" label="桌面">
                <n-grid x-gap="12" :cols="2">
                    <n-gi>
                        <p>屏幕捕获服务：未启动</p>
                        {{ screenInfo }}
                        <n-grid x-gap="12" :cols="2">
                            <n-gi>
                                <n-button size="small" type="primary">启动</n-button>
                            </n-gi>
                            <n-gi>
                                <n-button size="small" type="error">测试</n-button>
                            </n-gi>
                        </n-grid>
                    </n-gi>
                    <n-gi>
                        <p>修改配置 <n-button size="small" type="primary">保存</n-button></p>
                        <n-input type="textarea" rows="4" placeholder="配置文件" v-model:value="screenInfo"></n-input>
                    </n-gi>
                </n-grid>
            </n-tab-pane>
        </n-tabs>
    </n-card>
</template>

<script setup lang="ts">
import { filesystem } from '@neutralinojs/lib';
import { NCard, NGrid, NGi, NButton, NInput, NTabs, NTabPane } from 'naive-ui';
import { onMounted, ref } from 'vue';

const cameraInfo = ref('');
const screenInfo = ref('');
// const betterCameraInfo = ref({});
// const betterScreenInfo = ref({});


onMounted(async () => {
    try {
        const camera = await filesystem.readFile('/etc/default/vlc-webcam');
        const screen = await filesystem.readFile('/etc/default/vlc-screen');
        cameraInfo.value = camera;
        screenInfo.value = screen;
    } catch (error) {
        console.error(error);
        cameraInfo.value = 'no camera config found';
        screenInfo.value = 'no screen config found';
    }
});
</script>
