/**
 * 工作流域 API（S57 审批流转集成）
 */

import { get, put } from '@/utils/request';

export interface WorkflowTask {
  id: string;
  definitionId: string;
  instanceId: string;
  flowName: string;
  businessId?: string;
  nodeCode?: string;
  nodeName?: string;
  flowStatus?: string;
  createTime?: string;
  [key: string]: unknown;
}

export interface WorkflowHisTask {
  id: string;
  instanceId: string;
  taskId: string;
  nodeCode?: string;
  nodeName?: string;
  targetNodeName?: string;
  approver?: string;
  skipType?: string;
  flowStatus?: string;
  message?: string;
  createTime?: string;
  [key: string]: unknown;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  [key: string]: unknown;
}

export interface TaskPageQuery {
  pageNum: number;
  pageSize: number;
  flowName?: string;
}

export interface TaskActionCmd {
  taskId: string;
  message?: string;
  targetUserId?: string;
}

/** 待办分页 */
export function pagePendingTasks(query: TaskPageQuery): Promise<PageResult<WorkflowTask>> {
  return get<PageResult<WorkflowTask>>('/workflow/task/pending/page', query as unknown as Record<string, unknown>);
}

/** 审批通过 */
export function passTask(cmd: TaskActionCmd): Promise<void> {
  return put<void>('/workflow/task/pass', cmd);
}

/** 驳回 */
export function rejectTask(cmd: TaskActionCmd): Promise<void> {
  return put<void>('/workflow/task/reject', cmd);
}

/** 审批历史 */
export function taskHistory(instanceId: string): Promise<WorkflowHisTask[]> {
  return get<WorkflowHisTask[]>(`/workflow/task/history/${instanceId}`);
}
