<template>
  <view class="page">
    <text class="title">pages-gen 生成器分包示例</text>
    <text class="desc">代码生成器产物拷贝至 src/pages-gen/{模块}/ 并在此分包注册（《05》第三节）</text>
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
