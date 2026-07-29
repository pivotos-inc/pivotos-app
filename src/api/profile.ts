/**
 * 个人中心域 API（/app/system/profile/*，三账号体系通用，操作对象恒为本人）
 */

import { put } from '@/utils/request';

export interface ProfileUpdateRequest {
  nickname?: string;
  avatar?: string;
  email?: string;
  mobile?: string;
}

/** 修改本人资料 */
export function updateProfile(data: ProfileUpdateRequest): Promise<void> {
  return put<void>('/app/system/profile', data);
}

/** 修改本人密码（旧密码校验） */
export function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  return put<void>('/app/system/profile/password', { oldPassword, newPassword }, { silent: true });
}
