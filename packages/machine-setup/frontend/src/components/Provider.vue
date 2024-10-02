<template>
    <div></div>
</template>

<script setup lang="ts">
import { useNotification } from 'naive-ui';

// Declare a global property on the Window interface
declare global {
  interface Window {
    $notification: ReturnType<typeof useNotification>;
  }
}

window.$notification = useNotification();
</script>