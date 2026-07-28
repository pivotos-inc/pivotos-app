<template>
  <view class="page">
    <view class="profile">
      <image class="avatar" src="/static/logo.png" mode="aspectFit" />
      <view class="info">
        <text class="nickname">{{ userStore.userInfo?.nickname || '未登录（基座占位）' }}</text>
        <text class="sub">资料 / 头像直传 OSS / 改密 / 设置 于 S16 接入</text>
      </view>
    </view>
    <view class="actions">
      <wd-button type="error" plain block @click="onLogout">清除本地凭证并回登录页</wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useUserStore } from '@/store/user';

const userStore = useUserStore();

function onLogout() {
  userStore.logout();
  uni.reLaunch({ url: '/pages/login/login' });
}
</script>

<style scoped>
.profile {
  display: flex;
  align-items: center;
  margin: 24rpx;
  padding: 40rpx 32rpx;
  background: #fff;
  border-radius: 16rpx;
}
.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  margin-right: 32rpx;
}
.info {
  display: flex;
  flex-direction: column;
}
.nickname {
  font-size: 34rpx;
  font-weight: 600;
  color: #2c405a;
}
.sub {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #999;
}
.actions {
  margin: 48rpx 24rpx;
}
</style>
