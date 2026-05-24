<template>
    <n-card bordered shadow="always">
        <n-grid x-gap="12" :cols="2">
            <n-gi>
                <div style="display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap;">
                    <p style="margin: 0;">摄像头服务：</p>
                    <n-tooltip v-if="cameraDevices.length > 0" trigger="hover">
                        <template #trigger>
                            <n-tag type="success">已连接</n-tag>
                        </template>
                        <div v-for="(dev, i) in cameraDevices" :key="i" style="margin-bottom: 0.3em;">
                            <div style="font-weight: bold;">{{ dev.name }}</div>
                            <div v-for="node in dev.nodes" :key="node" style="padding-left: 1em;">{{ node }}</div>
                        </div>
                    </n-tooltip>
                    <n-tooltip v-else-if="hasCamera" trigger="hover">
                        <template #trigger>
                            <n-tag type="success">已连接</n-tag>
                        </template>
                        {{ hasCamera }}
                    </n-tooltip>
                    <n-tag v-else type="error">未连接</n-tag>
                    <n-tag :type="runCamera ? 'success' : 'error'">{{ runCamera ? '运行中' : '未运行' }}</n-tag>
                </div>
                <n-space>
                    <n-button size="small" type="primary" @click="runService('vlc-webcam', 'restart')">启动</n-button>
                    <n-button size="small" type="error" @click="runService('vlc-webcam', 'stop')">停止</n-button>
                    <n-button size="small" type="info" @click="runVLC('webcam')">测试</n-button>
                    <n-button size="small" @click="statusService('vlc-webcam')">状态</n-button>
                    <n-button size="small" type="warning" @click="runService('vlc-webcam', 'enable')">激活</n-button>
                    <n-button size="small" type="warning" @click="runService('vlc-webcam', 'disable')">禁用</n-button>
                    <n-button size="small" @click="hasCamera = 'video0'">强制摄像头存在</n-button>
                </n-space>
                <div style="display: flex; justify-content: center; align-items: center;">
                    <p>屏幕捕获服务：</p> 
                    <n-tag :type="runScreen ? 'success' : 'error'">{{ runScreen ? '运行中' : '未运行' }}</n-tag>
                </div>
                <n-space>
                    <n-button size="small" type="primary" @click="runService('vlc-screen', 'restart')">启动</n-button>
                    <n-button size="small" type="error" @click="runService('vlc-screen', 'stop')">停止</n-button>
                    <n-button size="small" type="info" @click="runVLC('screen')">测试</n-button>
                    <n-button size="small" @click="statusService('vlc-screen')">状态</n-button>
                    <n-button size="small" type="warning" @click="runService('vlc-screen', 'enable')">激活</n-button>
                    <n-button size="small" type="warning" @click="runService('vlc-screen', 'disable')">禁用</n-button>
                </n-space>
            </n-gi>
            <n-gi>
                <n-tabs default-value="video" justify-content="space-evenly" type="line" animated>
                    <n-tab-pane name="video" tab="视频配置">
                        <n-input type="textarea" :rows="6" placeholder="配置文件" v-model:value="cameraInfo"></n-input>
                        <n-button size="small" block type="primary" @click="saveConfig('camera')">保存</n-button>
                    </n-tab-pane>
                    <n-tab-pane name="desktop" tab="桌面配置">
                        <n-input type="textarea" :rows="6" placeholder="配置文件" v-model:value="screenInfo"></n-input>
                        <n-button size="small" block type="primary" @click="saveConfig('screen')">保存</n-button>
                    </n-tab-pane>
                </n-tabs>
            </n-gi>
        </n-grid> 
    </n-card>
</template>

<script setup lang="ts">
import { filesystem, os } from '@neutralinojs/lib';
import { NCard, NGrid, NGi, NButton, NInput, NTabs, NTabPane, NTooltip, NTag, NSpace } from 'naive-ui';
import { onMounted, ref } from 'vue';
import { writePrivilegedFile } from '../utils/privileged';

const hasCamera = ref('');

interface V4l2Device {
    name: string;
    nodes: string[];
}
const cameraDevices = ref<V4l2Device[]>([]);

const runCamera = ref(false);
const runScreen = ref(false);

const cameraInfo = ref('');
const screenInfo = ref('');

const runService = async (service: string, action: string) => {
    if (service === 'vlc-webcam' && !hasCamera.value) {
        window.$notification.error({ title: '摄像头未连接', content: '请检查摄像头连接后再操作', duration: 3000 });
        return;
    }
    try {
        const res = await os.execCommand(`systemctl ${action} ${service}`);
        console.log(`systemctl ${action} ${service} status`, res.stdOut);
        if (res.stdErr) throw new Error(res.stdErr);
        if (action === 'restart') {
            const status = await os.execCommand(`systemctl is-active ${service}`);
            if (status.stdOut.trim() !== 'active') throw new Error('服务启动失败');
            if (service === 'vlc-screen') runScreen.value = true;
            if (service === 'vlc-webcam') runCamera.value = true;
        } else if (action === 'stop') {
            if (service === 'vlc-screen') runScreen.value = false;
            if (service === 'vlc-webcam') runCamera.value = false;
        }
    } catch (error) {
        console.error(error);
        window.$notification.error({ title: '操作失败', content: (error as any).message, duration: 3000 });
    }
};

const parseConfigValue = (config: string, key: string): string | undefined => {
    const match = config.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match?.[1]?.trim();
};

const runVLC = async (service: string) => {
    const config = service === 'webcam' ? cameraInfo.value : screenInfo.value;
    const port = parseConfigValue(config, 'VLC_PORT') ?? (service === 'webcam' ? '8080' : '8090');
    try {
        const res = await os.execCommand(`vlc http://localhost:${port}/`);
        console.log('run vlc on test', res);
        if (res.exitCode) throw new Error(res.stdErr);
        window.$notification.success({ title: 'VLC启动成功', content: '请查看VLC播放器，确认视频正常后关闭', duration: 3000 });
    } catch (error) {
        console.error(error);
        window.$notification.error({ title: 'VLC启动失败', content: (error as any).message, duration: 3000 });
    }
}

const statusService = async (service: string) => {
    try {
        const res = await os.execCommand(`systemctl status ${service}`);
        if (res.stdErr) throw new Error(res.stdErr);
        window.$notification.success({ title: '状态获取成功', content: res.stdOut, duration: 10000 });
    } catch (error) {
        console.error(error);
        window.$notification.error({ title: '状态获取失败', content: (error as any).message, duration: 3000 });
    }
};

const saveConfig = async (service: string) => {
    try {
        if (service === 'camera') {
            await writePrivilegedFile('/etc/default/vlc-webcam', cameraInfo.value);
        } else if (service === 'screen') {
            await writePrivilegedFile('/etc/default/vlc-screen', screenInfo.value);
        }
        window.$notification.success({ title: '配置保存成功', content: '请重启服务以应用配置', duration: 3000 });
    } catch (error) {
        console.error(error);
        window.$notification.error({ title: '配置保存失败', content: (error as any).message, duration: 3000 });
    }
};


onMounted(async () => {
    try {
        const checkCamera = await filesystem.readDirectory('/dev');
        hasCamera.value = checkCamera.map((item) => item.entry).filter((item) => item.startsWith('video')).join(', ') || '';
        try {
            const v4l2 = await os.execCommand('v4l2-ctl --list-devices');
            const devices: V4l2Device[] = [];
            let current: V4l2Device | null = null;
            for (const line of v4l2.stdOut.split('\n')) {
                if (line.length === 0) continue;
                if (!line.startsWith('\t')) {
                    current = { name: line.replace(/\s*\(.*\)\s*:?$/, '').trim(), nodes: [] };
                    devices.push(current);
                } else if (current) {
                    const node = line.trim();
                    if (node.startsWith('/dev/video')) current.nodes.push(node);
                }
            }
            cameraDevices.value = devices.filter((d) => d.nodes.length > 0);
        } catch { /* v4l2-ctl not available */ }
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
        const res = await os.execCommand('systemctl is-active vlc-screen');
        runScreen.value = res.stdOut.trim() === 'active';
        const res2 = await os.execCommand('systemctl is-active vlc-webcam');
        runCamera.value = res2.stdOut.trim() === 'active';
    } catch (error) {
        console.error(error);
    }
});
</script>
