<template>
    <n-grid x-gap="6" :cols="2">
        <n-gi>
            <n-card bordered shadow="always" style="margin-bottom: .25em;" class="text-center">
                <h2 style="margin: .5em 0;">@Hydro/XCPC-TOOLS</h2>
                <h1 style="margin: .25em 0;">Setup Tool</h1>
            </n-card>
            <n-card bordered shadow="always">
                <n-input placeholder="请输入座位号" v-model:value="editSeat" type="text" size="large" style="width: 100%; margin-bottom: .5em;" />
                <n-grid x-gap="12" :cols="2" style="width: 100%;">
                    <n-gi>
                        <n-button type="primary" @click="saveSeat" style="width: 100%;">保存</n-button>
                    </n-gi>
                    <n-gi>
                        <n-button type="info" @click="showSeat" style="width: 100%;">放大显示</n-button>
                    </n-gi>
                </n-grid>
            </n-card>
        </n-gi>
        <n-gi>
            <n-card bordered shadow="always">
                <n-popconfirm @positive-click="checkAll">
                    <template #trigger>
                        <n-button type="primary" style="width: 100%;">完成设备检查</n-button>
                    </template>
                    确认完成设备检查？
                </n-popconfirm>
            </n-card>
            <n-card bordered shadow="always" class="text-center">
                <h1 style="margin: 0;">座位号</h1>
                <h1 style="font-size: 5em; margin: 0;">{{ nowSeat || 'XX-XX' }}</h1>
            </n-card>
        </n-gi>
    </n-grid>
</template>

<script setup lang="ts">
import { filesystem, os } from '@neutralinojs/lib';
import { NCard, NGrid, NGi, NButton, NInput, NPopconfirm } from 'naive-ui';
import { onMounted, ref } from 'vue';

const nowSeat = ref('');
const editSeat = ref('');

const saveSeat = async () => {
    try {
        console.log('save seat', editSeat.value);
        await filesystem.writeFile('/var/lib/icpc/config.json', JSON.stringify({ seat: editSeat.value }));
        const read = await filesystem.readFile('/var/lib/icpc/config.json');
        console.log('read seat', read);
        const res = await os.execCommand(`hostnamectl set-hostname ${editSeat.value}`);
        console.log('run hostnamectl', res);
        nowSeat.value = editSeat.value;
    } catch (error) {
        console.error(error);
        window.$notification.error({ title: '保存座位号失败', content: (error as any).message });
    }
};

const showSeat = async () => {
    try {
        console.log('show seat', nowSeat.value);
        const res = await os.execCommand(`zenity --info --text "<span font='256'>${nowSeat.value}</span>"`);
        if (res.stdErr) throw new Error(res.stdErr);
    } catch (error) {
        console.error(error);
        window.$notification.error({ title: '放大显示座位号失败', content: (error as any).message });
    }
};

const checkAll = () => {
  console.log('check all');
};

onMounted(async () => {
    try {
        const res = await filesystem.readFile('/var/lib/icpc/config.json');
        nowSeat.value = JSON.parse(res || '{}').seat || '';
    } catch (error) {
        console.error(error);
    }
});
</script>