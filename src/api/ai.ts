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

/** AI 对话消息（对齐 ChatMessageVO） */
export interface AiChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createTime?: string;
}

/** 对话请求体（conversationId 为空 = 新建会话） */
export interface AiChatSendBody {
  conversationId?: string;
  content: string;
  /** 供应商 id（空 = 默认供应商 → 静态配置兜底） */
  providerId?: string;
  /** 模型名（空 = 供应商默认模型） */
  model?: string;
}

/** SSE meta 事件载荷 */
export interface AiChatStreamMeta {
  conversationId: string;
  userMessageId: string;
  title: string;
}

/** SSE done 事件载荷 */
export interface AiChatStreamDone {
  conversationId: string;
  messageId: string;
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

/** 解析单帧并分发回调（两端共用） */
function dispatchFrame(frame: SseFrame, callbacks: ChatStreamCallbacks): boolean {
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
  let handle: ChatStreamHandle | null = null;
  // #ifdef H5
  handle = streamByFetch(body, callbacks);
  // #endif
  // #ifndef H5
  handle = streamByChunkedRequest(body, callbacks);
  // #endif
  return handle!;
}

// #ifdef H5
/** H5：fetch + ReadableStream（同 PC 端方案） */
function streamByFetch(body: AiChatSendBody, callbacks: ChatStreamCallbacks): ChatStreamHandle {
  const controller = new AbortController();
  const done = (async () => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/ai/chat/stream`, {
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
        callbacks.onError?.('网络异常，请稍后重试');
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
      callbacks.onError?.(msg);
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const feed = createSseFrameParser((frame) => dispatchFrame(frame, callbacks));
    try {
      for (;;) {
        const { done: finished, value } = await reader.read();
        if (finished) break;
        feed(decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        callbacks.onError?.('连接中断，请稍后重试');
      }
    }
  })();
  return { abort: () => controller.abort(), done };
}
// #endif

// #ifndef H5
/** 小程序/App：uni.request enableChunked + onChunkReceived */
function streamByChunkedRequest(
  body: AiChatSendBody,
  callbacks: ChatStreamCallbacks,
): ChatStreamHandle {
  let aborted = false;
  /** 是否收到过合法 SSE 帧：区分「真流式」与「错误 JSON 整包返回」 */
  let gotSseFrame = false;
  /** 全量文本暂存：流未走通时按 R 错误体回退解析 */
  let rawText = '';

  const decode = createUtf8ChunkDecoder();
  const feed = createSseFrameParser((frame) => {
    gotSseFrame = dispatchFrame(frame, callbacks) || gotSseFrame;
  });

  let task: UniApp.RequestTask | null = null;
  const done = new Promise<void>((resolve) => {
    /** 结束时兜底：整个响应不是 SSE（如 5020/1002 的 JSON R 体）则取 msg 报错 */
    const settle = (fallbackMsg?: string) => {
      if (!gotSseFrame && !aborted) {
        let msg = fallbackMsg ?? '';
        try {
          const r = JSON.parse(rawText) as R;
          if (r.msg) msg = r.msg;
        } catch {
          /* 响应体非 JSON，保留兜底文案 */
        }
        if (msg) callbacks.onError?.(msg);
      }
      resolve();
    };

    task = uni.request({
      url: `${API_BASE_URL}/ai/chat/stream`,
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
      feed(text);
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
