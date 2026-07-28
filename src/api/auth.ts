/**
 * 认证域 API（auth Starter 多账号体系）
 * - 账密：App/H5 走 /app/auth/*（app-user 体系）
 * - 微信小程序：/mini/auth/*（wx-mini-user 体系，code2session）
 * 端差异只在本文件与登录页体现，业务页面无感。
 */

import { get, post } from '@/utils/request';
import { isMpWeixin } from '@/utils/platform';

export interface LoginVO {
  token: string;
}

/** 小程序登录响应：bound=false 时需引导绑定 */
export interface MiniLoginVO {
  token: string | null;
  bound: boolean;
}

export interface UserInfoVO {
  user: {
    id: string;
    username: string;
    nickname: string;
    avatar: string;
    email: string;
    mobile: string;
    [key: string]: unknown;
  };
  roles: string[];
  perms: string[];
}

/** 账密登录（App/H5） */
export function appLogin(username: string, password: string): Promise<LoginVO> {
  return post<LoginVO>('/app/auth/login', { username, password }, { silent: true });
}

/** 小程序登录（uni.login code → 已绑定直接发 Token） */
export function miniLogin(code: string): Promise<MiniLoginVO> {
  return post<MiniLoginVO>('/mini/auth/login', { code }, { silent: true });
}

/** 小程序手机号授权登录（未注册自动建档） */
export function miniPhoneLogin(loginCode: string, phoneCode: string): Promise<MiniLoginVO> {
  return post<MiniLoginVO>('/mini/auth/phone', { loginCode, phoneCode }, { silent: true });
}

/** 小程序账密绑定登录 */
export function miniBindAccount(
  loginCode: string,
  username: string,
  password: string,
): Promise<MiniLoginVO> {
  return post<MiniLoginVO>('/mini/auth/bind', { loginCode, username, password }, { silent: true });
}

/** 当前登录用户信息（按端路由到对应体系端点） */
export function getInfo(): Promise<UserInfoVO> {
  return get<UserInfoVO>(isMpWeixin ? '/mini/auth/getInfo' : '/app/auth/getInfo');
}

/** 退出登录（失败不阻塞本地清理，调用方静默处理） */
export function logout(): Promise<void> {
  return post<void>(isMpWeixin ? '/mini/auth/logout' : '/app/auth/logout', undefined, {
    silent: true,
  });
}
