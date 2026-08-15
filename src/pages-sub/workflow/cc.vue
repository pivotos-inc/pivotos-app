<template>
  <view class="cc-page">
    <!-- 搜索 + 已读筛选 -->
    <wd-search v-model="keyword" placeholder="按流程名称搜索" hide-cancel @search="onSearch" @clear="onSearch" />
    <wd-tabs v-model="activeTab" @change="onTabChange">
      <wd-tab v-for="tab in TABS" :key="tab.name" :title="tab.title" :name="tab.name" />
    </wd-tabs>

    <!-- 抄送列表 -->
    <view v-if="list.length > 0" class="list">
      <view v-for="item in list" :key="item.id" class="card" @click="openDetail(item)">
        <view class="card-head">
          <view class="head-left">
            <view v-if="item.readFlag === 0" class="unread-dot" />
            <text class="flow-name">{{ item.flowName ?? '-' }}</text>
          </view>
          <wd-tag :type="statusTagType(item.flowStatus)" size="small">
            {{ statusLabel(item.flowStatus) }}
          </wd-tag>
        </view>
        <view class="card-row">
          <text class="label">发起人</text>
          <text class="value">{{ item.creatorName ?? '-' }}</text>
        </view>
        <view class="card-row">
          <text class="label">当前节点</text>
          <text class="value">{{ item.nodeName ?? '-' }}</text>
        </view>
        <view class="card-row">
          <text class="label">抄送时间</text>
          <text class="value">{{ item.createTime ?? '-' }}</text>
        </view>
        <view class="card-row">
          <text class="label">阅读状态</text>
          <text class="value">{{ item.readFlag === 1 ? '已读' : '未读' }}</text>
        </view>
      </view>
      <wd-status-tip v-if="finished && list.length > 0" image="content" tip="没有更多了" />
    </view>
    <wd-status-tip v-else-if="loaded" image="content" tip="暂无抄送记录" />

    <!-- 详情弹窗：标记已读 + 审批进度 -->
    <wd-popup v-model="detailVisible" position="bottom" custom-style="border-radius: 24rpx 24rpx 0 0; padding: 32rpx; max-height: 70vh;">
      <scroll-view scroll-y class="detail-scroll">
        <view class="detail-title">抄送详情</view>
        <view v-if="detailRow" class="detail-summary">
          <text>流程「{{ detailRow.flowName }}」</text>
          <wd-tag :type="statusTagType(detailRow.flowStatus)" size="small">
            {{ statusLabel(detailRow.flowStatus) }}
          </wd-tag>
        </view>
        <view v-if="detailRow" class="detail-meta">
          <text>发起人：{{ detailRow.creatorName ?? '-' }}</text>
          <text>当前节点：{{ detailRow.nodeName ?? '-' }}</text>
        </view>
        <view class="detail-title sub">审批进度</view>
        <template v-if="historyList.length > 0">
          <view v-for="item in historyList" :key="item.id" class="history-item">
            <view class="history-head">
              <text class="history-node">{{ item.nodeName }}</text>
              <wd-tag :type="skipTagType(item.skipType)" size="small">{{ skipLabel(item.skipType) }}</wd-tag>
            </view>
            <view class="history-meta">
              <text>审批人: {{ item.approver ?? '-' }}</text>
              <text class="history-time">{{ item.createTime }}</text>
            </view>
            <text v-if="item.message" class="history-msg">意见: {{ item.message }}</text>
          </view>
        </template>
        <wd-status-tip v-else-if="historyLoaded" image="content" tip="暂无审批记录" />
      </scroll-view>
    </wd-popup>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import {
  pageCcMine,
  markCcRead,
  taskHistory,
  type WorkflowCc,
  type WorkflowHisTask,
} from '@/api/workflow';

// ---------- 状态映射（与 PC 端 FLOW_STATUS_TAG 同口径） ----------
const STATUS_LABEL: Record<string, string> = {
  '0': '待提交', '1': '审批中', '2': '已通过', '3': '自动完成', '4': '已终止',
  '5': '已作废', '6': '已撤销', '7': '已取回', '8': '已完成', '9': '已退回',
  '10': '已失效', '11': '已拿回', '12': '已重启', '13': '暂存',
};
const STATUS_TAG: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'primary'> = {
  '0': 'info', '1': 'primary', '2': 'success', '3': 'success', '4': 'danger',
  '5': 'info', '6': 'info', '7': 'info', '8': 'success', '9': 'danger',
  '10': 'info', '11': 'info', '12': 'warning', '13': 'warning',
};
function statusLabel(status?: string): string {
  return STATUS_LABEL[status ?? ''] ?? status ?? '-';
}
function statusTagType(status?: string): 'success' | 'danger' | 'warning' | 'info' | 'primary' {
  return STATUS_TAG[status ?? ''] ?? 'info';
}

const SKIP_LABEL: Record<string, string> = {
  PASS: '通过', REJECT: '驳回', NONE: '无动作',
};
const SKIP_TAG: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'primary'> = {
  PASS: 'success', REJECT: 'danger', NONE: 'info',
};
function skipLabel(type?: string): string {
  return SKIP_LABEL[type ?? ''] ?? type ?? '-';
}
function skipTagType(type?: string): 'success' | 'danger' | 'warning' | 'info' | 'primary' {
  return SKIP_TAG[type ?? ''] ?? 'info';
}

// ---------- 列表（readFlag 走后端过滤） ----------
const TABS = [
  { name: 'all', title: '全部' },
  { name: 'unread', title: '未读' },
  { name: 'read', title: '已读' },
];

const activeTab = ref('all');
const keyword = ref('');
const list = ref<WorkflowCc[]>([]);
const pageNum = ref(1);
const pageSize = 10;
const total = ref(0);
const loaded = ref(false);
const finished = computed(() => list.value.length >= total.value);

function readFlagOfTab(): number | undefined {
  if (activeTab.value === 'unread') return 0;
  if (activeTab.value === 'read') return 1;
  return undefined;
}

async function loadList(reset = false): Promise<void> {
  if (reset) {
    pageNum.value = 1;
    list.value = [];
  }
  const res = await pageCcMine({
    pageNum: pageNum.value,
    pageSize,
    flowName: keyword.value || undefined,
    readFlag: readFlagOfTab(),
  });
  const rows = res.list ?? [];
  list.value = pageNum.value === 1 ? rows : [...list.value, ...rows];
  total.value = Number(res.total ?? 0);
  loaded.value = true;
}

function onSearch(): void {
  void loadList(true);
}
function onTabChange(): void {
  void loadList(true);
}

onLoad(() => {
  void loadList(true);
});
onPullDownRefresh(async () => {
  await loadList(true);
  uni.stopPullDownRefresh();
});
onReachBottom(() => {
  if (!finished.value) {
    pageNum.value += 1;
    void loadList();
  }
});

// ---------- 详情：标记已读 + 审批进度 ----------
const detailVisible = ref(false);
const detailRow = ref<WorkflowCc | null>(null);
const historyList = ref<WorkflowHisTask[]>([]);
const historyLoaded = ref(false);

async function openDetail(row: WorkflowCc): Promise<void> {
  detailRow.value = row;
  historyList.value = [];
  historyLoaded.value = false;
  detailVisible.value = true;
  // 未读 → 标记已读（幂等），本地即时刷新
  if (row.readFlag === 0) {
    try {
      await markCcRead(row.id);
      row.readFlag = 1;
    } catch {
      // 已读失败不阻塞详情查看
    }
  }
  try {
    historyList.value = await taskHistory(row.instanceId);
  } finally {
    historyLoaded.value = true;
  }
}
</script>

<style scoped>
.cc-page {
  min-height: 100vh;
  box-sizing: border-box;
  background: #f5f6fa;
  padding-bottom: 64rpx;
}
.list {
  padding: 24rpx;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  margin-bottom: 24rpx;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}
.head-left {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.unread-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #fa3534;
}
.flow-name {
  font-size: 32rpx;
  font-weight: 600;
  color: #2c405a;
}
.card-row {
  display: flex;
  justify-content: space-between;
  padding: 6rpx 0;
}
.card-row .label {
  color: #909399;
  font-size: 26rpx;
}
.card-row .value {
  color: #333;
  font-size: 26rpx;
}
.detail-scroll {
  max-height: 60vh;
}
.detail-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #2c405a;
  margin-bottom: 24rpx;
}
.detail-title.sub {
  font-size: 28rpx;
  margin-top: 24rpx;
}
.detail-summary {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
  color: #606266;
  font-size: 26rpx;
}
.detail-meta {
  display: flex;
  justify-content: space-between;
  font-size: 24rpx;
  color: #909399;
}
.history-item {
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
}
.history-item:last-child {
  border-bottom: none;
}
.history-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 8rpx;
}
.history-node {
  font-weight: 500;
  font-size: 28rpx;
  color: #333;
}
.history-meta {
  display: flex;
  justify-content: space-between;
  font-size: 24rpx;
  color: #909399;
}
.history-time {
  font-size: 22rpx;
}
.history-msg {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #606266;
}
</style>
