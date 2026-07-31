<template>
  <view class="detail-page">
    <template v-if="detail">
      <view class="detail-header">
        <view class="detail-tag" :class="detail.noticeType === 1 ? 'is-notice' : 'is-announce'">
          {{ detail.noticeType === 1 ? '通知' : '公告' }}
        </view>
        <text class="detail-title">{{ detail.title }}</text>
        <text class="detail-time">{{ detail.publishTime }}</text>
      </view>
      <!-- 富文本内容：管理端编辑器产出的受控 HTML -->
      <rich-text class="detail-content" :nodes="detail.content || '<p>（无内容）</p>'" />
    </template>
    <wd-status-tip v-else-if="loaded" image="content" tip="公告不存在或已撤回" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getAnnouncement, type AnnouncementItem } from '@/api/announcement';

const detail = ref<AnnouncementItem>();
const loaded = ref(false);

onLoad(async (query) => {
  const id = query?.id;
  if (!id) {
    loaded.value = true;
    return;
  }
  try {
    detail.value = await getAnnouncement(id);
  } finally {
    loaded.value = true;
  }
});
</script>

<style scoped>
.detail-page {
  min-height: 100vh;
  padding: 32rpx;
  box-sizing: border-box;
  background: #fff;
}
.detail-header {
  padding-bottom: 24rpx;
  margin-bottom: 24rpx;
  border-bottom: 1rpx solid #eee;
}
.detail-tag {
  display: inline-block;
  padding: 4rpx 16rpx;
  margin-bottom: 16rpx;
  font-size: 22rpx;
  border-radius: 8rpx;
}
.detail-tag.is-notice {
  color: #4d80f0;
  background: #eef3fe;
}
.detail-tag.is-announce {
  color: #b88230;
  background: #fdf6ec;
}
.detail-title {
  display: block;
  font-size: 36rpx;
  font-weight: 600;
  color: #2c405a;
  margin-bottom: 12rpx;
}
.detail-time {
  font-size: 24rpx;
  color: #999;
}
.detail-content {
  font-size: 28rpx;
  line-height: 1.7;
  color: #333;
  word-break: break-word;
}
</style>
