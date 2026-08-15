/**
 * 工作流域 API（S57 审批流转集成）
 */

import { get, post, put } from '@/utils/request';

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

/** 流程实例（我发起的列表口径） */
export interface WorkflowInstance {
  id: string;
  definitionId?: string;
  flowName?: string;
  businessId?: string;
  flowStatus?: string;
  nodeCode?: string;
  nodeName?: string;
  createTime?: string;
  updateTime?: string;
  [key: string]: unknown;
}

/** 流程定义（发起下拉口径） */
export interface WorkflowDefinition {
  id: string;
  flowCode: string;
  flowName: string;
  isPublish?: number;
  activityStatus?: number;
  [key: string]: unknown;
}

export interface InstancePageQuery {
  pageNum: number;
  pageSize: number;
  flowName?: string;
}

export interface StartInstanceCmd {
  flowCode: string;
  businessName?: string;
  ccUserIds?: string[];
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

/** 我发起的实例分页 */
export function pageMyInstances(query: InstancePageQuery): Promise<PageResult<WorkflowInstance>> {
  return get<PageResult<WorkflowInstance>>('/workflow/instance/page', query as unknown as Record<string, unknown>);
}

/** 发起流程 */
export function startInstance(cmd: StartInstanceCmd): Promise<WorkflowInstance> {
  return post<WorkflowInstance>('/workflow/instance/start', cmd);
}

/** 流程定义分页（发起下拉：仅取已发布，客户端再过滤激活） */
export function pageDefinitions(query: { pageNum: number; pageSize: number; isPublish?: number }): Promise<PageResult<WorkflowDefinition>> {
  return get<PageResult<WorkflowDefinition>>('/workflow/definition/page', query as unknown as Record<string, unknown>);
}

/** 催办（仅发起人、仅进行中，后端限频 10 分钟） */
export function urgeInstance(instanceId: string): Promise<void> {
  return put<void>(`/workflow/instance/${instanceId}/urge`);
}

/** 撤回（仅发起人、仅待提交/进行中首节点未处理口径由后端校验） */
export function revokeInstance(instanceId: string): Promise<void> {
  return put<void>(`/workflow/instance/${instanceId}/revoke`);
}
