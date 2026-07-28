<template>
  <view class="page">
    <wd-notice-bar
      text="PivotOS 移动端工程基座（S15）：工作台宫格与待办于 S16 接入后端菜单"
      type="primary"
    />
    <view class="card">
      <text class="card-title">工程基座自检</text>
      <wd-cell-group border>
        <wd-cell title="运行平台" :value="platform" />
        <wd-cell title="设备型号" :value="device" />
        <wd-cell title="登录状态" :value="userStore.isLoggedIn ? '已登录' : '未登录'" />
      </wd-cell-group>
    </view>
    <view class="actions">
      <wd-button type="primary" plain @click="go('/pages/notice/notice')">消息（占位）</wd-button>
      <wd-button type="primary" plain @click="go('/pages/mine/mine')">我的（占位）</wd-button>
      <wd-button plain @click="go('/pages-sub/demo/demo')">分包示例</wd-button>
      <wd-button plain @click="go('/pages-gen/demo/demo')">生成器分包示例</wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { PLATFORM } from '@/utils/platform';
import { useAppStore } from '@/store/app';
import { useUserStore } from '@/store/user';

const appStore = useAppStore();
const userStore = useUserStore();
const platform = ref(PLATFORM);
const device = computed(() => appStore.systemInfo?.model || '-');

onMounted(() => {
  appStore.initSystemInfo();
});

function go(url: string) {
  uni.navigateTo({ url });
}
</script>

<style scoped>
.page {
  padding-bottom: 48rpx;
}
.card {
  margin: 24rpx;
  padding: 32rpx;
  background: #fff;
  border-radius: 16rpx;
}
.card-title {
  display: block;
  margin-bottom: 24rpx;
  font-size: 32rpx;
  font-weight: 600;
  color: #2c405a;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  margin: 32rpx 24rpx 0;
}
</style>
