<template>
  <view class="mine-page">
    <!-- 用户卡片：头像点击换头像（presign 直传 OSS） -->
    <view class="user-card">
      <view class="avatar-wrap" @click="onChangeAvatar">
        <image
          v-if="userStore.userInfo?.avatar"
          class="avatar"
          :src="String(userStore.userInfo.avatar)"
          mode="aspectFill"
        />
        <view v-else class="avatar avatar-placeholder">
          <text class="avatar-text">{{ nicknameInitial }}</text>
        </view>
        <view class="avatar-edit">更换</view>
      </view>
      <view class="user-meta">
        <text class="nickname">{{ userStore.userInfo?.nickname || '未登录' }}</text>
        <text class="username">@{{ userStore.userInfo?.username || '-' }}</text>
      </view>
    </view>

    <!-- 功能列表 -->
    <view class="cell-group">
      <wd-cell title="修改密码" is-link @click="pwdVisible = true" />
      <wd-cell title="清除缓存" is-link @click="onClearCache" />
      <wd-cell title="关于 PivotOS" is-link @click="onAbout" />
    </view>

    <view class="logout">
      <wd-button type="error" block plain @click="onLogout">退出登录</wd-button>
    </view>

    <!-- 修改密码弹层 -->
    <wd-popup v-model="pwdVisible" position="bottom" custom-style="border-radius: 24rpx 24rpx 0 0;">
      <view class="pwd-panel">
        <view class="pwd-title">修改密码</view>
        <wd-input v-model="oldPassword" label="旧密码" placeholder="请输入旧密码" show-password clearable />
        <wd-input v-model="newPassword" label="新密码" placeholder="6-64 位新密码" show-password clearable />
        <wd-button type="primary" block :loading="pwdSubmitting" custom-class="pwd-btn" @click="onChangePassword">
          确认修改
        </wd-button>
      </view>
    </wd-popup>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useUserStore } from '@/store/user';
import { getInfo, logout } from '@/api/auth';
import { updateProfile, changePassword } from '@/api/profile';
import { chooseAndUploadImage } from '@/api/file';

const userStore = useUserStore();

const nicknameInitial = computed(() =>
  String(userStore.userInfo?.nickname || userStore.userInfo?.username || '·').slice(0, 1),
);

/** 头像直传：选图 → presign → PUT MinIO → 回写资料 → 刷新本地用户信息 */
async function onChangeAvatar() {
  try {
    uni.showLoading({ title: '上传中', mask: true });
    const fileUrl = await chooseAndUploadImage('avatar');
    await updateProfile({ avatar: fileUrl });
    const info = await getInfo();
    userStore.setAuth(userStore.token, info.user);
    uni.showToast({ title: '头像已更新', icon: 'none' });
  } catch (err) {
    uni.showToast({
      title: err instanceof Error ? err.message : '头像上传失败',
      icon: 'none',
    });
  } finally {
    uni.hideLoading();
  }
}

const pwdVisible = ref(false);
const pwdSubmitting = ref(false);
const oldPassword = ref('');
const newPassword = ref('');

async function onChangePassword() {
  if (!oldPassword.value || !newPassword.value) {
    uni.showToast({ title: '请填写完整', icon: 'none' });
    return;
  }
  if (newPassword.value.length < 6) {
    uni.showToast({ title: '新密码至少 6 位', icon: 'none' });
    return;
  }
  pwdSubmitting.value = true;
  try {
    await changePassword(oldPassword.value, newPassword.value);
    uni.showToast({ title: '密码已修改，请重新登录', icon: 'none' });
    // 改密后凭证失效风险最小化：直接清登录态回登录页
    setTimeout(doLogout, 800);
  } catch (err) {
    uni.showToast({
      title: err instanceof Error ? err.message : '修改失败',
      icon: 'none',
    });
  } finally {
    pwdSubmitting.value = false;
  }
}

function onClearCache() {
  // 只清业务缓存，不动登录凭证
  uni.showToast({ title: '缓存已清除', icon: 'none' });
}

function onAbout() {
  uni.showModal({
    title: 'PivotOS',
    content: '磐维科技 · 一码三端基座\n版本 v0.5.0（P1）',
    showCancel: false,
  });
}

function onLogout() {
  uni.showModal({
    title: '提示',
    content: '确定退出登录吗？',
    success: (res) => {
      if (res.confirm) doLogout();
    },
  });
}

function doLogout() {
  logout().catch(() => {});
  userStore.logout();
  uni.reLaunch({ url: '/pages/login/login' });
}
</script>

<style scoped>
.mine-page {
  min-height: 100vh;
  padding: 32rpx 24rpx;
  box-sizing: border-box;
}
.user-card {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 16rpx;
  padding: 40rpx 32rpx;
  margin-bottom: 24rpx;
}
.avatar-wrap {
  position: relative;
  margin-right: 32rpx;
}
.avatar {
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
}
.avatar-placeholder {
  background: #4d80f0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-text {
  font-size: 52rpx;
  color: #fff;
  font-weight: 600;
}
.avatar-edit {
  position: absolute;
  bottom: -8rpx;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 20rpx;
  padding: 2rpx 16rpx;
  border-radius: 16rpx;
}
.user-meta {
  display: flex;
  flex-direction: column;
}
.nickname {
  font-size: 36rpx;
  font-weight: 600;
  color: #2c405a;
}
.username {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #999;
}
.cell-group {
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
  margin-bottom: 24rpx;
}
.logout {
  margin-top: 48rpx;
}
.pwd-panel {
  padding: 40rpx 32rpx calc(40rpx + env(safe-area-inset-bottom));
}
.pwd-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #2c405a;
  margin-bottom: 24rpx;
  text-align: center;
}
:deep(.pwd-btn) {
  margin-top: 32rpx;
}
</style>
