/**
 * PivotOS 移动端统一请求封装（《05》第一节步骤 3，与 PC 端 @pivotos/core/request 同构）
 * - Token 注入：Authorization 裸值（后端 token-name=Authorization，未配置 token-prefix）
 * - R<T> 解包：code === 0（对齐 @pivotos/types SUCCESS_CODE）返回 data，否则统一错误处理
 * - 401 / 1002（GlobalErrorCode.UNAUTHORIZED）：清 Token 跳登录页
 * - 环境域名：H5 走 '/api' 前缀（Vite 代理 / Nginx 反代剥离）；小程序 / App 直连 VITE_API_BASE_URL
 * - 接口加密：预留开关，联调链路通后再开启（对接 starter-web）
 *
 * 纪律：API 调用必须走 src/api/（基于本封装），禁止页面内裸 uni.request。
 */

import { clearAuth, getToken } from './auth';

/** 与 @pivotos/types SUCCESS_CODE 对齐 */
export const SUCCESS_CODE = 0;
/** GlobalErrorCode.UNAUTHORIZED（与 PC 端处理一致） */
const UNAUTHORIZED_CODES = [401, 1002];

/** 后端统一响应体 */
export interface R<T = unknown> {
  code: number;
  data: T;
  msg: string;
  traceId?: string;
}

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  url: string;
  method?: RequestMethod;
  data?: unknown;
  header?: Record<string, string>;
  /** 业务/网络失败时静默（不 Toast），默认 false */
  silent?: boolean;
  /** 超时毫秒，默认 10s（与 PC 端一致） */
  timeout?: number;
}

/** 业务错误（带后端 code 与 traceId，便于排障） */
export class ServiceError extends Error {
  constructor(
    public code: number,
    message: string,
    public traceId?: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

/**
 * 环境域名解析（条件编译，各端只保留本端分支）：
 * - H5：'/api' 前缀，开发经 vite.config.ts 代理、生产由 Nginx 反代剥离前缀（与 PC 端 admin 同策略）
 * - 小程序 / App：直连 VITE_API_BASE_URL（无 /api 前缀，后端无此前缀；小程序需配置服务器域名白名单）
 */
function resolveApiBaseUrl(): string {
  // #ifdef H5
  return '/api';
  // #endif
  // #ifndef H5
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
  // #endif
}
export const API_BASE_URL = resolveApiBaseUrl();

/** 登录失效跳转重入锁（并发 401 只跳一次） */
let relogining = false;

/** 登录失效：清凭证并回登录页 */
function handleUnauthorized(): void {
  if (relogining) return;
  relogining = true;
  clearAuth();
  uni.reLaunch({
    url: '/pages/login/login',
    complete: () => {
      relogining = false;
    },
  });
}

function toast(msg: string): void {
  uni.showToast({ title: msg, icon: 'none', duration: 2500 });
}

/** 统一请求入口：业务侧 await 拿到的就是 R.data 载荷 */
export function request<T = unknown>(options: RequestOptions): Promise<T> {
  const { url, method = 'GET', data, header = {}, silent = false, timeout = 10_000 } = options;

  const token = getToken();
  if (token) {
    header.Authorization = token;
  }

  // TODO(接口加密): 对接 starter-web 加解密，联调链路通后开启（见《06》分阶段策略）

  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: API_BASE_URL + url,
      method,
      data: data as UniApp.RequestOptions['data'],
      header,
      timeout,
      success: (res) => {
        const body = res.data as R<T> | undefined;

        // HTTP 层异常（后端全局异常处理器同样返回 R 体，优先取其中 msg）
        if (res.statusCode === 401) {
          handleUnauthorized();
          const msg = body?.msg || '登录已失效，请重新登录';
          if (!silent) toast(msg);
          reject(new ServiceError(401, msg, body?.traceId));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const msg = body?.msg || `请求错误(${res.statusCode})`;
          if (!silent) toast(msg);
          reject(new ServiceError(res.statusCode, msg, body?.traceId));
          return;
        }

        if (body?.code === SUCCESS_CODE) {
          resolve(body.data);
          return;
        }

        // 业务失败：401 / 1002 登录失效
        if (body && UNAUTHORIZED_CODES.includes(body.code)) {
          handleUnauthorized();
        }
        const msg = body?.msg || '请求失败';
        if (!silent) toast(msg);
        reject(new ServiceError(body?.code ?? -1, msg, body?.traceId));
      },
      fail: (err) => {
        const msg = err.errMsg?.includes('timeout') ? '请求超时，请稍后重试' : '网络异常，请检查网络连接';
        if (!silent) toast(msg);
        reject(new ServiceError(-1, msg));
      },
    });
  });
}

export function get<T = unknown>(
  url: string,
  data?: unknown,
  options: Partial<RequestOptions> = {},
): Promise<T> {
  return request<T>({ ...options, url, method: 'GET', data });
}

export function post<T = unknown>(
  url: string,
  data?: unknown,
  options: Partial<RequestOptions> = {},
): Promise<T> {
  return request<T>({ ...options, url, method: 'POST', data });
}

export function put<T = unknown>(
  url: string,
  data?: unknown,
  options: Partial<RequestOptions> = {},
): Promise<T> {
  return request<T>({ ...options, url, method: 'PUT', data });
}

export function del<T = unknown>(
  url: string,
  data?: unknown,
  options: Partial<RequestOptions> = {},
): Promise<T> {
  return request<T>({ ...options, url, method: 'DELETE', data });
}
