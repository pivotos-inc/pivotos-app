<template>
  <view class="notice-page">
    <!-- 已读/未读切换 + 全部已读 -->
    <view class="toolbar">
      <wd-tabs v-model="tab" @change="onTabChange">
        <wd-tab title="未读" name="0" />
        <wd-tab title="已读" name="1" />
      </wd-tabs>
      <view class="read-all" @click="onReadAll">全部已读</view>
    </view>

    <view v-if="list.length > 0" class="msg-list">
      <view
        v-for="msg in list"
        :key="msg.id"
        class="msg-item"
        :class="{ unread: msg.readStatus === 0 }"
        @click="openMessage(msg)"
      >
        <view class="msg-head">
          <text class="msg-title">{{ msg.title }}</text>
          <text class="msg-time">{{ formatTime(msg.createTime) }}</text>
        </view>
        <text class="msg-content">{{ msg.content }}</text>
        <view v-if="msg.readStatus === 0" class="dot" />
      </view>
      <wd-loadmore :state="loadState" @loadmore="loadMore" />
    </view>
    <wd-status-tip v-else-if="loaded" image="message" tip="暂无消息" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow, onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app';
import {
  pageMessages,
  markRead,
  markAllRead,
  type UserMessage,
} from '@/api/message';

const PAGE_SIZE = 20;

const tab = ref('0');
const list = ref<UserMessage[]>([]);
const pageNo = ref(1);
const total = ref(0);
const loaded = ref(false);
const loadState = ref<'loading' | 'finished' | 'error'>('loading');

async function load(reset = false) {
  if (reset) {
    pageNo.value = 1;
    list.value = [];
  }
  try {
    const result = await pageMessages({
      pageNum: pageNo.value,
      pageSize: PAGE_SIZE,
      readStatus: Number(tab.value),
    });
    const records = result.list ?? [];
    list.value = reset ? records : [...list.value, ...records];
    total.value = Number(result.total) || 0;
    loadState.value = list.value.length >= total.value ? 'finished' : 'loading';
  } finally {
    loaded.value = true;
    uni.stopPullDownRefresh();
  }
}

function loadMore() {
  if (list.value.length >= total.value) return;
  pageNo.value += 1;
  load();
}

onShow(() => load(true));
onPullDownRefresh(() => load(true));
onReachBottom(loadMore);

function onTabChange() {
  load(true);
}

/** 点开即已读（未读才调接口） */
async function openMessage(msg: UserMessage) {
  if (msg.readStatus === 0) {
    msg.readStatus = 1;
    markRead(msg.id).catch(() => {});
  }
  uni.showModal({
    title: msg.title,
    content: msg.content || '',
    showCancel: false,
  });
}

async function onReadAll() {
  const count = await markAllRead().catch(() => 0);
  uni.showToast({ title: count > 0 ? `已读 ${count} 条` : '没有未读消息', icon: 'none' });
  load(true);
}

function formatTime(time?: string): string {
  return time ? time.slice(5, 16) : '';
}
</script>

<style scoped>
.notice-page {
  min-height: 100vh;
}
.toolbar {
  position: relative;
  background: #fff;
}
.read-all {
  position: absolute;
  right: 24rpx;
  top: 50%;
  transform: translateY(-50%);
  font-size: 24rpx;
  color: #4d80f0;
  z-index: 1;
}
.msg-list {
  padding: 16rpx 24rpx;
}
.msg-item {
  position: relative;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx 28rpx;
  margin-bottom: 16rpx;
}
.msg-item.unread {
  border-left: 6rpx solid #4d80f0;
}
.msg-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8rpx;
}
.msg-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #2c405a;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.msg-time {
  font-size: 22rpx;
  color: #999;
  margin-left: 16rpx;
}
.msg-content {
  font-size: 26rpx;
  color: #666;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dot {
  position: absolute;
  top: 32rpx;
  right: 28rpx;
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  background: #fa4350;
}
</style>
