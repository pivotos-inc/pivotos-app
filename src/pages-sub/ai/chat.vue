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
        <!-- S75：改写/路由提示（互斥，与 PC 同口径） -->
        <view v-if="msg.role === 'assistant' && (msg.kbRoutedOut || msg.rewrittenQuery)" class="rag-hint">
          <text v-if="msg.kbRoutedOut">本轮未走知识库检索，直接由模型回答</text>
          <text v-else>检索词已智能改写：{{ msg.rewrittenQuery }}</text>
        </view>
        <view class="bubble">
          <text v-if="msg.role === 'assistant' && !msg.content && streaming" class="typing">
            正在思考…
          </text>
          <rich-text v-else-if="msg.role === 'assistant'" class="md" :nodes="msg.html || ''" />
          <text v-else user-select>{{ msg.content }}</text>
          <text v-if="showCursor(msg, index)" class="cursor">▍</text>
        </view>
        <!-- S75：引用来源块（默认收起，展开看全部条目；content 后端已截 200 字） -->
        <view v-if="msg.role === 'assistant' && msg.references?.length" class="refs">
          <view class="refs-summary" @click="msg.refsOpen = !msg.refsOpen">
            <wd-icon name="link" size="24rpx" />
            <text>引用来源（{{ msg.references.length }}）</text>
            <wd-icon :name="msg.refsOpen ? 'arrow-up' : 'arrow-down'" size="24rpx" />
          </view>
          <view v-if="msg.refsOpen" class="refs-list">
            <view v-for="(ref, refIdx) in msg.references" :key="refIdx" class="ref-item">
              <view class="ref-head">
                <text class="ref-index">[{{ refIdx + 1 }}]</text>
                <text class="ref-file">{{ ref.fileName || '未知文件' }}</text>
                <text v-if="ref.score != null" class="ref-score">{{ ref.score.toFixed(3) }}</text>
              </view>
              <text v-if="ref.kbName" class="ref-kb">知识库：{{ ref.kbName }}</text>
              <text v-if="ref.content" class="ref-content" user-select>{{ ref.content }}</text>
            </view>
          </view>
        </view>
      </view>
      <!-- 底部占位，避免输入区遮挡最后一条 -->
      <view class="messages-bottom" />
    </scroll-view>

    <!-- 输入区：知识库 chip 横滑多选 + 供应商/模型双下拉 + 输入框 + 发送/停止 -->
    <view class="input-bar">
      <!-- S75：知识库多选（chip 自绘，无知识库时隐藏不阻塞对话） -->
      <scroll-view v-if="kbOptions.length > 0" class="kb-row" scroll-x>
        <view class="kb-row-inner">
          <view
            v-for="kb in kbOptions"
            :key="kb.id"
            class="kb-chip"
            :class="{ 'kb-chip--active': selectedKbIds.includes(kb.id), 'kb-chip--disabled': streaming }"
            @click="toggleKb(kb.id)"
          >
            <text>{{ kb.name }}</text>
          </view>
        </view>
      </scroll-view>
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
            <wd-icon name="edit-outline" size="32rpx" custom-class="conv-item-action" @click.stop="openRename(item)" />
            <wd-icon name="delete" size="32rpx" custom-class="conv-item-delete" @click.stop="handleDelete(item)" />
          </view>
          <view v-if="conversations.length === 0" class="conv-empty">暂无会话</view>
        </scroll-view>
      </view>
    </wd-popup>

    <!-- 重命名弹窗（uni.showModal 的 editable 在 H5 兼容性不稳，自绘弹窗三端一致） -->
    <wd-popup
      v-model="renameVisible"
      position="center"
      custom-style="width: 80%; border-radius: 16rpx; padding: 32rpx; box-sizing: border-box;"
    >
      <view class="rename-title">重命名会话</view>
      <input
        v-model="renameValue"
        class="rename-input"
        type="text"
        :maxlength="128"
        placeholder="请输入会话标题"
        focus
        @confirm="confirmRename"
      />
      <view class="rename-actions">
        <wd-button size="small" plain @click="renameVisible = false">取消</wd-button>
        <wd-button size="small" :disabled="!renameValue.trim()" @click="confirmRename">确定</wd-button>
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
  listKbOptions,
  listMessages,
  listProviderModels,
  listProviderOptions,
  renameConversation,
  streamChat,
  type AiChatReference,
  type AiConversation,
  type AiKbOption,
  type AiProviderOption,
  type ChatStreamHandle,
} from '@/api/ai';
import { renderMarkdown } from '@/utils/markdown';

/** 本地消息（流式追加时 assistant 消息尚无落库 id；assistant 带预渲染的 markdown HTML） */
interface LocalMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  /** assistant 消息的 rich-text nodes（renderMarkdown 产物，XSS 安全） */
  html?: string;
  /** 引用来源（S75：done 事件送达或历史回放） */
  references?: AiChatReference[];
  /** 引用块展开态（默认收起） */
  refsOpen?: boolean;
  /** 查询改写后的实际检索词（S68，互斥提示用） */
  rewrittenQuery?: string;
  /** 意图路由出局：本轮未走知识库检索（S69） */
  kbRoutedOut?: boolean;
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
  messages.value = rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    html: m.role === 'assistant' ? renderMarkdown(m.content) : undefined,
    // S75：历史消息 references 回放（旧消息无引用属正常）
    references: m.references?.length ? m.references : undefined,
  }));
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
  // 展示序：当前供应商最近使用置顶（recentVersion 驱动记录后即时重排）
  ...(void recentVersion.value, pinRecentModels(providerId.value, models.value)).map((m) => ({ value: m, label: m })),
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

// ---------- 常用模型置顶（uni storage 按供应商各记最近 5 个，S45 ④口径 A） ----------
const RECENT_MODELS_KEY = 'ai-chat-recent-models';
const RECENT_MODELS_MAX = 5;
/** 常用记录的响应式版本号：storage 写入不自知，记录后 +1 驱动 modelColumns 重算 */
const recentVersion = ref(0);

type RecentModelsMap = Record<string, string[]>;

function loadRecentModels(): RecentModelsMap {
  try {
    return (uni.getStorageSync(RECENT_MODELS_KEY) || {}) as RecentModelsMap;
  } catch {
    return {};
  }
}

/** 本次对话实际使用的模型落记录（仅显式选择了供应商+模型才记，空模型=默认无置顶意义） */
function recordRecentModel(): void {
  if (!providerId.value || !model.value) return;
  const map = loadRecentModels();
  map[providerId.value] = [
    model.value,
    ...(map[providerId.value] ?? []).filter((m) => m !== model.value),
  ].slice(0, RECENT_MODELS_MAX);
  uni.setStorageSync(RECENT_MODELS_KEY, map);
  recentVersion.value += 1;
}

/** 常用置顶：当前供应商最近使用的模型（按新近度）排前，其余保持原顺序 */
function pinRecentModels(providerKey: string, all: string[]): string[] {
  const recent = (loadRecentModels()[providerKey] ?? []).filter((m) => all.includes(m));
  return [...recent, ...all.filter((m) => !recent.includes(m))];
}

// ---------- 知识库多选（S75：RAG 检索范围，与 PC 同契约） ----------
const kbOptions = ref<AiKbOption[]>([]);
/** 选中知识库 id 列表，空 = 不启用 RAG */
const selectedKbIds = ref<string[]>([]);

async function loadKbOptions(): Promise<void> {
  // 未配置知识库不阻塞对话（silent，入口自动隐藏）
  const options = await listKbOptions().catch(() => []);
  kbOptions.value = options;
  // 已选知识库被删除/禁用时剔除
  selectedKbIds.value = selectedKbIds.value.filter((id) => options.some((o) => o.id === id));
}

function toggleKb(id: string): void {
  if (streaming.value) return;
  const idx = selectedKbIds.value.indexOf(id);
  if (idx >= 0) selectedKbIds.value.splice(idx, 1);
  else selectedKbIds.value.push(id);
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
      kbIds: selectedKbIds.value.length > 0 ? selectedKbIds.value : undefined,
    },
    {
      onMeta(meta) {
        // 新会话：回填会话 id 并刷新会话列表
        if (!activeId.value) {
          activeId.value = meta.conversationId;
          void loadConversations();
        }
        // S75：改写/路由提示（互斥，与 PC 同口径）
        if (meta.kbRoutedOut) {
          assistant.kbRoutedOut = true;
        } else if (meta.rewrittenQuery) {
          assistant.rewrittenQuery = meta.rewrittenQuery;
        }
      },
      onDelta(delta) {
        assistant.content += delta;
        // 每个 delta 重渲染一次 HTML（增量的是字符串，rich-text 整棵替换，不断流）
        assistant.html = renderMarkdown(assistant.content);
        scrollToBottom();
      },
      onDone(done) {
        assistant.id = done.messageId;
        // S75：引用来源随末帧送达（sse.ts 已有 flush 兜底，不会丢帧）
        if (done.references?.length) {
          assistant.references = done.references;
        }
        // 本次实际选用的模型计入「常用」（S45 ④）
        recordRecentModel();
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

/** 打字机光标：仅流式中的最后一条 assistant 消息显示（流结束 streaming=false 自动消除） */
function showCursor(msg: LocalMessage, index: number): boolean {
  return streaming.value && msg.role === 'assistant' && index === messages.value.length - 1;
}

// ---------- 会话重命名 ----------
const renameVisible = ref(false);
const renameValue = ref('');
/** 重命名目标（弹窗打开时快照，确认时据此提交） */
const renameTarget = ref<AiConversation | null>(null);

function openRename(item: AiConversation): void {
  renameTarget.value = item;
  renameValue.value = item.title;
  renameVisible.value = true;
}

async function confirmRename(): Promise<void> {
  const title = renameValue.value.trim();
  const target = renameTarget.value;
  if (!title || !target) return;
  if (title.length > 128) {
    uni.showToast({ title: '标题最长 128 字符', icon: 'none' });
    return;
  }
  renameVisible.value = false;
  if (title === target.title) return;
  await renameConversation(target.id, title);
  target.title = title;
  uni.showToast({ title: '已重命名', icon: 'none' });
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
  void loadKbOptions();
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

/* 打字机光标：流式中闪烁，流结束随 streaming=false 移除 */
.cursor {
  color: #4d80f0;
  animation: cursor-blink 1s step-end infinite;
}
@keyframes cursor-blink {
  50% {
    opacity: 0;
  }
}

/* assistant markdown（rich-text 内的标签样式只能走全局/属性选择器，scoped 下用 :deep） */
.md {
  display: block;
  /* 父级气泡沿用旧纯文本样式的 pre-wrap，markdown 排版需还原 */
  white-space: normal;
}
:deep(.md h1),
:deep(.md h2),
:deep(.md h3),
:deep(.md h4) {
  margin: 16rpx 0 8rpx;
  line-height: 1.4;
}
:deep(.md p) {
  margin: 0 0 12rpx;
}
:deep(.md ul),
:deep(.md ol) {
  margin: 8rpx 0;
  padding-left: 40rpx;
}
:deep(.md code) {
  padding: 2rpx 8rpx;
  border-radius: 6rpx;
  background: #f2f3f5;
  font-size: 24rpx;
}
:deep(.md pre) {
  margin: 12rpx 0;
  padding: 20rpx;
  border-radius: 12rpx;
  background: #282c34;
  white-space: pre;
  overflow-x: auto;
}
:deep(.md pre code) {
  padding: 0;
  background: transparent;
  color: #e5e7eb;
  font-size: 24rpx;
}
:deep(.md table) {
  margin: 12rpx 0;
  border-collapse: collapse;
  font-size: 24rpx;
}
:deep(.md th),
:deep(.md td) {
  padding: 8rpx 16rpx;
  border: 1rpx solid #ebedf0;
}
:deep(.md th) {
  background: #f5f6fa;
}
:deep(.md blockquote) {
  margin: 12rpx 0;
  padding: 8rpx 20rpx;
  border-left: 6rpx solid #dcdfe6;
  color: #666;
}
.messages-bottom {
  height: 24rpx;
}

/* ---------- S75：改写/路由提示 ---------- */
.rag-hint {
  width: 100%;
  margin-bottom: 8rpx;
  font-size: 22rpx;
  color: #909399;
}

/* ---------- S75：引用来源块 ---------- */
.refs {
  width: 100%;
  margin-top: 8rpx;
  background: #fff;
  border-radius: 12rpx;
  padding: 12rpx 20rpx;
  font-size: 24rpx;
}
.refs-summary {
  display: flex;
  align-items: center;
  gap: 8rpx;
  color: #4d80f0;
}
.refs-list {
  margin-top: 12rpx;
}
.ref-item {
  padding: 12rpx 0;
  border-top: 1rpx solid #f0f0f0;
}
.ref-head {
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.ref-index {
  color: #4d80f0;
  font-weight: 600;
}
.ref-file {
  flex: 1;
  color: #333;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ref-score {
  color: #999;
  font-size: 22rpx;
}
.ref-kb {
  display: block;
  margin-top: 4rpx;
  color: #909399;
  font-size: 22rpx;
}
.ref-content {
  display: block;
  margin-top: 8rpx;
  color: #666;
  line-height: 1.6;
}

/* ---------- S75：知识库 chip 横滑多选 ---------- */
.kb-row {
  margin-bottom: 12rpx;
  white-space: nowrap;
}
.kb-row-inner {
  display: inline-flex;
  gap: 12rpx;
  padding: 4rpx 0;
}
.kb-chip {
  display: inline-flex;
  align-items: center;
  padding: 6rpx 20rpx;
  background: #f5f6fa;
  border: 1rpx solid transparent;
  border-radius: 24rpx;
  font-size: 24rpx;
  color: #666;
}
.kb-chip--active {
  background: #eef3fe;
  border-color: #4d80f0;
  color: #4d80f0;
}
.kb-chip--disabled {
  opacity: 0.5;
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
:deep(.conv-item-action) {
  color: #c0c4cc;
  margin-right: 16rpx;
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

/* ---------- 重命名弹窗 ---------- */
.rename-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #2c405a;
  margin-bottom: 24rpx;
}
.rename-input {
  height: 72rpx;
  padding: 0 24rpx;
  background: #f5f6fa;
  border-radius: 12rpx;
  font-size: 28rpx;
  box-sizing: border-box;
}
.rename-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  margin-top: 24rpx;
}
</style>
