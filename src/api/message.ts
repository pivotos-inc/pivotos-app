/**
 * 消息域 API（message Plugin /message/user/*，三账号体系通用）
 */

import { get, put } from '@/utils/request';

export interface UserMessage {
  id: string;
  title: string;
  content: string;
  msgType?: string;
  readStatus: number;
  createTime?: string;
  [key: string]: unknown;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  [key: string]: unknown;
}

export interface MessagePageQuery {
  pageNum: number;
  pageSize: number;
  /** 0 未读 1 已读，不传全部 */
  readStatus?: number;
}

/** 我的消息分页 */
export function pageMessages(query: MessagePageQuery): Promise<PageResult<UserMessage>> {
  return get<PageResult<UserMessage>>('/message/user/page', query);
}

/** 标记已读 */
export function markRead(userMessageId: string): Promise<void> {
  return put<void>(`/message/user/read/${userMessageId}`);
}

/** 全部已读，返回处理条数 */
export function markAllRead(): Promise<number> {
  return put<number>('/message/user/read-all');
}

/** 未读数（工作台角标） */
export function unreadCount(): Promise<number> {
  return get<number>('/message/user/unread-count', undefined, { silent: true });
}
