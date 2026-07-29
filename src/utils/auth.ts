/**
 * 本地凭证存取（token / userInfo），键名与 PC 端保持一致：token
 * 多端存储差异由 uni.*StorageSync 抹平（H5→localStorage，小程序/App→原生存储）
 */

const TOKEN_KEY = 'token';
const USER_INFO_KEY = 'userInfo';

/** 登录用户信息（S16 与后端 LoginUserVO 对齐后收紧字段） */
export interface LoginUserInfo {
  id?: string | number;
  nickname?: string;
  avatar?: string;
  [key: string]: unknown;
}

export function getToken(): string {
  return (uni.getStorageSync(TOKEN_KEY) as string) || '';
}

export function setToken(token: string): void {
  uni.setStorageSync(TOKEN_KEY, token);
}

export function getUserInfo(): LoginUserInfo | null {
  const value = uni.getStorageSync(USER_INFO_KEY);
  return value ? (value as LoginUserInfo) : null;
}

export function setUserInfo(info: LoginUserInfo): void {
  uni.setStorageSync(USER_INFO_KEY, info);
}

export function clearAuth(): void {
  uni.removeStorageSync(TOKEN_KEY);
  uni.removeStorageSync(USER_INFO_KEY);
}
