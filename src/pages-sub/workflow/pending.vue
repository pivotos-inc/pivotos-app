<template>
  <view class="pending-page">
    <wd-search v-model="keyword" placeholder="按流程名称搜索" hide-cancel @search="onSearch" @clear="onSearch" />

    <!-- 待办列表 -->
    <view v-if="list.length > 0" class="list">
      <view v-for="item in list" :key="item.id" class="card" @click="goApproval(item)">
        <view class="card-head">
          <text class="flow-name">{{ item.flowName ?? '-' }}</text>
          <wd-tag type="primary" size="small">待审批</wd-tag>
        </view>
        <view class="card-row">
          <text class="label">当前节点</text>
          <text class="value">{{ item.nodeName ?? '-' }}</text>
        </view>
        <view class="card-row">
          <text class="label">业务名称</text>
          <text class="value">{{ item.businessId || '-' }}</text>
        </view>
        <view class="card-row">
          <text class="label">接收时间</text>
          <text class="value">{{ item.createTime ?? '-' }}</text>
        </view>
      </view>
      <wd-status-tip v-if="finished && list.length > 0" image="content" tip="没有更多了" />
    </view>
    <wd-status-tip v-else-if="loaded" image="content" tip="暂无待办任务" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import { pagePendingTasks, type WorkflowTask } from '@/api/workflow';

const keyword = ref('');
const list = ref<WorkflowTask[]>([]);
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
  const res = await pagePendingTasks({
    pageNum: pageNum.value,
    pageSize,
    flowName: keyword.value || undefined,
  });
  const rows = res.list ?? [];
  list.value = pageNum.value === 1 ? rows : [...list.value, ...rows];
  total.value = Number(res.total ?? 0);
  loaded.value = true;
}

function onSearch(): void {
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

function goApproval(item: WorkflowTask): void {
  uni.navigateTo({ url: `/pages-sub/workflow/approval?taskId=${item.id}` });
}
</script>

<style scoped>
.pending-page {
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
</style>
