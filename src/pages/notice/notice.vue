<template>
  <view class="page">
    <wd-status-tip image="content" tip="暂无消息">
      <template #custom>
        <text class="tip">消息通知（列表 / 详情 / 全部已读）于 S16 接入 message Plugin</text>
      </template>
    </wd-status-tip>
  </view>
</template>

<script setup lang="ts">
// S16：对接 message Plugin 消息中心
</script>

<style scoped>
.page {
  padding-top: 120rpx;
}
.tip {
  font-size: 26rpx;
  color: #999;
}
</style>
