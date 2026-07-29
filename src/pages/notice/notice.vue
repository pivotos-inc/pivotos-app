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
        :key="msg.userMessageId"
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
  unreadCount,
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

function onTabChange(e: { name: string | number; index: number }) {
  // wd-tabs 的 change 先于 update:modelValue 触发（组件内先 emit('change') 再
  // emit('update:modelValue')），此处直接用事件携带的新值，否则 readStatus 滞后一拍
  tab.value = String(e.name);
  load(true);
}

/** 同步 tabbar 消息角标（与工作台 index=1 对应） */
async function refreshBadge() {
  const n = await unreadCount().catch(() => -1);
  if (n < 0) return;
  if (n > 0) {
    uni.setTabBarBadge({ index: 1, text: String(n) });
  } else {
    uni.removeTabBarBadge({ index: 1 });
  }
}

/** 点开即已读（未读才调接口）；未读 tab 下已读条目即时移出列表 */
async function openMessage(msg: UserMessage) {
  if (msg.readStatus === 0) {
    try {
      await markRead(msg.userMessageId);
      msg.readStatus = 1;
      if (tab.value === '0') {
        list.value = list.value.filter((m) => m.userMessageId !== msg.userMessageId);
        total.value = Math.max(0, total.value - 1);
      }
      refreshBadge();
    } catch {
      // request 层已 toast，条目不改动
    }
  }
  uni.showModal({
    title: msg.title,
    content: msg.content || '',
    showCancel: false,
  });
}

async function onReadAll() {
  try {
    const count = await markAllRead();
    uni.showToast({ title: count > 0 ? `已读 ${count} 条` : '没有未读消息', icon: 'none' });
    // 未读 tab 下先即时清空（不等回表），再回源拉取对齐服务端状态
    if (tab.value === '0') {
      list.value = [];
    }
    refreshBadge();
  } catch {
    // 失败时 request 层已 toast，列表保持原样并回源一次以呈现真实状态
  }
  await load(true);
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
