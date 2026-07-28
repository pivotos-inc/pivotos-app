/**
 * 文件域 API + 预签名直传（file Plugin /file/presign → PUT 到 MinIO）
 * 上传链路：选图拿本地路径 → presign 换签名 URL → 读文件二进制 → PUT 对象存储
 *
 * 说明：PUT 直传的对象存储签名 URL 不是后端 R 体接口（返回空 200），
 * 因此本文件内直接使用 uni.request——属于"封装层自身实现"，
 * 与 request.ts 的关系等同于它对 uni.request 的使用，页面仍不裸调。
 */

import { get } from '@/utils/request';

export interface PresignResult {
  objectKey: string;
  uploadUrl: string;
  fileUrl: string;
  expireSeconds: number;
}

/** 预签名直传地址 */
export function presign(filename: string): Promise<PresignResult> {
  return get<PresignResult>('/file/presign', { filename });
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
 * 选择并直传一张图片，返回可访问的 fileUrl
 * @param dirname 语义化文件名前缀（仅影响对象键可读部分）
 */
export async function chooseAndUploadImage(dirname = 'image'): Promise<string> {
  const chosen = await uni.chooseImage({ count: 1, sizeType: ['compressed'] });
  const filePath = chosen.tempFilePaths[0];
  if (!filePath) {
    throw new Error('未选择图片');
  }
  const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
  const sign = await presign(`${dirname}.${ext}`);
  const buffer = await readFileBuffer(filePath);
  await putToStorage(sign.uploadUrl, buffer, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
  return sign.fileUrl;
}
