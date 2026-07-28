/**
 * 平台探测工具（《05》第五节：条件编译节制使用，优先 uni.canIUse 能力探测）
 */

/** 当前运行平台（条件编译常量，各端只保留本端分支，tree-shaking 友好） */
// #ifdef H5
export const PLATFORM: 'h5' | 'mp-weixin' | 'mp-alipay' | 'app' = 'h5';
// #endif
// #ifdef MP-WEIXIN
export const PLATFORM: 'h5' | 'mp-weixin' | 'mp-alipay' | 'app' = 'mp-weixin';
// #endif
// #ifdef MP-ALIPAY
export const PLATFORM: 'h5' | 'mp-weixin' | 'mp-alipay' | 'app' = 'mp-alipay';
// #endif
// #ifdef APP-PLUS
export const PLATFORM: 'h5' | 'mp-weixin' | 'mp-alipay' | 'app' = 'app';
// #endif

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
