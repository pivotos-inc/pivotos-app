<template>
  <view class="page">
    <text class="title">pages-sub 分包示例</text>
    <text class="desc">业务模块页面一律放本分包，控制主包体积 ≤ 2M（《05》第五节）</text>
  </view>
</template>

<script setup lang="ts"></script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 160rpx;
}
.title {
  font-size: 36rpx;
  font-weight: 600;
  color: #2c405a;
}
.desc {
  margin-top: 24rpx;
  padding: 0 64rpx;
  font-size: 26rpx;
  color: #999;
  text-align: center;
}
</style>
