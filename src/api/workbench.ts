/**
 * 工作台域 API（/app/system/workbench，角色可见性 + device 端过滤）
 */

import { get } from '@/utils/request';
import { isMp } from '@/utils/platform';

export interface WorkbenchItem {
  id: string;
  menuName: string;
  icon: string;
  path: string;
  sort: number;
}

/** 工作台宫格（小程序传 device=mini，App/H5 传 app） */
export function getWorkbenchItems(): Promise<WorkbenchItem[]> {
  return get<WorkbenchItem[]>('/app/system/workbench', { device: isMp ? 'mini' : 'app' });
}
