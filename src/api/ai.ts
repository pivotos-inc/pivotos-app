/**
 * AI 域 API（plugin-ai /ai/*，三账号体系通用，登录即可）
 * 类型与 @pivotos/types ai.ts / 后端 VO 对齐（后端 fastjson2 已做 Long→String）。
 *
 * 流式对话跨端策略（S22 评估结论，详见《05-踩坑记录/S22》）：
 * - H5：fetch + ReadableStream 手动分帧（同 PC 端 chat.ts；EventSource 带不了
 *   Authorization 头且不支持 POST），开发走 5174 vite 代理相对路径。
 * - 小程序/App：uni.request enableChunked 分块传输 + onChunkReceived 回调，
 *   零后端改动复用同一 SSE 端点；chunk 为 ArrayBuffer，经增量 UTF-8 解码后
 *   喂入同一帧解析器（微信基础库 ≥2.20.2；App 端同分支，真机验证列入遗留）。
 */

import { get, del, put, API_BASE_URL, type R } from '@/utils/request';
import { getToken } from '@/utils/auth';
import { createSseFrameParser, createUtf8ChunkDecoder, type SseFrame } from '@/utils/sse';

/* ================= 类型 ================= */

/** AI 会话（对齐 ConversationVO） */
export interface AiConversation {
  id: string;
  title: string;
  model?: string;
  createTime?: string;
  updateTime?: string;
}

/** AI 对话消息（对齐 ChatMessageVO；references 为 S68 持久化的引用列表，历史回放用） */
export interface AiChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  /** 引用来源（assistant 消息，可能为空数组） */
  references?: AiChatReference[];
  createTime?: string;
}

/** 引用来源（对齐 ChatReferenceVO，S68 溯源契约） */
export interface AiChatReference {
  kbId?: string;
  kbName?: string;
  docId?: string;
  chunkId?: string;
  fileName?: string;
  /** 命中文本块（后端截取前 200 字） */
  content?: string;
  score?: number;
}

/** 知识库下拉选项（对齐 KbSimpleOptionVO） */
export interface AiKbOption {
  id: string;
  name: string;
  /** 查询改写开关（S68） */
  queryRewrite?: boolean;
}

/** 对话请求体（conversationId 为空 = 新建会话） */
export interface AiChatSendBody {
  conversationId?: string;
  content: string;
  /** 供应商 id（空 = 默认供应商 → 静态配置兜底） */
  providerId?: string;
  /** 模型名（空 = 供应商默认模型） */
  model?: string;
  /** 选中知识库 id 列表（S75：RAG 检索范围，空 = 不启用 RAG） */
  kbIds?: string[];
}

/** SSE meta 事件载荷 */
export interface AiChatStreamMeta {
  conversationId: string;
  userMessageId: string;
  title: string;
  /** 查询改写后的实际检索词（S68，未改写时不携带） */
  rewrittenQuery?: string;
  /** 意图路由出局：本轮未走知识库检索（S69） */
  kbRoutedOut?: boolean;
}

/** SSE done 事件载荷 */
export interface AiChatStreamDone {
  conversationId: string;
  messageId: string;
  /** 引用来源（S68，随末帧送达；移动端 sse.ts 已有 flush 兜底） */
  references?: AiChatReference[];
}

/** 供应商下拉选项（对齐 ProviderOptionVO） */
export interface AiProviderOption {
  id: string;
  name: string;
  defaultModel?: string;
}

/* ================= 会话 / 消息 CRUD ================= */

/** 我的会话列表（按最近活跃倒序） */
export function listConversations(): Promise<AiConversation[]> {
  return get<AiConversation[]>('/ai/conversation/list');
}

/** 会话内消息历史（时间正序） */
export function listMessages(conversationId: string): Promise<AiChatMessage[]> {
  return get<AiChatMessage[]>(`/ai/conversation/${conversationId}/messages`);
}

/** 删除会话（连带消息） */
export function deleteConversation(conversationId: string): Promise<void> {
  return del<void>(`/ai/conversation/${conversationId}`);
}

/** 重命名会话（PUT body {title}，后端校验非空且 ≤128） */
export function renameConversation(conversationId: string, title: string): Promise<void> {
  return put<void>(`/ai/conversation/${conversationId}`, { title });
}

/* ================= 供应商 / 模型下拉 ================= */

/** 启用供应商选项（未配置供应商不阻塞对话，静默失败） */
export function listProviderOptions(): Promise<AiProviderOption[]> {
  return get<AiProviderOption[]>('/ai/provider/options', undefined, { silent: true });
}

/** 供应商可用模型（后端动态查 /models，5 分钟缓存） */
export function listProviderModels(providerId: string): Promise<string[]> {
  return get<string[]>(`/ai/provider/${providerId}/models`);
}

/** 知识库下拉选项（对话页 RAG 选择用；kb 插件未部署时返回空数组，S75） */
export function listKbOptions(): Promise<AiKbOption[]> {
  return get<AiKbOption[]>('/ai/chat/kb-options', undefined, { silent: true });
}

/* ================= 流式对话 ================= */

/** SSE 流式回调（事件序列 meta → delta* → done，异常 error） */
export interface ChatStreamCallbacks {
  onMeta?: (meta: AiChatStreamMeta) => void;
  onDelta?: (content: string) => void;
  onDone?: (done: AiChatStreamDone) => void;
  onError?: (msg: string) => void;
}

/** 流式请求句柄（done 在流结束后 resolve，错误统一走 onError 不 reject） */
export interface ChatStreamHandle {
  /** 用户主动停止（中断连接，已生成内容保留） */
  abort: () => void;
  done: Promise<void>;
}

/** SSE 事件分发器：返回 true 表示该帧被识别消费（小程序端据此区分真流式与错误 JSON 整包） */
type SseDispatch = (frame: SseFrame) => boolean;

/** 解析单帧并分发对话回调 */
function dispatchChatFrame(frame: SseFrame, callbacks: ChatStreamCallbacks): boolean {
  try {
    const payload = JSON.parse(frame.data) as Record<string, string>;
    switch (frame.event) {
      case 'meta':
        callbacks.onMeta?.(payload as unknown as AiChatStreamMeta);
        return true;
      case 'delta':
        callbacks.onDelta?.(payload.content ?? '');
        return true;
      case 'done':
        callbacks.onDone?.(payload as unknown as AiChatStreamDone);
        return true;
      case 'error':
        callbacks.onError?.(payload.msg || 'AI 服务调用失败');
        return true;
      default:
        return false;
    }
  } catch {
    return false; // 忽略无法解析的帧（如注释/心跳）
  }
}

/** 流式对话统一入口（按端分派实现） */
export function streamChat(body: AiChatSendBody, callbacks: ChatStreamCallbacks): ChatStreamHandle {
  return streamSse('/ai/chat/stream', body, (frame) => dispatchChatFrame(frame, callbacks), callbacks.onError);
}

/**
 * SSE 流式统一入口（按端分派实现，S101 抽通用供审批建议链路复用）：
 * path 为 /ai/ 下相对路径；dispatch 负责帧识别与回调分发；onError 统一错误出口。
 */
function streamSse(
  path: string,
  body: unknown,
  dispatch: SseDispatch,
  onError?: (msg: string) => void,
): ChatStreamHandle {
  let handle: ChatStreamHandle | null = null;
  // #ifdef H5
  handle = streamByFetch(path, body, dispatch, onError);
  // #endif
  // #ifndef H5
  handle = streamByChunkedRequest(path, body, dispatch, onError);
  // #endif
  return handle!;
}

// #ifdef H5
/** H5：fetch + ReadableStream（同 PC 端方案） */
function streamByFetch(
  path: string,
  body: unknown,
  dispatch: SseDispatch,
  onError?: (msg: string) => void,
): ChatStreamHandle {
  const controller = new AbortController();
  const done = (async () => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          // 后端 token-name = Authorization，未配置 token-prefix，发裸值
          Authorization: getToken(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        onError?.('网络异常，请稍后重试');
      }
      return;
    }

    // 流建立前的业务异常（未登录/无可用供应商等）返回 JSON 的 R 错误体
    if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
      let msg = `请求失败（HTTP ${response.status}）`;
      try {
        const r = (await response.json()) as { msg?: string };
        if (r.msg) msg = r.msg;
      } catch {
        /* 非 JSON 响应体，保留默认提示 */
      }
      onError?.(msg);
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const parser = createSseFrameParser((frame) => dispatch(frame));
    try {
      for (;;) {
        const { done: finished, value } = await reader.read();
        if (finished) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
      // 流结束后 flush decoder + 残留 buffer（同 PC 端 chat.ts：done 是末帧，\n\n 可能未送达）
      parser.feed(decoder.decode());
      parser.flush();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        onError?.('连接中断，请稍后重试');
      }
    }
  })();
  return { abort: () => controller.abort(), done };
}
// #endif

// #ifndef H5
/** 小程序/App：uni.request enableChunked + onChunkReceived */
function streamByChunkedRequest(
  path: string,
  body: unknown,
  dispatch: SseDispatch,
  onError?: (msg: string) => void,
): ChatStreamHandle {
  let aborted = false;
  /** 是否收到过合法 SSE 帧：区分「真流式」与「错误 JSON 整包返回」 */
  let gotSseFrame = false;
  /** 全量文本暂存：流未走通时按 R 错误体回退解析 */
  let rawText = '';

  const decode = createUtf8ChunkDecoder();
  const parser = createSseFrameParser((frame) => {
    gotSseFrame = dispatch(frame) || gotSseFrame;
  });

  let task: UniApp.RequestTask | null = null;
  const done = new Promise<void>((resolve) => {
    /** 结束时兜底：整个响应不是 SSE（如 5020/1002 的 JSON R 体）则取 msg 报错 */
    const settle = (fallbackMsg?: string) => {
      // 流结束后 flush 残留 buffer（同 H5 端：done 是末帧，\n\n 可能未送达）
      parser.flush();
      if (!gotSseFrame && !aborted) {
        let msg = fallbackMsg ?? '';
        try {
          const r = JSON.parse(rawText) as R;
          if (r.msg) msg = r.msg;
        } catch {
          /* 响应体非 JSON，保留兜底文案 */
        }
        if (msg) onError?.(msg);
      }
      resolve();
    };

    task = uni.request({
      url: `${API_BASE_URL}${path}`,
      method: 'POST',
      // uni.request 类型定义未含 enableChunked（微信端专有，基础库 ≥2.20.2），透传给 wx.request
      enableChunked: true,
      header: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: getToken(),
      },
      data: body as unknown as UniApp.RequestOptions['data'],
      timeout: 120_000,
      success: (res) => {
        settle(res.statusCode === 200 ? 'AI 服务无响应，请稍后重试' : `请求失败（HTTP ${res.statusCode}）`);
      },
      fail: (err) => {
        if (!aborted) {
          settle(err.errMsg?.includes('timeout') ? '请求超时，请稍后重试' : '网络异常，请稍后重试');
        } else {
          resolve();
        }
      },
    } as UniApp.RequestOptions) as unknown as UniApp.RequestTask;

    // onChunkReceived 仅小程序端存在（H5/编译器不认识该方法，运行时探测）
    const chunkedTask = task as unknown as {
      onChunkReceived?: (cb: (res: { data: ArrayBuffer }) => void) => void;
    };
    chunkedTask.onChunkReceived?.((res) => {
      const text = decode(res.data);
      rawText += text;
      parser.feed(text);
    });
  });

  return {
    abort: () => {
      aborted = true;
      task?.abort();
    },
    done,
  };
}
// #endif

/* ================= AI 审批助手（S101 A3 移动端接入） ================= */

/** 审批建议制度引用（对齐 ApprovalReferenceVO） */
export interface ApprovalAdviceReference {
  /** 命中分块 ID */
  chunkId?: string;
  /** 来源文件名 */
  fileName?: string;
  /** 依据摘录（≤200 字） */
  quote?: string;
}

/** 审批建议回显（对齐 ApprovalAdviceVO，GET /ai/approval/advice/{taskId}/latest） */
export interface ApprovalAdvice {
  id: string;
  taskId: string;
  /** 结论三态：approve 建议通过 / reject 建议驳回 / need_info 需补充材料 */
  conclusion?: string;
  reason?: string;
  references?: ApprovalAdviceReference[];
  kbId?: string;
  createTime?: string;
}

/** 审批建议生成请求（对齐 ApprovalAdviceRequest；kbId 空 = 后端默认库策略） */
export interface ApprovalAdviceBody {
  taskId: string;
  kbId?: string;
}

/** 审批建议 SSE meta 事件载荷 */
export interface ApprovalAdviceStreamMeta {
  taskId?: string;
  instanceId?: string;
  kbId?: string;
  /** 免责声明：AI 建议仅供参考，审批责任仍归审批人 */
  disclaimer?: string;
}

/** 审批建议 SSE done 事件载荷（建议落库完成，结构化结论在此帧） */
export interface ApprovalAdviceStreamDone {
  adviceId?: string;
  conclusion?: string;
  reason?: string;
  references?: ApprovalAdviceReference[];
  disclaimer?: string;
}

/** SSE 流式审批建议回调（事件序列 meta → delta* → done，异常 error） */
export interface ApprovalAdviceStreamCallbacks {
  onMeta?: (meta: ApprovalAdviceStreamMeta) => void;
  onDelta?: (content: string) => void;
  onDone?: (done: ApprovalAdviceStreamDone) => void;
  onError?: (msg: string) => void;
}

/** 最近一条审批建议回显（仅本人记录；无记录返回 null；静默失败由调用方兜底） */
export function latestApprovalAdvice(taskId: string): Promise<ApprovalAdvice | null> {
  return get<ApprovalAdvice | null>(`/ai/approval/advice/${taskId}/latest`);
}

/** 解析单帧并分发审批建议回调 */
function dispatchAdviceFrame(frame: SseFrame, callbacks: ApprovalAdviceStreamCallbacks): boolean {
  try {
    const payload = JSON.parse(frame.data) as Record<string, unknown>;
    switch (frame.event) {
      case 'meta':
        callbacks.onMeta?.(payload as unknown as ApprovalAdviceStreamMeta);
        return true;
      case 'delta':
        callbacks.onDelta?.((payload.content as string) ?? '');
        return true;
      case 'done':
        callbacks.onDone?.(payload as unknown as ApprovalAdviceStreamDone);
        return true;
      case 'error':
        callbacks.onError?.((payload.msg as string) || 'AI 建议生成失败');
        return true;
      default:
        return false;
    }
  } catch {
    return false; // 忽略无法解析的帧（如注释/心跳）
  }
}

/** 流式生成审批建议：POST /ai/approval/advice/stream（复用 SSE 双端通用入口） */
export function streamApprovalAdvice(
  body: ApprovalAdviceBody,
  callbacks: ApprovalAdviceStreamCallbacks,
): ChatStreamHandle {
  return streamSse(
    '/ai/approval/advice/stream',
    body,
    (frame) => dispatchAdviceFrame(frame, callbacks),
    callbacks.onError,
  );
}
