<template>
  <view class="login-page">
    <view class="brand">
      <image class="logo" src="/static/logo.png" mode="aspectFit" />
      <text class="app-name">PivotOS</text>
      <text class="slogan">枢磐科技 · 一码三端</text>
    </view>

    <!-- 微信小程序：一键登录主链路；未绑定微信引导绑定 -->
    <!-- #ifdef MP-WEIXIN -->
    <view v-if="!needBind" class="actions">
      <wd-button type="primary" block :loading="submitting" @click="onWechatLogin">
        微信一键登录
      </wd-button>
      <view class="switch-entry" @click="showAccountForm = !showAccountForm">
        {{ showAccountForm ? '收起账密登录' : '使用账号密码登录' }}
      </view>
    </view>

    <!-- 未绑定引导：手机号授权（自动建档/绑定）或账密绑定 -->
    <view v-if="needBind" class="bind-panel">
      <wd-notify type="warning" message="该微信尚未绑定账号，请选择绑定方式" />
      <wd-button
        type="success"
        block
        open-type="getPhoneNumber"
        :loading="submitting"
        @getphonenumber="onPhoneAuthorize"
      >
        手机号快捷绑定
      </wd-button>
      <view class="switch-entry" @click="needBind = false">返回</view>
    </view>
    <!-- #endif -->

    <!-- 账密表单：H5/App 主链路；微信端可折叠兜底 -->
    <!-- #ifndef MP-WEIXIN -->
    <view class="form">
      <wd-input v-model="username" label="用户名" placeholder="请输入用户名" clearable />
      <wd-input v-model="password" label="密码" placeholder="请输入密码" show-password clearable />
      <wd-button type="primary" block :loading="submitting" custom-class="login-btn" @click="onPasswordLogin">
        登 录
      </wd-button>
      <!-- #ifdef MP-ALIPAY -->
      <view class="tip">支付宝一键登录将在 appid/secret 配置后开放，当前请使用账密登录</view>
      <!-- #endif -->
    </view>
    <!-- #endif -->

    <!-- #ifdef MP-WEIXIN -->
    <view v-if="showAccountForm && !needBind" class="form">
      <wd-input v-model="username" label="用户名" placeholder="请输入用户名" clearable />
      <wd-input v-model="password" label="密码" placeholder="请输入密码" show-password clearable />
      <wd-button type="primary" block :loading="submitting" custom-class="login-btn" @click="onBindByAccount">
        绑定并登录
      </wd-button>
    </view>
    <!-- #endif -->
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useLogin } from '@/composables/useLogin';
import { useUserStore } from '@/store/user';
import { ServiceError } from '@/utils/request';

const { submitting, loginByPassword, loginByWechat, bindByPhone, bindByAccount } = useLogin();
const userStore = useUserStore();

/** 已登录直接进工作台（启动页为 login 的场景） */
onShow(() => {
  if (userStore.isLoggedIn) {
    uni.switchTab({ url: '/pages/workbench/workbench' });
  }
});

// 预填测试账号，方便联调直登（正式部署前可清空）
const username = ref('admin');
const password = ref('admin123');
/** 微信端：未绑定引导面板 */
const needBind = ref(false);
/** 微信端：账密表单折叠开关 */
const showAccountForm = ref(false);

function validate(): boolean {
  if (!username.value.trim()) {
    uni.showToast({ title: '请输入用户名', icon: 'none' });
    return false;
  }
  if (!password.value) {
    uni.showToast({ title: '请输入密码', icon: 'none' });
    return false;
  }
  return true;
}

/** 账密登录（H5/App 主链路） */
async function onPasswordLogin() {
  if (!validate()) return;
  await loginByPassword(username.value.trim(), password.value).catch(() => {});
}

/** 微信一键登录：未绑定 → 打开绑定引导 */
async function onWechatLogin() {
  try {
    await loginByWechat();
  } catch (err) {
    if (err instanceof ServiceError && err.message === 'MINI_UNBOUND') {
      needBind.value = true;
    }
  }
}

/** 手机号授权回调（button open-type=getPhoneNumber） */
async function onPhoneAuthorize(e: { detail?: { code?: string; errMsg?: string } }) {
  const code = e?.detail?.code;
  if (!code) {
    uni.showToast({ title: '已取消手机号授权', icon: 'none' });
    return;
  }
  await bindByPhone(code).catch(() => {});
}

/** 微信端账密绑定登录 */
async function onBindByAccount() {
  if (!validate()) return;
  await bindByAccount(username.value.trim(), password.value).catch(() => {});
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
  margin-bottom: 96rpx;
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
.actions,
.bind-panel,
.form {
  width: 100%;
}
.bind-panel {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.switch-entry {
  margin-top: 24rpx;
  text-align: center;
  font-size: 26rpx;
  color: #4d80f0;
}
.tip {
  margin-top: 24rpx;
  text-align: center;
  font-size: 24rpx;
  color: #999;
}
:deep(.login-btn) {
  margin-top: 32rpx;
}
</style>
