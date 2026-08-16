/**
 * 未读消息角标 composable（S84）：tabBar「消息」角标（index=1）统一收口。
 * - syncUnreadBadge：按需刷新（App 前台回归 / 页面 onShow / 已读操作后）
 * - start/stopUnreadBadgePolling：App 层前台轮询，覆盖子包页面停留期间新消息不刷新的缺口
 * 未登录（无 token）静默跳过，避免登录页打无效请求。
 */
import { unreadCount } from '@/api/message';
import { getToken } from '@/utils/auth';

/** tabBar 中「消息」页下标（pages.json：工作台=0 消息=1 我的=2） */
const NOTICE_TAB_INDEX = 1;

/** 前台轮询间隔：60s（静默请求，无未读变化时不重绘） */
const POLL_INTERVAL = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;

/** 拉取未读数并同步 tabBar 角标（失败静默，不打扰用户）；调用方已持有未读数时可直接传入，免重复请求 */
export async function syncUnreadBadge(known?: number): Promise<void> {
  if (!getToken()) {
    return;
  }
  const n = known !== undefined ? known : await unreadCount().catch(() => -1);
  if (n < 0) {
    return;
  }
  if (n > 0) {
    uni.setTabBarBadge({ index: NOTICE_TAB_INDEX, text: n > 99 ? '99+' : String(n) });
  } else {
    uni.removeTabBarBadge({ index: NOTICE_TAB_INDEX });
  }
}

/** 启动前台轮询（重复调用幂等，先清旧定时器） */
export function startUnreadBadgePolling(): void {
  stopUnreadBadgePolling();
  timer = setInterval(syncUnreadBadge, POLL_INTERVAL);
}

/** 停止前台轮询（App onHide 时调用，避免后台空转） */
export function stopUnreadBadgePolling(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
