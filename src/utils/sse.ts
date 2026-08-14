/**
 * SSE 流式消费共用件（S22，H5 与微信小程序两端复用）
 * - createSseFrameParser：按空行分帧、半帧留 buffer（与 PC 端 chat.ts 同款分帧策略，
 *   帧可能被网络分块切断，必须缓冲到下一批数据拼接后再解析）
 * - createUtf8ChunkDecoder：小程序 onChunkReceived 给的是 ArrayBuffer，且运行时无
 *   TextDecoder（JavaScriptCore 不带），需手写增量解码；多字节字符可能被 chunk
 *   在中间切断，尾部不完整字节序列留待下一块拼接，否则中文逐帧输出必然乱码。
 *
 * 注：本文件统一用字符码常量 LF/CRLF 表示换行，不写反斜杠转义序列。
 */

/** 换行常量（LF=10 / CR=13） */
const LF = String.fromCharCode(10);
const CRLF = String.fromCharCode(13) + LF;

/** 单个 SSE 帧（event: 名称 + data: 原始 JSON 串） */
export interface SseFrame {
  event: string;
  data: string;
}

/**
 * SSE 帧解析器：喂入任意切割的文本增量，按空行（LF LF）完整分帧后回调；
 * CRLF 先归一为 LF（部分代理会改写换行）。data 跨多行时按 SSE 规范拼接。
 * flush() 用于流结束后处理残留 buffer：最后一帧（done）的 \n\n 终止符可能
 * 未随最终 chunk 送达（代理缓冲 / 连接关闭时序），不 flush 则引用等末帧数据丢失。
 */
export function createSseFrameParser(onFrame: (frame: SseFrame) => void): {
  feed: (text: string) => void;
  flush: () => void;
} {
  let buffer = '';
  /** 解析单帧并回调 */
  const parseFrame = (raw: string): void => {
    let event = 'message';
    let data = '';
    for (const line of raw.split(LF)) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        data += line.slice(5).trimStart();
      }
    }
    if (data) onFrame({ event, data });
  };
  return {
    feed(text: string) {
      buffer += text;
      const frames = buffer.split(CRLF).join(LF).split(LF + LF);
      buffer = frames.pop() ?? '';
      for (const raw of frames) {
        parseFrame(raw);
      }
    },
    flush() {
      if (buffer.trim()) {
        parseFrame(buffer.trim());
        buffer = '';
      }
    },
  };
}

/**
 * 增量 UTF-8 解码器：每次喂入一个 ArrayBuffer，返回可安全解码的完整字符，
 * 尾部不完整的多字节序列缓存到下一块。
 */
export function createUtf8ChunkDecoder(): (chunk: ArrayBuffer) => string {
  let pending: number[] = [];
  return (chunk: ArrayBuffer) => {
    const bytes = pending.concat(Array.from(new Uint8Array(chunk)));
    // 从尾部回看最多 3 字节找多字节序列的首字节，判断末字符是否完整
    let end = bytes.length;
    for (let i = bytes.length - 1; i >= 0 && i >= bytes.length - 3; i--) {
      const b = bytes[i]!;
      if (b < 0x80) break; // 单字节字符，尾部完整
      if (b >= 0xc0) {
        // 找到首字节：期望长度 vs 实际剩余长度
        const expect = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : 2;
        if (bytes.length - i < expect) end = i;
        break;
      }
      // 0x80~0xBF 是续字节，继续向前找首字节
    }
    pending = bytes.slice(end);
    return utf8Decode(bytes.slice(0, end));
  };
}

/** 手写 UTF-8 → 字符串（含四字节码点的代理对处理） */
function utf8Decode(bytes: number[]): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    let cp: number;
    if (b < 0x80) {
      cp = b;
      i += 1;
    } else if (b < 0xe0) {
      cp = ((b & 0x1f) << 6) | (bytes[i + 1]! & 0x3f);
      i += 2;
    } else if (b < 0xf0) {
      cp = ((b & 0x0f) << 12) | ((bytes[i + 1]! & 0x3f) << 6) | (bytes[i + 2]! & 0x3f);
      i += 3;
    } else {
      cp =
        ((b & 0x07) << 18) |
        ((bytes[i + 1]! & 0x3f) << 12) |
        ((bytes[i + 2]! & 0x3f) << 6) |
        (bytes[i + 3]! & 0x3f);
      i += 4;
    }
    if (cp > 0xffff) {
      // 增补平面：拆代理对
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      out += String.fromCharCode(cp);
    }
  }
  return out;
}
