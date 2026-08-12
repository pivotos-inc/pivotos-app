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
              <wd-tag :type="skipTagType(item.skipType)" size="small">
                {{ skipLabel(item.skipType) }}
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
        <view class="action-buttons">
          <wd-button type="error" block :loading="actionLoading" @click="handleReject">驳回</wd-button>
          <wd-button type="primary" block :loading="actionLoading" @click="handlePass">通过</wd-button>
        </view>
      </view>
    </template>
    <wd-status-tip v-else-if="loaded" image="content" tip="任务不存在或已处理" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  pagePendingTasks,
  passTask,
  rejectTask,
  taskHistory,
  type WorkflowTask,
  type WorkflowHisTask,
} from '@/api/workflow';

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
  pass: '通过', reject: '驳回', transfer: '转办', depute: '委派', revoke: '撤回', termination: '终止',
};
const SKIP_TAG: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'primary'> = {
  pass: 'success', reject: 'danger', transfer: 'warning', depute: 'warning', revoke: 'info', termination: 'danger',
};

function skipLabel(type?: string): string {
  return SKIP_LABEL[type ?? ''] ?? type ?? '-';
}

function skipTagType(type?: string): 'success' | 'danger' | 'warning' | 'info' | 'primary' {
  return SKIP_TAG[type ?? ''] ?? 'info';
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
</script>

<style scoped>
.approval-page {
  min-height: 100vh;
  padding: 24rpx;
  padding-bottom: 320rpx;
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
</style>
