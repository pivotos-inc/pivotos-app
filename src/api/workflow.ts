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
  /** warm-flow CooperateType：6=加签 7=减签（S81 展示补齐） */
  cooperateType?: number;
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
  /** 流程变量（S93）：供网关节点条件表达式消费，如 { days: 3 } */
  variable?: Record<string, unknown>;
}

/** 抄送记录（S80 抄送我的） */
export interface WorkflowCc {
  id: string;
  instanceId: string;
  flowName?: string;
  creatorName?: string;
  flowStatus?: string;
  nodeName?: string;
  readFlag?: number;
  readTime?: string;
  createTime?: string;
  [key: string]: unknown;
}

export interface CcPageQuery {
  pageNum: number;
  pageSize: number;
  flowName?: string;
  /** 已读过滤：0 未读 1 已读 */
  readFlag?: number;
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

/**
 * 重新提交（S113 W1）：发起人把「已退回」任务重新提交。
 * 引擎侧走 pass，实例 ID 与审批历史保持连续（非新建实例）。
 */
export function resubmitTask(cmd: TaskActionCmd): Promise<void> {
  return put<void>('/workflow/task/resubmit', cmd);
}

/** 转办（S93）：将任务转交给目标用户 */
export function transferTask(cmd: TaskActionCmd): Promise<void> {
  return put<void>('/workflow/task/transfer', cmd);
}

/** 委派（S93）：受托人代审，通过后回到委派人确认 */
export function deputeTask(cmd: TaskActionCmd): Promise<void> {
  return put<void>('/workflow/task/depute', cmd);
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

/** 抄送我的分页（S80） */
export function pageCcMine(query: CcPageQuery): Promise<PageResult<WorkflowCc>> {
  return get<PageResult<WorkflowCc>>('/workflow/cc/page', query as unknown as Record<string, unknown>);
}

/** 抄送标记已读（S80，幂等） */
export function markCcRead(id: string): Promise<void> {
  return put<void>(`/workflow/cc/${id}/read`);
}

/** 加签选人用户选项（S81） */
export interface UserOption {
  id: string;
  username?: string;
  nickname?: string;
  [key: string]: unknown;
}

export interface AddSignatureCmd {
  taskId: string;
  userIds: string[];
  message?: string;
}

/** 加签选人选项（S81：支持关键字检索） */
export function userOptions(keyword?: string): Promise<UserOption[]> {
  return get<UserOption[]>('/workflow/task/user-options', keyword ? { keyword } : undefined);
}

/** 加签（S81：或签语义，任一审批人通过即推进） */
export function addSignature(cmd: AddSignatureCmd): Promise<void> {
  return put<void>('/workflow/task/add-signature', cmd);
}

export interface ReductionSignatureCmd {
  taskId: string;
  userIds: string[];
  message?: string;
}

/** 待办任务当前审批人（S82：减签选人候选） */
export function taskApprovers(taskId: string): Promise<UserOption[]> {
  return get<UserOption[]>(`/workflow/task/${taskId}/approvers`);
}

/** 减签（S82：引擎护栏——办理人不足两人不可减签） */
export function reductionSignature(cmd: ReductionSignatureCmd): Promise<void> {
  return put<void>('/workflow/task/reduction-signature', cmd);
}
