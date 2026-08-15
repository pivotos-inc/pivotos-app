<template>
  <view class="workbench-page">
    <!-- 通知横幅：有未读时展示，点击进消息中心 -->
    <view v-if="unread > 0" class="notice-banner" @click="goNotice">
      <text class="banner-text">你有 {{ unread }} 条未读消息</text>
      <text class="banner-arrow">›</text>
    </view>

    <!-- 公告栏（S26）：最新已发布公告，点击进详情 -->
    <view v-if="announcements.length > 0" class="announce-card">
      <view class="section-title">通知公告</view>
      <view
        v-for="item in announcements"
        :key="item.id"
        class="announce-item"
        @click="goAnnouncement(item)"
      >
        <view class="announce-tag" :class="item.noticeType === 1 ? 'is-notice' : 'is-announce'">
          {{ item.noticeType === 1 ? '通知' : '公告' }}
        </view>
        <text class="announce-title">{{ item.title }}</text>
        <text class="announce-arrow">›</text>
      </view>
    </view>

    <!-- 宫格菜单：后端按角色 + device 下发 -->
    <view class="section-title">应用</view>
    <view v-if="items.length > 0" class="grid">
      <view v-for="item in items" :key="item.id" class="grid-item" @click="openItem(item)">
        <view class="grid-icon">
          <text class="grid-icon-text">{{ iconText(item) }}</text>
        </view>
        <text class="grid-name">{{ item.menuName }}</text>
      </view>
    </view>
    <wd-status-tip v-else-if="loaded" image="content" tip="暂无可用应用" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import { getWorkbenchItems, type WorkbenchItem } from '@/api/workbench';
import { unreadCount } from '@/api/message';
import { listAnnouncements, type AnnouncementItem } from '@/api/announcement';

const items = ref<WorkbenchItem[]>([]);
const unread = ref(0);
const loaded = ref(false);
const announcements = ref<AnnouncementItem[]>([]);

/** AI 助手固定入口（S22：前端内置，不占后端菜单；菜单化下发待 S23 多租户 AI 配置一并评估） */
const AI_ENTRY: WorkbenchItem = {
  id: 'ai-chat',
  menuName: 'AI 助手',
  icon: '',
  path: '/pages-sub/ai/chat',
  sort: 0,
};

/** 我的流程固定入口（S79：发起/进度移动端补齐，与 AI 助手同口径前端内置） */
const WORKFLOW_ENTRY: WorkbenchItem = {
  id: 'workflow-started',
  menuName: '我的流程',
  icon: '',
  path: '/pages-sub/workflow/started',
  sort: 0,
};

async function loadData() {
  try {
    const [grid, count, notices] = await Promise.all([
      getWorkbenchItems(),
      unreadCount().catch(() => 0),
      listAnnouncements(3).catch(() => [] as AnnouncementItem[]),
    ]);
    items.value = [AI_ENTRY, WORKFLOW_ENTRY, ...grid];
    unread.value = Number(count) || 0;
    announcements.value = notices;
    // 消息 tab 角标同步
    if (unread.value > 0) {
      uni.setTabBarBadge({ index: 1, text: String(unread.value) });
    } else {
      uni.removeTabBarBadge({ index: 1 });
    }
  } finally {
    loaded.value = true;
    uni.stopPullDownRefresh();
  }
}

onShow(loadData);
onPullDownRefresh(loadData);

/** 图标槽位：后端 icon 字段预留语义，一期用文字首字符占位（图标体系 P2 定） */
function iconText(item: WorkbenchItem): string {
  return item.menuName?.slice(0, 1) || '·';
}

function openItem(item: WorkbenchItem) {
  if (!item.path) return;
  // tabBar 页面必须 switchTab，其余 navigateTo
  const tabPages = ['/pages/workbench/workbench', '/pages/notice/notice', '/pages/mine/mine'];
  if (tabPages.includes(item.path)) {
    uni.switchTab({ url: item.path });
  } else {
    uni.navigateTo({ url: item.path });
  }
}

function goNotice() {
  uni.switchTab({ url: '/pages/notice/notice' });
}

function goAnnouncement(item: AnnouncementItem) {
  uni.navigateTo({ url: `/pages-sub/announcement/detail?id=${item.id}` });
}
</script>

<style scoped>
.workbench-page {
  min-height: 100vh;
  padding: 24rpx 32rpx;
  box-sizing: border-box;
}
.notice-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 28rpx;
  margin-bottom: 32rpx;
  background: #fdf6ec;
  border: 1rpx solid #f5c97b;
  border-radius: 16rpx;
}
.banner-text {
  font-size: 26rpx;
  color: #b88230;
}
.banner-arrow {
  font-size: 32rpx;
  color: #b88230;
}
.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #2c405a;
  margin-bottom: 24rpx;
}
.announce-card {
  padding: 24rpx 28rpx 8rpx;
  margin-bottom: 32rpx;
  background: #fff;
  border-radius: 16rpx;
}
.announce-item {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-top: 1rpx solid #f2f3f5;
}
.announce-tag {
  flex-shrink: 0;
  padding: 2rpx 12rpx;
  margin-right: 16rpx;
  font-size: 20rpx;
  border-radius: 6rpx;
}
.announce-tag.is-notice {
  color: #4d80f0;
  background: #eef3fe;
}
.announce-tag.is-announce {
  color: #b88230;
  background: #fdf6ec;
}
.announce-title {
  flex: 1;
  font-size: 26rpx;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.announce-arrow {
  font-size: 30rpx;
  color: #c0c4cc;
  margin-left: 12rpx;
}
.grid {
  display: flex;
  flex-wrap: wrap;
}
.grid-item {
  width: 25%;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 40rpx;
}
.grid-icon {
  width: 96rpx;
  height: 96rpx;
  border-radius: 24rpx;
  background: #eef3fe;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12rpx;
}
.grid-icon-text {
  font-size: 40rpx;
  color: #4d80f0;
  font-weight: 600;
}
.grid-name {
  font-size: 24rpx;
  color: #333;
}
</style>
