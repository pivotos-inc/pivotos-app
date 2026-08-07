<template>
  <view class="settings-page">
    <wd-navbar title="设置" left-text="返回" left-arrow @click-left="goBack" safe-area-inset-top />
    <view class="settings-body">
      <wd-cell-group title="通用" border>
        <wd-cell title="清除缓存" is-link :clickable="true" @click="handleClearCache">
          <template #icon>
            <wd-icon name="delete-thin" size="18px" custom-style="margin-right: 8px" />
          </template>
        </wd-cell>
      </wd-cell-group>

      <wd-cell-group title="关于" border>
        <wd-cell title="关于枢磐科技" is-link :clickable="true" @click="handleAbout">
          <template #icon>
            <wd-icon name="info-circle" size="18px" custom-style="margin-right: 8px" />
          </template>
        </wd-cell>
      </wd-cell-group>
    </view>

    <view class="version-info">
      <text class="version-text">版本 {{ versionName }}</text>
    </view>

    <!-- useMessage 的弹窗宿主（S38 FIND-19 修复）：未挂载时 confirm/alert 会静默失效 -->
    <wd-message-box />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useMessage } from 'wot-design-uni'

const message = useMessage()

/** 版本号与 manifest.json 同步 */
const versionName = ref('2.0.0')

const goBack = () => {
  uni.navigateBack()
}

const handleClearCache = () => {
  message
    .confirm({
      title: '清除缓存',
      msg: '确定要清除应用缓存吗？不会影响您的登录状态。',
      confirmButtonText: '确定清除',
      cancelButtonText: '取消',
    })
    .then(() => {
      // 保存登录凭证后全量清除，再恢复
      const savedToken = uni.getStorageSync('token')
      const savedUserInfo = uni.getStorageSync('userInfo')

      uni.clearStorageSync()

      if (savedToken) uni.setStorageSync('token', savedToken)
      if (savedUserInfo) uni.setStorageSync('userInfo', savedUserInfo)

      uni.showToast({ title: '缓存已清除', icon: 'success', duration: 1500 })
    })
    .catch(() => {
      // 用户取消
    })
}

const handleAbout = () => {
  const platformName = getPlatformName()
  const appInfo = `枢磐科技 PivotOS v${versionName.value}
一码三端企业管理平台
当前平台：${platformName}`

  message.alert({
    title: '关于枢磐科技',
    msg: appInfo,
    confirmButtonText: '知道了',
  })
}

function getPlatformName(): string {
  // #ifdef H5
  return 'H5'
  // #endif
  // #ifdef MP-WEIXIN
  return '微信小程序'
  // #endif
  // #ifdef APP-PLUS
  return 'App'
  // #endif
  return '未知平台'
}
</script>

<style scoped lang="scss">
.settings-page {
  height: 100vh;
  background-color: #f5f6fa;
}

.settings-body {
  padding-top: 12px;

  :deep(.wd-cell-group) {
    margin: 0 12px 12px;
    border-radius: 12px;
    overflow: hidden;
  }

  :deep(.wd-cell-group__title) {
    padding: 16px 16px 8px;
    font-size: 13px;
    color: #999;
  }

  :deep(.wd-cell) {
    padding: 14px 16px;
  }

  :deep(.wd-cell__title) {
    font-size: 15px;
    color: #333;
  }
}

.version-info {
  position: absolute;
  bottom: 60px;
  width: 100%;
  text-align: center;
}

.version-text {
  font-size: 12px;
  color: #c0c4cc;
}
</style>
