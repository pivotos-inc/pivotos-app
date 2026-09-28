<template>
  <view class="approval-page">
    <template v-if="task">
      <!-- 任务信息 -->
      <view class="card">
        <view class="card-title">{{ task.flowName }}</view>
        <view class="card-row">
          <text class="label">当前节点</text>
          <text class="value">{{ task.nodeName ?? '-' }}</text>
        </view>
        <view class="card-row">
          <text class="label">业务ID</text>
          <text class="value">{{ task.businessId ?? '-' }}</text>
        </view>
        <view class="card-row">
          <text class="label">接收时间</text>
          <text class="value">{{ task.createTime ?? '-' }}</text>
        </view>
      </view>

      <!-- 审批历史 -->
      <view class="card">
        <view class="card-title">审批历史</view>
        <template v-if="historyList.length > 0">
          <view v-for="item in historyList" :key="item.id" class="history-item">
            <view class="history-head">
              <text class="history-node">{{ item.nodeName }}</text>
              <wd-tag :type="skipTagType(effType(item))" size="small">
                {{ skipLabel(effType(item)) }}
              </wd-tag>
            </view>
            <view class="history-meta">
              <text>审批人: {{ item.approver ?? '-' }}</text>
              <text class="history-time">{{ item.createTime }}</text>
            </view>
            <text v-if="item.message" class="history-msg">意见: {{ item.message }}</text>
          </view>
        </template>
        <wd-status-tip v-else image="content" tip="暂无审批记录" />
      </view>

      <!-- 操作区 -->
      <view class="action-bar">
        <wd-input
          v-model="message"
          placeholder="审批意见（可选）"
          type="textarea"
          :maxlength="500"
          clearable
        />
        <!-- W1（S113）：退回态任务由发起人重新提交，不提供通过/驳回/加签/减签/转办/委派 -->
        <template v-if="isRejected">
          <view class="action-buttons">
            <wd-button type="primary" block :loading="actionLoading" @click="handleResubmit">重新提交</wd-button>
          </view>
        </template>
        <template v-else>
          <view class="action-buttons">
            <wd-button type="info" block plain @click="openAdvice">AI 审批建议</wd-button>
          </view>
          <view class="action-buttons">
            <wd-button type="error" block :loading="actionLoading" @click="handleReject">驳回</wd-button>
            <wd-button type="primary" block :loading="actionLoading" @click="handlePass">通过</wd-button>
          </view>
          <view class="action-buttons sub">
            <wd-button type="warning" block plain :loading="actionLoading" @click="openAddSignature">加签</wd-button>
            <wd-button type="warning" block plain :loading="actionLoading" @click="openReductionSignature">减签</wd-button>
          </view>
          <view class="action-buttons sub">
            <wd-button type="warning" block plain :loading="actionLoading" @click="openTransfer('transfer')">转办</wd-button>
            <wd-button type="warning" block plain :loading="actionLoading" @click="openTransfer('depute')">委派</wd-button>
          </view>
        </template>
      </view>
    </template>
    <wd-status-tip v-else-if="loaded" image="content" tip="任务不存在或已处理" />

    <!-- AI 审批建议弹窗（S101 A3 移动端接入） -->
    <ApprovalAdvicePopup v-if="task" v-model="adviceVisible" :task-id="task.id" />

    <!-- 加签弹窗（S81） -->
    <wd-popup v-model="addSignVisible" position="bottom" :close-on-click-modal="false" custom-style="border-radius: 24rpx 24rpx 0 0; padding: 32rpx;">
      <view class="addsign-form">
        <view class="addsign-title">加签（追加审批人）</view>
        <wd-input v-model="optionKeyword" placeholder="搜索用户名/昵称" clearable @change="reloadOptions" @clear="reloadOptions" />
        <wd-select-picker
          v-model="addSignUserIds"
          :columns="userOptionColumns"
          type="checkbox"
          label="选择加签人"
          placeholder="请选择加签人"
        />
        <view class="addsign-buttons">
          <wd-button block plain @click="addSignVisible = false">取消</wd-button>
          <wd-button block type="primary" :loading="actionLoading" @click="handleAddSignature">提交</wd-button>
        </view>
      </view>
    </wd-popup>

    <!-- 转办/委派弹窗（S93：单选目标用户；委派语义为代审后回到委派人确认） -->
    <wd-popup v-model="transferVisible" position="bottom" :close-on-click-modal="false" custom-style="border-radius: 24rpx 24rpx 0 0; padding: 32rpx;">
      <view class="addsign-form">
        <view class="addsign-title">{{ transferMode === 'depute' ? '委派（代审后回到您确认）' : '转办（转交给目标用户）' }}</view>
        <wd-input v-model="optionKeyword" placeholder="搜索用户名/昵称" clearable @change="reloadOptions" @clear="reloadOptions" />
        <wd-select-picker
          v-model="transferUserId"
          :columns="userOptionColumns"
          label="选择目标用户"
          placeholder="请选择目标用户"
        />
        <view class="addsign-buttons">
          <wd-button block plain @click="transferVisible = false">取消</wd-button>
          <wd-button block type="primary" :loading="actionLoading" @click="handleTransfer">提交</wd-button>
        </view>
      </view>
    </wd-popup>

    <!-- 减签弹窗（S82：候选为当前待办审批人，引擎护栏不足两人不可减签） -->
    <wd-popup v-model="redSignVisible" position="bottom" :close-on-click-modal="false" custom-style="border-radius: 24rpx 24rpx 0 0; padding: 32rpx;">
      <view class="addsign-form">
        <view class="addsign-title">减签（移除审批人）</view>
        <wd-select-picker
          v-model="redSignUserIds"
          :columns="approverColumns"
          type="checkbox"
          label="选择减签人"
          placeholder="请选择要移除的审批人"
        />
        <view class="addsign-buttons">
          <wd-button block plain @click="redSignVisible = false">取消</wd-button>
          <wd-button block type="primary" :loading="actionLoading" @click="handleReductionSignature">提交</wd-button>
        </view>
      </view>
    </wd-popup>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  pagePendingTasks,
  passTask,
  rejectTask,
  resubmitTask,
  taskHistory,
  userOptions,
  addSignature,
  taskApprovers,
  reductionSignature,
  transferTask,
  deputeTask,
  type WorkflowTask,
  type WorkflowHisTask,
  type UserOption,
} from '@/api/workflow';
import ApprovalAdvicePopup from './ApprovalAdvicePopup.vue';

// ---------- AI 审批建议（S101 A3 移动端接入） ----------
const adviceVisible = ref(false);

function openAdvice(): void {
  adviceVisible.value = true;
}

const task = ref<WorkflowTask>();
const historyList = ref<WorkflowHisTask[]>([]);
const message = ref('');
const actionLoading = ref(false);
const loaded = ref(false);

onLoad(async (query) => {
  const taskId = query?.taskId;
  if (!taskId) {
    loaded.value = true;
    return;
  }
  try {
    // 从待办列表中查找目标任务
    const res = await pagePendingTasks({ pageNum: 1, pageSize: 100 });
    task.value = res.list.find((t) => t.id === taskId);
    if (task.value) {
      historyList.value = await taskHistory(task.value.instanceId);
    }
  } finally {
    loaded.value = true;
  }
});

const SKIP_LABEL: Record<string, string> = {
  PASS: '通过', REJECT: '驳回', NONE: '无动作', TRANSFER: '转办', DEPUTE: '委派',
  ADD_SIGNATURE: '加签', REDUCTION_SIGNATURE: '减签', COUNTERSIGN: '会签', VOTE: '票签', REVOKE: '撤回', TERMINATION: '终止',
};
const SKIP_TAG: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'primary'> = {
  PASS: 'success', REJECT: 'danger', NONE: 'info', TRANSFER: 'warning', DEPUTE: 'warning',
  ADD_SIGNATURE: 'warning', REDUCTION_SIGNATURE: 'warning', COUNTERSIGN: 'primary', VOTE: 'primary',
  REVOKE: 'info', TERMINATION: 'danger',
};

function skipLabel(type?: string): string {
  return SKIP_LABEL[type ?? ''] ?? type ?? '-';
}

function skipTagType(type?: string): 'success' | 'danger' | 'warning' | 'info' | 'primary' {
  return SKIP_TAG[type ?? ''] ?? 'info';
}

/** 转办/委派/加签/会签/票签留痕 skipType=NONE，展示以 cooperateType 优先（2=转办、3=委派、4=会签、5=票签、6=加签、7=减签；S93 补转办/委派，S94 补会签/票签） */
function effType(item: WorkflowHisTask): string | undefined {
  if (item.cooperateType === 2) return 'TRANSFER';
  if (item.cooperateType === 3) return 'DEPUTE';
  if (item.cooperateType === 4) return 'COUNTERSIGN';
  if (item.cooperateType === 5) return 'VOTE';
  if (item.cooperateType === 6) return 'ADD_SIGNATURE';
  if (item.cooperateType === 7) return 'REDUCTION_SIGNATURE';
  return item.skipType;
}

async function handlePass(): Promise<void> {
  if (!task.value) return;
  uni.showModal({
    title: '确认通过',
    content: `确定审批通过「${task.value.flowName}」吗？`,
    success: async (res) => {
      if (!res.confirm) return;
      actionLoading.value = true;
      try {
        await passTask({ taskId: task.value!.id, message: message.value || undefined });
        uni.showToast({ title: '已通过', icon: 'success' });
        setTimeout(() => uni.navigateBack(), 1000);
      } finally {
        actionLoading.value = false;
      }
    },
  });
}

async function handleReject(): Promise<void> {
  if (!task.value) return;
  uni.showModal({
    title: '确认驳回',
    content: `确定驳回「${task.value.flowName}」吗？`,
    success: async (res) => {
      if (!res.confirm) return;
      actionLoading.value = true;
      try {
        await rejectTask({ taskId: task.value!.id, message: message.value || undefined });
        uni.showToast({ title: '已驳回', icon: 'none' });
        setTimeout(() => uni.navigateBack(), 1000);
      } finally {
        actionLoading.value = false;
      }
    },
  });
}

/** W1（S113）：退回态（flow_status=9）任务——由发起人重新提交，非审批态 */
const isRejected = computed(() => task.value?.flowStatus === '9');

async function handleResubmit(): Promise<void> {
  if (!task.value) return;
  uni.showModal({
    title: '确认重新提交',
    content: `确定重新提交「${task.value.flowName}」吗？`,
    success: async (res) => {
      if (!res.confirm) return;
      actionLoading.value = true;
      try {
        await resubmitTask({ taskId: task.value!.id, message: message.value || undefined });
        uni.showToast({ title: '已重新提交', icon: 'success' });
        setTimeout(() => uni.navigateBack(), 1000);
      } finally {
        actionLoading.value = false;
      }
    },
  });
}

// ---------- 加签（S81） ----------
const addSignVisible = ref(false);
const addSignUserIds = ref<string[]>([]);
const options = ref<UserOption[]>([]);
const optionKeyword = ref('');

const userOptionColumns = computed(() => {
  const cols = options.value.map((u) => ({
    value: u.id,
    label: u.nickname ? `${u.nickname}（${u.username ?? u.id}）` : (u.username ?? u.id),
  }));
  // 搜索收窄后已选项可能不在选项中，补占位项保证可回显/可取消
  for (const id of addSignUserIds.value) {
    if (!cols.some((c) => c.value === id)) {
      cols.push({ value: id, label: id });
    }
  }
  return cols;
});

let optionSeq = 0;
async function reloadOptions(): Promise<void> {
  const seq = ++optionSeq;
  const rows = await userOptions(optionKeyword.value || undefined);
  if (seq === optionSeq) {
    options.value = rows;
  }
}

async function openAddSignature(): Promise<void> {
  addSignVisible.value = true;
  if (options.value.length === 0) {
    await reloadOptions();
  }
}

async function handleAddSignature(): Promise<void> {
  if (!task.value) return;
  if (addSignUserIds.value.length === 0) {
    uni.showToast({ title: '请选择加签人', icon: 'none' });
    return;
  }
  actionLoading.value = true;
  try {
    await addSignature({
      taskId: task.value.id,
      userIds: addSignUserIds.value,
      message: message.value || undefined,
    });
    uni.showToast({ title: '加签成功', icon: 'success' });
    addSignVisible.value = false;
    addSignUserIds.value = [];
    historyList.value = await taskHistory(task.value.instanceId);
  } finally {
    actionLoading.value = false;
  }
}

// ---------- 转办/委派（S93） ----------
const transferVisible = ref(false);
const transferMode = ref<'transfer' | 'depute'>('transfer');
const transferUserId = ref('');

async function openTransfer(mode: 'transfer' | 'depute'): Promise<void> {
  transferMode.value = mode;
  transferUserId.value = '';
  transferVisible.value = true;
  if (options.value.length === 0) {
    await reloadOptions();
  }
}

async function handleTransfer(): Promise<void> {
  if (!task.value) return;
  if (!transferUserId.value) {
    uni.showToast({ title: '请选择目标用户', icon: 'none' });
    return;
  }
  actionLoading.value = true;
  try {
    const cmd = { taskId: task.value.id, targetUserId: transferUserId.value, message: message.value || undefined };
    if (transferMode.value === 'depute') {
      await deputeTask(cmd);
    } else {
      await transferTask(cmd);
    }
    uni.showToast({ title: transferMode.value === 'depute' ? '委派成功' : '转办成功', icon: 'success' });
    transferVisible.value = false;
    setTimeout(() => uni.navigateBack(), 1000);
  } finally {
    actionLoading.value = false;
  }
}

// ---------- 减签（S82） ----------
const redSignVisible = ref(false);
const redSignUserIds = ref<string[]>([]);
const approvers = ref<UserOption[]>([]);

/** 减签候选 = 当前待办审批人（后端 /{taskId}/approvers） */
const approverColumns = computed(() =>
  approvers.value.map((u) => ({
    value: u.id,
    label: u.nickname ? `${u.nickname}（${u.username ?? u.id}）` : (u.username ?? u.id),
  })),
);

async function openReductionSignature(): Promise<void> {
  if (!task.value) return;
  redSignUserIds.value = [];
  redSignVisible.value = true;
  approvers.value = await taskApprovers(task.value.id);
}

async function handleReductionSignature(): Promise<void> {
  if (!task.value) return;
  if (redSignUserIds.value.length === 0) {
    uni.showToast({ title: '请选择减签人', icon: 'none' });
    return;
  }
  actionLoading.value = true;
  try {
    await reductionSignature({
      taskId: task.value.id,
      userIds: redSignUserIds.value,
      message: message.value || undefined,
    });
    uni.showToast({ title: '减签成功', icon: 'success' });
    redSignVisible.value = false;
    redSignUserIds.value = [];
    historyList.value = await taskHistory(task.value.instanceId);
  } finally {
    actionLoading.value = false;
  }
}
</script>

<style scoped>
.approval-page {
  min-height: 100vh;
  padding: 24rpx;
  padding-bottom: 420rpx;
  box-sizing: border-box;
  background: #f5f6fa;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  margin-bottom: 24rpx;
}
.card-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #2c405a;
  margin-bottom: 20rpx;
}
.card-row {
  display: flex;
  justify-content: space-between;
  padding: 8rpx 0;
}
.card-row .label {
  color: #909399;
  font-size: 26rpx;
}
.card-row .value {
  color: #333;
  font-size: 26rpx;
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
.action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  padding: 24rpx 32rpx;
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.06);
}
.action-buttons {
  display: flex;
  gap: 24rpx;
  margin-top: 16rpx;
}
.action-buttons.sub {
  margin-top: 12rpx;
}
.addsign-form {
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}
.addsign-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #2c405a;
  margin-bottom: 24rpx;
}
.addsign-buttons {
  display: flex;
  gap: 24rpx;
  margin-top: 32rpx;
}
</style>
