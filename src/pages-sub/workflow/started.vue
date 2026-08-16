<template>
  <view class="started-page">
    <!-- 搜索 + 状态筛选 -->
    <wd-search v-model="keyword" placeholder="按流程名称搜索" hide-cancel @search="onSearch" @clear="onSearch" />
    <wd-tabs v-model="activeTab" @change="onTabChange">
      <wd-tab v-for="tab in TABS" :key="tab.name" :title="tab.title" :name="tab.name" />
    </wd-tabs>

    <!-- 抄送我的入口（S80） -->
    <view class="cc-entry" @click="goCc">
      <text class="cc-entry-text">抄送我的 ›</text>
    </view>

    <!-- 实例列表 -->
    <view v-if="list.length > 0" class="list">
      <view v-for="item in list" :key="item.id" class="card" @click="openHistory(item)">
        <view class="card-head">
          <text class="flow-name">{{ item.flowName ?? '-' }}</text>
          <wd-tag :type="statusTagType(item.flowStatus)" size="small">
            {{ statusLabel(item.flowStatus) }}
          </wd-tag>
        </view>
        <view class="card-row">
          <text class="label">业务名称</text>
          <text class="value">{{ item.businessId || '-' }}</text>
        </view>
        <view class="card-row">
          <text class="label">当前节点</text>
          <text class="value">{{ item.nodeName ?? '-' }}</text>
        </view>
        <view class="card-row">
          <text class="label">发起时间</text>
          <text class="value">{{ item.createTime ?? '-' }}</text>
        </view>
      </view>
      <wd-status-tip v-if="finished && list.length > 0" image="content" tip="没有更多了" />
    </view>
    <wd-status-tip v-else-if="loaded" image="content" tip="暂无发起的流程" />

    <!-- 发起流程悬浮按钮 -->
    <view class="fab" @click="openStart">
      <text class="fab-text">发起流程</text>
    </view>

    <!-- 发起流程弹窗 -->
    <wd-popup v-model="startVisible" position="bottom" :close-on-click-modal="false" custom-style="border-radius: 24rpx 24rpx 0 0; padding: 32rpx;">
      <view class="start-form">
        <view class="start-title">发起流程</view>
        <wd-select-picker
          v-model="startForm.flowCode"
          :columns="definitionOptions"
          label="选择流程"
          placeholder="请选择流程"
        />
        <wd-input v-model="startForm.businessName" label="业务名称" placeholder="请输入业务名称（可选）" clearable />
        <!-- 流程变量（S93）：供条件分支网关使用，如请假天数分档审批 -->
        <view v-for="(row, i) in startVars" :key="i" class="var-row">
          <wd-input v-model="row.key" placeholder="变量名（如 days）" custom-class="var-key" />
          <wd-input v-model="row.value" placeholder="值（如 3）" custom-class="var-value" />
          <view class="var-del" @click="removeStartVar(i)">删除</view>
        </view>
        <wd-button size="small" plain block custom-class="var-add" @click="addStartVar">+ 添加流程变量（可选）</wd-button>
        <view class="start-buttons">
          <wd-button block plain @click="startVisible = false">取消</wd-button>
          <wd-button block type="primary" :loading="startLoading" @click="handleStart">提交</wd-button>
        </view>
      </view>
    </wd-popup>

    <!-- 审批进度弹窗 -->
    <wd-popup v-model="historyVisible" position="bottom" custom-style="border-radius: 24rpx 24rpx 0 0; padding: 32rpx; max-height: 70vh;">
      <scroll-view scroll-y class="history-scroll">
        <view class="start-title">审批进度</view>
        <view v-if="historyRow" class="history-summary">
          <text>流程「{{ historyRow.flowName }}」</text>
          <wd-tag :type="statusTagType(historyRow.flowStatus)" size="small">
            {{ statusLabel(historyRow.flowStatus) }}
          </wd-tag>
        </view>
        <!-- 发起人操作（S81）：仅审批中可催办/撤回 -->
        <view v-if="historyRow && historyRow.flowStatus === '1'" class="history-actions">
          <wd-button size="small" type="primary" plain :loading="urgeLoading" @click="handleUrge">催办</wd-button>
          <wd-button size="small" type="error" plain :loading="revokeLoading" @click="handleRevoke">撤回</wd-button>
        </view>
        <template v-if="historyList.length > 0">
          <view v-for="item in historyList" :key="item.id" class="history-item">
            <view class="history-head">
              <text class="history-node">{{ item.nodeName }}</text>
              <wd-tag :type="skipTagType(effType(item))" size="small">{{ skipLabel(effType(item)) }}</wd-tag>
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
import { computed, reactive, ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import {
  pageMyInstances,
  pageDefinitions,
  startInstance,
  taskHistory,
  urgeInstance,
  revokeInstance,
  type WorkflowInstance,
  type WorkflowDefinition,
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
  PASS: '通过', REJECT: '驳回', NONE: '无动作', TRANSFER: '转办', DEPUTE: '委派',
  ADD_SIGNATURE: '加签', REDUCTION_SIGNATURE: '减签',
};
const SKIP_TAG: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'primary'> = {
  PASS: 'success', REJECT: 'danger', NONE: 'info', TRANSFER: 'warning', DEPUTE: 'warning',
  ADD_SIGNATURE: 'warning', REDUCTION_SIGNATURE: 'warning',
};
function skipLabel(type?: string): string {
  return SKIP_LABEL[type ?? ''] ?? type ?? '-';
}
function skipTagType(type?: string): 'success' | 'danger' | 'warning' | 'info' | 'primary' {
  return SKIP_TAG[type ?? ''] ?? 'info';
}
/** 转办/委派/加签留痕 skipType=NONE，展示以 cooperateType 优先（2=转办、3=委派、6=加签、7=减签，S93 补转办/委派） */
function effType(item: WorkflowHisTask): string | undefined {
  if (item.cooperateType === 2) return 'TRANSFER';
  if (item.cooperateType === 3) return 'DEPUTE';
  if (item.cooperateType === 6) return 'ADD_SIGNATURE';
  if (item.cooperateType === 7) return 'REDUCTION_SIGNATURE';
  return item.skipType;
}

// ---------- 列表 ----------
const TABS = [
  { name: 'all', title: '全部' },
  { name: 'ongoing', title: '审批中' },
  { name: 'finished', title: '已完结' },
];
const ONGOING_STATUS = new Set(['1']);
const FINISHED_STATUS = new Set(['2', '3', '4', '5', '6', '8', '9', '10']);

const activeTab = ref('all');
const keyword = ref('');
const list = ref<WorkflowInstance[]>([]);
const pageNum = ref(1);
const pageSize = 10;
const total = ref(0);
const loaded = ref(false);
const finished = computed(() => list.value.length >= total.value);

async function loadList(reset = false): Promise<void> {
  if (reset) {
    pageNum.value = 1;
    list.value = [];
  }
  const res = await pageMyInstances({
    pageNum: pageNum.value,
    pageSize,
    flowName: keyword.value || undefined,
  });
  const all = res.list ?? [];
  // 客户端按 tab 过滤（后端 page 仅支持 flowName 过滤）
  const filtered = all.filter((i) => {
    if (activeTab.value === 'ongoing') return ONGOING_STATUS.has(i.flowStatus ?? '');
    if (activeTab.value === 'finished') return FINISHED_STATUS.has(i.flowStatus ?? '');
    return true;
  });
  list.value = pageNum.value === 1 ? filtered : [...list.value, ...filtered];
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

/** 跳转抄送我的页（S80） */
function goCc(): void {
  uni.navigateTo({ url: '/pages-sub/workflow/cc' });
}
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

// ---------- 发起流程 ----------
const startVisible = ref(false);
const startLoading = ref(false);
const definitions = ref<WorkflowDefinition[]>([]);
const startForm = reactive({ flowCode: '', businessName: '' });

// 流程变量（S93）：键值对录入，供网关节点条件表达式（如 eq@@days|3）消费
const startVars = ref<{ key: string; value: string }[]>([]);

function addStartVar(): void {
  startVars.value.push({ key: '', value: '' });
}

function removeStartVar(index: number): void {
  startVars.value.splice(index, 1);
}

/** 组装 variable：纯整数转 number（条件比较走 String.valueOf，数字口径更稳） */
function buildStartVariable(): Record<string, string | number> | undefined {
  const variable: Record<string, string | number> = {};
  for (const row of startVars.value) {
    const key = row.key.trim();
    if (!key) continue;
    variable[key] = /^-?\d+$/.test(row.value.trim()) ? Number(row.value.trim()) : row.value.trim();
  }
  return Object.keys(variable).length > 0 ? variable : undefined;
}

const definitionOptions = computed(() =>
  definitions.value
    .filter((d) => d.activityStatus === 1)
    .map((d) => ({ value: d.flowCode, label: d.flowName })),
);

async function openStart(): Promise<void> {
  startVisible.value = true;
  if (definitions.value.length === 0) {
    const res = await pageDefinitions({ pageNum: 1, pageSize: 100, isPublish: 1 });
    definitions.value = res.list ?? [];
  }
}

async function handleStart(): Promise<void> {
  if (!startForm.flowCode) {
    uni.showToast({ title: '请选择流程', icon: 'none' });
    return;
  }
  startLoading.value = true;
  try {
    await startInstance({
      flowCode: startForm.flowCode,
      businessName: startForm.businessName || undefined,
      variable: buildStartVariable(),
    });
    uni.showToast({ title: '发起成功', icon: 'success' });
    startVisible.value = false;
    startForm.flowCode = '';
    startForm.businessName = '';
    startVars.value = [];
    await loadList(true);
  } finally {
    startLoading.value = false;
  }
}

// ---------- 审批进度 ----------
const historyVisible = ref(false);
const historyRow = ref<WorkflowInstance | null>(null);
const historyList = ref<WorkflowHisTask[]>([]);
const historyLoaded = ref(false);

async function openHistory(row: WorkflowInstance): Promise<void> {
  historyRow.value = row;
  historyList.value = [];
  historyLoaded.value = false;
  historyVisible.value = true;
  try {
    historyList.value = await taskHistory(row.id);
  } finally {
    historyLoaded.value = true;
  }
}

// ---------- 催办 / 撤回（S81） ----------
const urgeLoading = ref(false);
const revokeLoading = ref(false);

function handleUrge(): void {
  if (!historyRow.value) return;
  const row = historyRow.value;
  urgeLoading.value = true;
  urgeInstance(row.id)
    .then(() => uni.showToast({ title: '催办成功', icon: 'success' }))
    .catch((e: unknown) => uni.showToast({ title: (e as { msg?: string })?.msg ?? '催办失败', icon: 'none' }))
    .finally(() => {
      urgeLoading.value = false;
    });
}

function handleRevoke(): void {
  if (!historyRow.value) return;
  const row = historyRow.value;
  uni.showModal({
    title: '确认撤回',
    content: `确定撤回「${row.flowName ?? ''}」吗？`,
    success: (res) => {
      if (!res.confirm) return;
      revokeLoading.value = true;
      revokeInstance(row.id)
        .then(async () => {
          uni.showToast({ title: '已撤回', icon: 'success' });
          historyVisible.value = false;
          await loadList(true);
        })
        .catch((e: unknown) => uni.showToast({ title: (e as { msg?: string })?.msg ?? '撤回失败', icon: 'none' }))
        .finally(() => {
          revokeLoading.value = false;
        });
    },
  });
}
</script>

<style scoped>
.started-page {
  min-height: 100vh;
  box-sizing: border-box;
  background: #f5f6fa;
  padding-bottom: 160rpx;
}
.cc-entry {
  display: flex;
  justify-content: flex-end;
  padding: 16rpx 24rpx 0;
}
.cc-entry-text {
  font-size: 26rpx;
  color: #4d80f0;
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
.fab {
  position: fixed;
  right: 32rpx;
  bottom: calc(64rpx + env(safe-area-inset-bottom));
  background: #4d80f0;
  color: #fff;
  border-radius: 44rpx;
  padding: 20rpx 40rpx;
  box-shadow: 0 8rpx 24rpx rgba(77, 128, 240, 0.35);
}
.fab-text {
  font-size: 28rpx;
}
.start-form {
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}
.start-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #2c405a;
  margin-bottom: 24rpx;
}
.var-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 8rpx 0;
}
.var-key {
  flex: 2;
}
.var-value {
  flex: 3;
}
.var-del {
  font-size: 26rpx;
  color: #f56c6c;
  padding: 0 12rpx;
}
.var-add {
  margin: 8rpx 0 16rpx;
}
.start-buttons {
  display: flex;
  gap: 24rpx;
  margin-top: 32rpx;
}
.history-scroll {
  max-height: 60vh;
}
.history-summary {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
  color: #606266;
  font-size: 26rpx;
}
.history-actions {
  display: flex;
  gap: 16rpx;
  margin-bottom: 20rpx;
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
