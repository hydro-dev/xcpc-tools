<template>
    <n-card bordered shadow="always">
        <n-grid x-gap="12" :cols="2">
            <n-gi>
                <p>摄像头服务：<n-tag :type="runCamera ? 'success' : 'error'">{{ runCamera ? '运行中' : '未运行' }}</n-tag></p>
                {{ cameraInfo }}
                <n-space>
                    <n-button size="small" type="primary" @click="runService('vlc-webcam', 'restart')">启动</n-button>
                    <n-button size="small" type="error" @click="runService('vlc-webcam', 'stop')">停止</n-button>
                    <n-button size="small" type="info" @click="runVLC('webcam')">测试</n-button>
                    <n-button size="small" type="warning" @click="runService('vlc-webcam', 'enable')">激活</n-button>
                </n-space>
                <p>屏幕捕获服务：<n-tag :type="runScreen ? 'success' : 'error'">{{ runScreen ? '运行中' : '未运行' }}</n-tag></p>
                {{ screenInfo }}
                <n-space>
                    <n-button size="small" type="primary" @click="runService('vlc-screen', 'restart')">启动</n-button>
                    <n-button size="small" type="primary" @click="runService('vlc-screen', 'stop')">停止</n-button>
                    <n-button size="small" type="error" @click="runVLC('screen')">测试</n-button>
                    <n-button size="small" type="warning" @click="runService('vlc-screen', 'enable')">激活</n-button>
                </n-space>
            </n-gi>
            <n-gi>
                <n-tabs default-value="video" justify-content="space-evenly" type="line" animated>
                    <n-tab-pane name="video" tab="视频配置">
                        <n-input type="textarea" rows="4" placeholder="配置文件" v-model:value="cameraInfo"></n-input>
                        <n-button size="small" block type="primary">保存</n-button>
                    </n-tab-pane>
                    <n-tab-pane name="desktop" tab="桌面配置">
                        <n-input type="textarea" rows="4" placeholder="配置文件" v-model:value="screenInfo"></n-input>
                        <n-button size="small" block type="primary">保存</n-button>
                    </n-tab-pane>
                </n-tabs>
            </n-gi>
        </n-grid> 
    </n-card>
</template>

<script setup lang="ts">
import { filesystem, os } from '@neutralinojs/lib';
import { NCard, NGrid, NGi, NButton, NInput, NTabs, NTabPane } from 'naive-ui';
import { onMounted, ref } from 'vue';

const hasCamera = ref(false);

const runCamera = ref(false);
const runScreen = ref(false);

const cameraInfo = ref('');
const screenInfo = ref('');

const runService = async (service: string, action: string) => {
    
    try {
        const res = await os.execCommand(`systemctl ${action} ${service}`);
        console.log(`systemctl ${action} ${service} status`, res);
        if (res.stdErr || res.exitCode) throw new Error(res.stdErr);
        if (action === 'restart') {
            if (service === 'vlc-screen') runScreen.value = true;
            if (service === 'vlc-webcam') runCamera.value = true;
        } else {
            if (service === 'vlc-screen') runScreen.value = false;
            if (service === 'vlc-webcam') runCamera.value = false;
        }
    } catch (error) {
        console.error(error);
        window.$notification.error({ title: '操作失败', content: (error as any).message, duration: 3000 });
    }
};

const runVLC = async (service: string) => {
    const port = service === 'webcam' ? '8080' : '9090';
    try {
        const res = await os.execCommand(`su icpc -c "vlc http://localhost:${port}/"`);
        console.log('run vlc on test', res);
        if (res.stdErr || res.exitCode) throw new Error(res.stdErr);
        window.$notification.success({ title: 'VLC启动成功', content: '请查看VLC播放器，确认视频正常后关闭', duration: 3000 });
    } catch (error) {
        console.error(error);
        window.$notification.error({ title: 'VLC启动失败', content: (error as any).message, duration: 3000 });
    }
}


onMounted(async () => {
    try {
        const checkCamera = await filesystem.readDirectory('/dev');
        hasCamera.value = checkCamera.map((item) => item.path).includes('video0');
        const camera = await filesystem.readFile('/etc/default/vlc-webcam');
        const screen = await filesystem.readFile('/etc/default/vlc-screen');
        cameraInfo.value = camera;
        screenInfo.value = screen;
    } catch (error) {
        console.error(error);
        cameraInfo.value = 'no camera config found';
        screenInfo.value = 'no screen config found';
    }
    try {
        const res = await os.execCommand('systemctl status vlc-screen');
        console.log('systemctl status vlc-screen status', res);
        if (!res.stdOut.includes('dead')) runScreen.value = true;
        const res2 = await os.execCommand('systemctl status vlc-webcam');
        console.log('systemctl status vlc-webcam status', res2);
        if (!res2.stdOut.includes('dead')) runCamera.value = true;
    } catch (error) {
        console.error(error);
    }
});
</script>
