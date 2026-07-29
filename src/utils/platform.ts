/**
 * 平台探测工具（《05》第五节：条件编译节制使用，优先 uni.canIUse 能力探测）
 * 注：先 let 后 export const 的写法是为兼容 vue-tsc——
 * 条件编译块内重复声明同名 const 会被 TS 视为重复声明。
 */

export type Platform = 'h5' | 'mp-weixin' | 'mp-alipay' | 'app';

let platformValue: Platform = 'h5';

function detectPlatform(): Platform {
  // #ifdef H5
  platformValue = 'h5';
  // #endif
  // #ifdef MP-WEIXIN
  platformValue = 'mp-weixin';
  // #endif
  // #ifdef MP-ALIPAY
  platformValue = 'mp-alipay';
  // #endif
  // #ifdef APP-PLUS
  platformValue = 'app';
  // #endif
  return platformValue;
}

/** 当前运行平台（条件编译常量，各端只保留本端分支，tree-shaking 友好） */
export const PLATFORM: Platform = detectPlatform();

export const isH5 = PLATFORM === 'h5';
export const isMpWeixin = PLATFORM === 'mp-weixin';
export const isMpAlipay = PLATFORM === 'mp-alipay';
export const isApp = PLATFORM === 'app';
/** 小程序系（微信/支付宝） */
export const isMp = isMpWeixin || isMpAlipay;

/** 能力探测：判断当前端是否支持某 API，如 canIUse('getUserProfile') */
export function canIUse(api: string): boolean {
  return uni.canIUse(api);
}
