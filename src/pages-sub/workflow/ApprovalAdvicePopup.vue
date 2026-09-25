<template>
  <!-- AI 审批建议弹窗（S101 A3 移动端接入）：知识库可选 + SSE 流式渲染结构化建议 -->
  <wd-popup
    v-model="visible"
    position="bottom"
    :close-on-click-modal="false"
    custom-style="border-radius: 24rpx 24rpx 0 0; padding: 32rpx;"
    @close="handleClose"
  >
    <view class="advice-panel">
      <view class="advice-title">AI 审批建议</view>

      <view class="advice-disclaimer">⚠ {{ disclaimer }}</view>

      <view class="advice-toolbar">
        <wd-select-picker
          v-model="kbId"
          :columns="kbColumns"
          label="制度知识库"
          placeholder="默认策略（首个启用库）"
          :disabled="streaming"
        />
        <wd-button block type="primary" :loading="streaming" @click="generate">
          {{ hasAdvice ? '重新生成' : '生成建议' }}
        </wd-button>
      </view>

      <scroll-view scroll-y class="advice-content">
        <wd-status-tip v-if="loading" image="content" tip="加载中…" />

        <template v-else-if="streaming">
          <view class="advice-section">生成中…</view>
          <text class="advice-stream">{{ streamText || '正在聚合审批上下文…' }}</text>
        </template>

        <view v-else-if="errorMsg" class="advice-error">{{ errorMsg }}</view>

        <template v-else-if="conclusion">
          <view class="advice-section">
            <text>结论</text>
            <wd-tag :type="conclusionTag" custom-style="margin-left: 12rpx;">{{ conclusionLabel }}</wd-tag>
          </view>
          <text class="advice-reason">{{ reason || '（无理由说明）' }}</text>
          <template v-if="references.length > 0">
            <view class="advice-section">制度依据</view>
            <view v-for="(ref, i) in references" :key="ref.chunkId ?? i" class="advice-ref">
              <view class="advice-ref-name">[{{ i + 1 }}] {{ ref.fileName ?? '未知来源' }}</view>
              <text class="advice-ref-quote">{{ ref.quote }}</text>
            </view>
          </template>
          <view v-else class="advice-no-ref">未检索到相关制度依据</view>
          <view v-if="echoTime" class="advice-time">最近生成于 {{ echoTime }}</view>
        </template>

        <wd-status-tip v-else image="content" tip="点击「生成建议」获取 AI 参考结论" />
      </scroll-view>
    </view>
  </wd-popup>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  latestApprovalAdvice,
  listKbOptions,
  streamApprovalAdvice,
  type ApprovalAdvice,
  type ApprovalAdviceReference,
  type ChatStreamHandle,
} from '@/api/ai';

const props = defineProps<{ modelValue: boolean; taskId: string }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

/** 免责声明兜底文案（meta/done 帧携带为准，帧未到先用静态文案） */
const DISCLAIMER_FALLBACK = 'AI 建议仅供参考，审批责任仍归审批人';

// ---------- 知识库下拉 ----------
const kbId = ref('');
const kbColumns = ref<{ value: string; label: string }[]>([]);

async function loadKbOptions(): Promise<void> {
  const options = await listKbOptions().catch(() => []);
  kbColumns.value = [
    { value: '', label: '默认策略（首个启用库）' },
    ...options.map((o) => ({ value: o.id, label: o.name })),
  ];
}

// ---------- 建议状态 ----------
const loading = ref(false);
const streaming = ref(false);
const disclaimer = ref(DISCLAIMER_FALLBACK);
const streamText = ref('');
const conclusion = ref('');
const reason = ref('');
const references = ref<ApprovalAdviceReference[]>([]);
const echoTime = ref('');
const errorMsg = ref('');
let streamHandle: ChatStreamHandle | null = null;

const CONCLUSION_LABEL: Record<string, string> = {
  approve: '建议通过',
  reject: '建议驳回',
  need_info: '需补充材料',
};
const CONCLUSION_TAG: Record<string, 'success' | 'danger' | 'warning' | 'primary'> = {
  approve: 'success',
  reject: 'danger',
  need_info: 'warning',
};

const conclusionLabel = computed(() => CONCLUSION_LABEL[conclusion.value] ?? conclusion.value);
const conclusionTag = computed(() => CONCLUSION_TAG[conclusion.value] ?? 'primary');
const hasAdvice = computed(() => !!conclusion.value);

/** 打开弹窗：复位状态 → 并行加载知识库选项与最近一条建议回显 */
watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    resetState();
    void loadKbOptions();
    loading.value = true;
    try {
      const latest = await latestApprovalAdvice(props.taskId);
      if (latest) applyAdvice(latest);
    } catch {
      /* 回显失败不阻塞生成入口 */
    } finally {
      loading.value = false;
    }
  },
);

function resetState(): void {
  streamHandle?.abort();
  streamHandle = null;
  loading.value = false;
  streaming.value = false;
  disclaimer.value = DISCLAIMER_FALLBACK;
  streamText.value = '';
  conclusion.value = '';
  reason.value = '';
  references.value = [];
  echoTime.value = '';
  errorMsg.value = '';
}

/** 结构化建议上屏（回显与 done 帧共用） */
function applyAdvice(advice: ApprovalAdvice | { conclusion?: string; reason?: string; references?: ApprovalAdviceReference[] }): void {
  conclusion.value = advice.conclusion ?? '';
  reason.value = advice.reason ?? '';
  references.value = advice.references ?? [];
  echoTime.value = 'createTime' in advice ? (advice.createTime ?? '') : '';
}

/** 生成/重新生成：SSE 流式渲染（meta → delta* → done） */
function generate(): void {
  streamHandle?.abort();
  streaming.value = true;
  streamText.value = '';
  conclusion.value = '';
  reason.value = '';
  references.value = [];
  echoTime.value = '';
  errorMsg.value = '';
  streamHandle = streamApprovalAdvice(
    { taskId: props.taskId, kbId: kbId.value || undefined },
    {
      onMeta: (meta) => {
        if (meta.disclaimer) disclaimer.value = meta.disclaimer;
      },
      onDelta: (content) => {
        streamText.value += content;
      },
      onDone: (done) => {
        if (done.disclaimer) disclaimer.value = done.disclaimer;
        applyAdvice(done);
        streaming.value = false;
      },
      onError: (msg) => {
        errorMsg.value = msg;
        streaming.value = false;
      },
    },
  );
}

function handleClose(): void {
  streamHandle?.abort();
  streamHandle = null;
  streaming.value = false;
}
</script>

<style scoped>
.advice-panel {
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}
.advice-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #2c405a;
  margin-bottom: 16rpx;
}
.advice-disclaimer {
  font-size: 24rpx;
  color: #e6a23c;
  background: #fdf6ec;
  border-radius: 8rpx;
  padding: 12rpx 16rpx;
  margin-bottom: 16rpx;
}
.advice-toolbar {
  margin-bottom: 16rpx;
}
.advice-content {
  max-height: 56vh;
}
.advice-section {
  font-size: 28rpx;
  font-weight: 600;
  color: #2c405a;
  margin: 16rpx 0 12rpx;
  display: flex;
  align-items: center;
}
.advice-stream {
  display: block;
  font-size: 26rpx;
  color: #606266;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
  background: #f5f6fa;
  border-radius: 12rpx;
  padding: 20rpx;
}
.advice-reason {
  display: block;
  font-size: 28rpx;
  color: #333;
  line-height: 1.8;
  white-space: pre-wrap;
}
.advice-ref {
  border-left: 6rpx solid #a3c8f0;
  background: #f8f9fb;
  border-radius: 0 8rpx 8rpx 0;
  padding: 12rpx 16rpx;
  margin-bottom: 12rpx;
}
.advice-ref-name {
  font-size: 26rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 4rpx;
}
.advice-ref-quote {
  font-size: 24rpx;
  color: #909399;
  line-height: 1.6;
}
.advice-no-ref,
.advice-error,
.advice-time {
  font-size: 24rpx;
  color: #909399;
  text-align: center;
  padding: 24rpx 0;
}
.advice-error {
  color: #f56c6c;
}
.advice-time {
  text-align: right;
  padding: 8rpx 0 0;
}
</style>
