<template>
  <view class="login-page">
    <view class="brand">
      <image class="logo" src="/static/logo.png" mode="aspectFit" />
      <text class="app-name">PivotOS</text>
      <text class="slogan">磐维科技 · 一码三端</text>
    </view>
    <view class="actions">
      <!-- 登录体系（账密 / 微信小程序 / 支付宝 / App）于 S16 接入 auth Starter 多账号体系 -->
      <wd-button type="primary" block @click="goWorkbench">工程基座占位 · 进入工作台</wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
function goWorkbench() {
  uni.reLaunch({ url: '/pages/workbench/workbench' });
}
</script>

<style scoped>
.login-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 160rpx 64rpx 0;
}
.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 120rpx;
}
.logo {
  width: 160rpx;
  height: 160rpx;
  margin-bottom: 24rpx;
}
.app-name {
  font-size: 44rpx;
  font-weight: 600;
  color: #2c405a;
}
.slogan {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: #999;
}
.actions {
  width: 100%;
}
</style>
