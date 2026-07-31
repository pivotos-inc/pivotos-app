<template>
  <view class="ai-chat-page">
    <!-- 顶部工具条：会话列表入口 + 新建会话 -->
    <view class="toolbar">
      <view class="toolbar-btn" @click="conversationPanelVisible = true">
        <wd-icon name="list" size="32rpx" />
        <text>会话</text>
      </view>
      <text class="toolbar-title">{{ activeTitle || '新的对话' }}</text>
      <view class="toolbar-btn" @click="newConversation">
        <wd-icon name="add" size="32rpx" />
        <text>新建</text>
      </view>
    </view>

    <!-- 消息区 -->
    <scroll-view class="messages" scroll-y :scroll-top="scrollTop" @touchmove.passive="noop">
      <view v-if="messages.length === 0" class="empty">
        <wd-status-tip image="content" tip="开始新的对话吧" />
      </view>
      <view
        v-for="(msg, index) in messages"
        :key="msg.id ?? index"
        class="message"
        :class="`message--${msg.role}`"
      >
        <view class="bubble">
          <text v-if="msg.role === 'assistant' && !msg.content && streaming" class="typing">
            正在思考…
          </text>
          <text v-else user-select>{{ msg.content }}</text>
        </view>
      </view>
      <!-- 底部占位，避免输入区遮挡最后一条 -->
      <view class="messages-bottom" />
    </scroll-view>

    <!-- 输入区：供应商/模型双下拉 + 输入框 + 发送/停止 -->
    <view class="input-bar">
      <view class="selectors">
        <wd-picker
          v-model="providerId"
          :columns="providerColumns"
          use-default-slot
          :disabled="streaming"
          title="选择供应商"
          @confirm="onProviderConfirm"
        >
          <view class="selector">
            <text class="selector-text">{{ providerLabel }}</text>
            <wd-icon name="arrow-down" size="24rpx" />
          </view>
        </wd-picker>
        <wd-picker
          v-model="model"
          :columns="modelColumns"
          use-default-slot
          :disabled="streaming || !providerId"
          :loading="modelsLoading"
          title="选择模型"
        >
          <view class="selector" :class="{ 'selector--disabled': !providerId }">
            <text class="selector-text">{{ modelLabel }}</text>
            <wd-icon name="arrow-down" size="24rpx" />
          </view>
        </wd-picker>
      </view>
      <view class="input-row">
        <input
          v-model="input"
          class="input"
          type="text"
          confirm-type="send"
          :maxlength="4000"
          placeholder="输入问题…"
          @confirm="handleSend"
        />
        <wd-button v-if="streaming" size="small" plain @click="handleStop">停止</wd-button>
        <wd-button v-else size="small" :disabled="!input.trim()" @click="handleSend">发送</wd-button>
      </view>
    </view>

    <!-- 会话列表抽屉 -->
    <wd-popup
      v-model="conversationPanelVisible"
      position="left"
      custom-style="width: 70%; height: 100%;"
    >
      <view class="conv-panel">
        <view class="conv-panel-title">我的会话</view>
        <scroll-view class="conv-list" scroll-y>
          <view
            v-for="item in conversations"
            :key="item.id"
            class="conv-item"
            :class="{ 'conv-item--active': item.id === activeId }"
            @click="switchConversation(item.id)"
          >
            <view class="conv-item-main">
              <text class="conv-item-title">{{ item.title }}</text>
              <text class="conv-item-time">{{ formatTime(item.updateTime) }}</text>
            </view>
            <wd-icon name="delete" size="32rpx" custom-class="conv-item-delete" @click.stop="handleDelete(item)" />
          </view>
          <view v-if="conversations.length === 0" class="conv-empty">暂无会话</view>
        </scroll-view>
      </view>
    </wd-popup>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  deleteConversation,
  listConversations,
  listMessages,
  listProviderModels,
  listProviderOptions,
  streamChat,
  type AiConversation,
  type AiProviderOption,
  type ChatStreamHandle,
} from '@/api/ai';

/** 本地消息（流式追加时 assistant 消息尚无落库 id） */
interface LocalMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
}

// ---------- 会话列表 ----------
const conversations = ref<AiConversation[]>([]);
/** 当前会话 id，空串 = 新会话（首条消息发出后由 meta 事件回填） */
const activeId = ref('');
const messages = ref<LocalMessage[]>([]);
const conversationPanelVisible = ref(false);

const activeTitle = computed(
  () => conversations.value.find((c) => c.id === activeId.value)?.title ?? '',
);

async function loadConversations(): Promise<void> {
  conversations.value = await listConversations().catch(() => conversations.value);
}

async function switchConversation(id: string): Promise<void> {
  conversationPanelVisible.value = false;
  if (streaming.value || id === activeId.value) return;
  activeId.value = id;
  const rows = await listMessages(id);
  messages.value = rows.map((m) => ({ id: m.id, role: m.role, content: m.content }));
  scrollToBottom();
}

function newConversation(): void {
  if (streaming.value) return;
  activeId.value = '';
  messages.value = [];
  conversationPanelVisible.value = false;
}

function handleDelete(row: AiConversation): void {
  uni.showModal({
    title: '删除会话',
    content: `确定删除会话「${row.title}」吗？消息记录将一并删除。`,
    success: async ({ confirm }) => {
      if (!confirm) return;
      await deleteConversation(row.id);
      uni.showToast({ title: '会话已删除', icon: 'none' });
      if (row.id === activeId.value) newConversation();
      await loadConversations();
    },
  });
}

// ---------- 供应商 / 模型选择 ----------
const providers = ref<AiProviderOption[]>([]);
/** 选中供应商 id，空串 = 默认（后端：默认供应商 → 静态配置兜底） */
const providerId = ref('');
const models = ref<string[]>([]);
/** 选中模型，空串 = 供应商默认模型 */
const model = ref('');
const modelsLoading = ref(false);

const providerColumns = computed(() => [
  { value: '', label: '默认供应商' },
  ...providers.value.map((p) => ({ value: p.id, label: p.name })),
]);
const modelColumns = computed(() => [
  { value: '', label: '默认模型' },
  ...models.value.map((m) => ({ value: m, label: m })),
]);
const providerLabel = computed(
  () => providers.value.find((p) => p.id === providerId.value)?.name ?? '默认供应商',
);
const modelLabel = computed(() => model.value || '默认模型');

async function loadProviders(): Promise<void> {
  // 供应商未配置不阻塞对话（走后端兜底链）
  providers.value = await listProviderOptions().catch(() => []);
}

async function onProviderConfirm(): Promise<void> {
  model.value = '';
  models.value = [];
  if (!providerId.value) return;
  modelsLoading.value = true;
  try {
    models.value = await listProviderModels(providerId.value);
    // 供应商默认模型在列表内则预选，否则留空走后端默认
    const fallback = providers.value.find((p) => p.id === providerId.value)?.defaultModel ?? '';
    model.value = models.value.includes(fallback) ? fallback : '';
  } catch {
    /* 拉取失败请求层已 toast，下拉留空可重试 */
  } finally {
    modelsLoading.value = false;
  }
}

// ---------- 流式对话 ----------
const input = ref('');
const streaming = ref(false);
let streamHandle: ChatStreamHandle | null = null;

async function handleSend(): Promise<void> {
  const content = input.value.trim();
  if (!content || streaming.value) return;
  input.value = '';
  messages.value.push({ role: 'user', content });
  messages.value.push({ role: 'assistant', content: '' });
  // 必须从响应式数组取回代理对象再累加：直接改 push 前的原始对象不经过
  // reactive set 陷阱，delta 不触发重渲染，流结束才整段蹦出（S21 根因）
  const assistant = messages.value[messages.value.length - 1]!;
  scrollToBottom();

  streaming.value = true;
  streamHandle = streamChat(
    {
      conversationId: activeId.value || undefined,
      content,
      providerId: providerId.value || undefined,
      model: model.value || undefined,
    },
    {
      onMeta(meta) {
        // 新会话：回填会话 id 并刷新会话列表
        if (!activeId.value) {
          activeId.value = meta.conversationId;
          void loadConversations();
        }
      },
      onDelta(delta) {
        assistant.content += delta;
        scrollToBottom();
      },
      onDone(done) {
        assistant.id = done.messageId;
        // 会话 updateTime 变化，刷新排序
        void loadConversations();
      },
      onError(msg) {
        uni.showToast({ title: msg, icon: 'none', duration: 2500 });
        if (!assistant.content) {
          messages.value.splice(messages.value.indexOf(assistant), 1);
        }
      },
    },
  );
  await streamHandle.done;
  streaming.value = false;
  streamHandle = null;
}

function handleStop(): void {
  streamHandle?.abort();
  streaming.value = false;
}

// ---------- 滚动 ----------
/** scroll-view 只认值变化，递增大数强制滚到底（免去每帧量高度的开销） */
const scrollTop = ref(0);

function scrollToBottom(): void {
  void nextTick(() => {
    scrollTop.value = scrollTop.value >= 9_000_000 ? 1_000_000 : scrollTop.value + 100_000;
  });
}

function noop(): void {
  /* 占位：保持 scroll-view 默认触摸行为 */
}

function formatTime(time?: string): string {
  return time ? time.slice(5, 16) : '';
}

onShow(() => {
  void loadConversations();
  void loadProviders();
});
</script>

<style scoped>
.ai-chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f6fa;
}

/* ---------- 顶部工具条 ---------- */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 24rpx;
  background: #fff;
  border-bottom: 1rpx solid #f0f0f0;
}
.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6rpx;
  font-size: 26rpx;
  color: #4d80f0;
  padding: 8rpx 12rpx;
}
.toolbar-title {
  flex: 1;
  text-align: center;
  font-size: 28rpx;
  font-weight: 600;
  color: #2c405a;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  padding: 0 16rpx;
}

/* ---------- 消息区 ---------- */
.messages {
  flex: 1;
  min-height: 0;
  padding: 24rpx;
  box-sizing: border-box;
}
.empty {
  padding-top: 120rpx;
}
.message {
  display: flex;
  margin-bottom: 24rpx;
}
.message--user {
  justify-content: flex-end;
}
.message--assistant {
  justify-content: flex-start;
}
.bubble {
  max-width: 80%;
  padding: 18rpx 24rpx;
  border-radius: 18rpx;
  font-size: 28rpx;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.message--user .bubble {
  background: #4d80f0;
  color: #fff;
  border-bottom-right-radius: 4rpx;
}
.message--assistant .bubble {
  background: #fff;
  color: #333;
  border-bottom-left-radius: 4rpx;
}
.typing {
  color: #999;
}
.messages-bottom {
  height: 24rpx;
}

/* ---------- 输入区 ---------- */
.input-bar {
  background: #fff;
  border-top: 1rpx solid #f0f0f0;
  padding: 16rpx 24rpx calc(16rpx + constant(safe-area-inset-bottom)) 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}
.selectors {
  display: flex;
  gap: 16rpx;
  margin-bottom: 16rpx;
}
.selector {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx 20rpx;
  background: #f5f6fa;
  border-radius: 24rpx;
  font-size: 24rpx;
  color: #666;
  max-width: 320rpx;
}
.selector--disabled {
  opacity: 0.5;
}
.selector-text {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.input-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.input {
  flex: 1;
  height: 72rpx;
  padding: 0 24rpx;
  background: #f5f6fa;
  border-radius: 36rpx;
  font-size: 28rpx;
}

/* ---------- 会话抽屉 ---------- */
.conv-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24rpx;
  box-sizing: border-box;
}
.conv-panel-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #2c405a;
  padding: 16rpx 0 24rpx;
}
.conv-list {
  flex: 1;
  min-height: 0;
}
.conv-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 16rpx;
  border-radius: 12rpx;
  margin-bottom: 8rpx;
}
.conv-item--active {
  background: #eef3fe;
}
.conv-item-main {
  flex: 1;
  min-width: 0;
  margin-right: 16rpx;
}
.conv-item-title {
  display: block;
  font-size: 28rpx;
  color: #333;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.conv-item-time {
  font-size: 22rpx;
  color: #999;
}
:deep(.conv-item-delete) {
  color: #c0c4cc;
}
.conv-empty {
  padding: 48rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: #999;
}
</style>
