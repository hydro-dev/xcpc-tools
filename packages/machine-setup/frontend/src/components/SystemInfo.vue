<template>
    <n-card bordered title="Machine Info" shadow="always" style="margin-bottom: .25em;">
        <n-grid x-gap="12" :cols="2">
            <n-gi>
                <p>CPU: {{ cpuInfo }}</p>
                <p>Mem: {{ memoryInfo }}</p>
                <p>OS: {{ osInfo }}</p>
                <p>Image Version: {{ imageVer }}</p>
                <p>Displays: {{ displaysInfo }}</p>
            </n-gi>
            <n-gi>
                <p>gcc: {{ gccVer }}</p>
                <p>g++: {{ gppVer }}</p>
                <p>java: {{ javaVer }}</p>
                <p>kotlin: {{ kotlinVer }}</p>
                <p>python3: {{ python3Ver }}</p>
                <p>pypy3: {{ pypy3Ver }}</p>
            </n-gi>
        </n-grid>
    </n-card>
</template>

<script setup lang="ts">
import { computer, filesystem, os } from '@neutralinojs/lib';
import { onMounted, ref } from 'vue';

const osInfo = ref<string>('Loading...');
const cpuInfo = ref<string>('Loading...');
const memoryInfo = ref<string>('Loading...');
const displaysInfo = ref<string>('Loading...');
const imageVer = ref<string>('Loading...');

const gccVer = ref<string>('Loading...');
const gppVer = ref<string>('Loading...');
const javaVer = ref<string>('Loading...');
const kotlinVer = ref<string>('Loading...');
const python3Ver = ref<string>('Loading...');
const pypy3Ver = ref<string>('Loading...');

const getVer = async (cmd: string, regexp?: string) => {
    try {
        const exec = await os.execCommand(`${cmd}`);
        if (regexp) {
            let match = exec.stdOut.match(new RegExp(regexp));
            if (!exec.stdOut || !match || !match.length) {
                match = exec.stdErr.match(new RegExp(regexp));
            }
            console.log(cmd, exec, match);
            return match ? match[0] : 'Not found';
        }
        return exec.stdOut;
    } catch (e) {
        return 'Not found';
    }
}

onMounted(async () => {
    const [arch, kernel, os, cpu, memory, displays] = await Promise.all([
        computer.getArch(),
        computer.getKernelInfo(),
        computer.getOSInfo(),
        computer.getCPUInfo(),
        computer.getMemoryInfo(),
        computer.getDisplays(),
    ]);
    osInfo.value = `${os.name} ${os.version} ${arch} - ${os.description}(${kernel.variant} ${kernel.version})`;
    cpuInfo.value = `${cpu.physicalCores}C${cpu.logicalThreads}T ${cpu.architecture} ${cpu.model} ${(cpu.frequency / 1024 / 1024 / 1024).toFixed(2)}GHz`;
    memoryInfo.value = `P: ${(memory.physical.available / 1024 / 1024 / 1024).toFixed(2)}GB/${(memory.physical.total / 1024 / 1024 / 1024).toFixed(2)}GB
S: ${(memory.virtual.available / 1024 / 1024 / 1024).toFixed(2)}GB/${(memory.virtual.total / 1024 / 1024 / 1024).toFixed(2)}GB`;
    displaysInfo.value = displays.map(d => `${d.resolution.width}x${d.resolution.height}@${d.refreshRate}Hz`).join(', ');
    try {
        const imageversion = await filesystem.readFile('/etc/icpcimage-version')
        imageVer.value = imageversion;
    } catch (e) {
        imageVer.value = 'Unknown';
    }
    gccVer.value = await getVer('gcc --version', '[0-9.]+\.[0-9.]+(\.[0-9]+)?([_-p][0-9]+)?');
    gppVer.value = await getVer('g++ --version', '[0-9.]+\.[0-9.]+(\.[0-9]+)?([_-p][0-9]+)?');
    javaVer.value = await getVer('java -version', '[0-9.]+\.[0-9.]+(\.[0-9]+)?');
    kotlinVer.value = await getVer('kotlin -version', '[0-9.]+\.[0-9.]+(\.[0-9]+)?');
    python3Ver.value = await getVer('python3 --version', '[0-9.]+\.[0-9.]+(\.[0-9]+)?');
    pypy3Ver.value = await getVer('pypy3 --version', '[0-9.]+\.[0-9.]+(\.[0-9]+)?');
});
</script>