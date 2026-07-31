/**
 * 文件域 API + 预签名直传（file Plugin /file/presign → PUT 到 MinIO）
 * 上传链路：选图拿本地路径 → presign 换签名 URL → 读文件二进制 → PUT 对象存储
 *
 * 说明：PUT 直传的对象存储签名 URL 不是后端 R 体接口（返回空 200），
 * 因此本文件内直接使用 uni.request——属于"封装层自身实现"，
 * 与 request.ts 的关系等同于它对 uni.request 的使用，页面仍不裸调。
 */

import { get, post } from '@/utils/request';

export interface PresignResult {
  objectKey: string;
  uploadUrl: string;
  fileUrl: string;
  expireSeconds: number;
}

/** 直传完成回调登记请求（对齐后端 FileRegisterRequest） */
export interface FileRegisterBody {
  objectKey: string;
  originalName?: string;
  fileSize?: number;
  md5?: string;
  contentType?: string;
}

/** 预签名直传地址 */
export function presign(filename: string): Promise<PresignResult> {
  return get<PresignResult>('/file/presign', { filename });
}

/** 直传完成回调登记（sys_file 元数据落库，S25） */
export function registerFile(body: FileRegisterBody): Promise<string> {
  return post<string>('/file/register', body, { silent: true });
}

/**
 * 预签名下载地址（GET，私有桶回显）。
 * 后端桶为私有，落库的 fileUrl 直连会 403，展示前用本接口换取限时 URL。
 * @param key 对象键，或历史落库的完整 fileUrl（后端统一归一化）
 */
export function presignDownload(key: string): Promise<string> {
  return get<string>('/file/presign-download', { key }, { silent: true });
}

/** 读本地文件为 ArrayBuffer（小程序/App 走文件系统，H5 走 fetch） */
function readFileBuffer(filePath: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    // #ifdef H5
    fetch(filePath)
      .then((res) => res.arrayBuffer())
      .then(resolve)
      .catch(reject);
    // #endif
    // #ifndef H5
    uni.getFileSystemManager().readFile({
      filePath,
      success: (res) => resolve(res.data as ArrayBuffer),
      fail: reject,
    });
    // #endif
  });
}

/** PUT 二进制到对象存储签名地址（200/204 即成功，无 R 体） */
function putToStorage(uploadUrl: string, buffer: ArrayBuffer, contentType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: uploadUrl,
      method: 'PUT',
      data: buffer,
      header: { 'Content-Type': contentType },
      timeout: 30_000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`上传失败(${res.statusCode})`));
        }
      },
      fail: () => reject(new Error('上传网络异常，请稍后重试')),
    });
  });
}

/**
 * 从选图结果解析扩展名（白名单内才返回，否则回落 png）：
 * - 优先文件路径后缀（小程序/App 临时路径通常带后缀）
 * - H5 的 blob: URL 无后缀，退用 tempFiles[0].name / MIME type
 */
function resolveImageExt(chosen: UniApp.ChooseImageSuccessCallbackResult, filePath: string): string {
  const WHITELIST = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  const fromPath = filePath.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (WHITELIST.includes(fromPath)) {
    return fromPath;
  }
  const file = (chosen.tempFiles as unknown as Array<{ name?: string; type?: string }> | undefined)?.[0];
  const fromName = file?.name?.split('.').pop()?.toLowerCase() ?? '';
  if (WHITELIST.includes(fromName)) {
    return fromName;
  }
  const fromMime = file?.type?.split('/').pop()?.toLowerCase() ?? '';
  if (WHITELIST.includes(fromMime)) {
    return fromMime;
  }
  return 'png';
}

/**
 * 选择并直传一张图片，返回可访问的 fileUrl
 * @param dirname 语义化文件名前缀（仅影响对象键可读部分）
 */
export async function chooseAndUploadImage(dirname = 'image'): Promise<string> {
  const chosen = await uni.chooseImage({ count: 1, sizeType: ['compressed'] });
  const filePath = chosen.tempFilePaths[0];
  if (!filePath) {
    throw new Error('未选择图片');
  }
  const ext = resolveImageExt(chosen, filePath);
  const sign = await presign(`${dirname}.${ext}`);
  const buffer = await readFileBuffer(filePath);
  const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  await putToStorage(sign.uploadUrl, buffer, contentType);
  // 元数据登记（S25 sys_file）：失败不阻断主链路，头像上传零感知
  try {
    await registerFile({
      objectKey: sign.objectKey,
      originalName: `${dirname}.${ext}`,
      fileSize: buffer.byteLength,
      contentType,
    });
  } catch (err) {
    console.warn('[PivotOS] 文件元数据登记失败（不影响上传结果）', err);
  }
  return sign.fileUrl;
}
