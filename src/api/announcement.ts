/**
 * 通知公告域 API（/app/system/notice，S26 2.1-F12）
 * 命名用 announcement 与消息中心（notice tab）区分。
 */

import { get } from '@/utils/request';

export interface AnnouncementItem {
  id: string;
  title: string;
  /** 1通知 2公告 */
  noticeType: number;
  /** 富文本 HTML（列表接口不回吐，仅详情） */
  content?: string;
  publishTime?: string;
}

/** 最新已发布公告（工作台公告栏） */
export function listAnnouncements(limit = 3): Promise<AnnouncementItem[]> {
  return get<AnnouncementItem[]>('/app/system/notice/published', { limit });
}

/** 已发布公告详情 */
export function getAnnouncement(id: string): Promise<AnnouncementItem> {
  return get<AnnouncementItem>(`/app/system/notice/${id}`);
}
