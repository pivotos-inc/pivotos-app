/**
 * 登录编排 composable：账密 / 微信小程序两条链路统一收口
 * - 账密（App/H5/小程序通用兜底）：appLogin → getInfo → 写凭证 → 进工作台
 * - 微信小程序：uni.login → miniLogin → 已绑定直接进；未绑定走手机号授权或账密绑定
 */

import { ref } from 'vue';
import {
  appLogin,
  getInfo,
  miniBindAccount,
  miniLogin,
  miniPhoneLogin,
} from '@/api/auth';
import { setToken, clearAuth } from '@/utils/auth';
import { useUserStore } from '@/store/user';
import { ServiceError } from '@/utils/request';

export function useLogin() {
  const userStore = useUserStore();
  const submitting = ref(false);

  /** 登录成功公共收尾：先落 token 再取用户信息、写凭证、进工作台 */
  async function afterLogin(token: string): Promise<void> {
    // 必须先写 token：getInfo 靠请求封装从 storage 取 Authorization 头；
    // 旧序先 getInfo 后写，实际靠 Sa-Token 登录下发的 Cookie 兜底才通过鉴权，
    // 后端关闭 is-read-cookie 后（S23 坑 2 修复）该隐藏依赖暴露为 1002
    setToken(token);
    try {
      const info = await getInfo();
      userStore.setAuth(token, info.user);
    } catch (err) {
      clearAuth();
      throw err;
    }
    uni.reLaunch({ url: '/pages/workbench/workbench' });
  }

  /** 账密登录（App/H5 主链路；小程序"账密登录"入口也走它） */
  async function loginByPassword(username: string, password: string): Promise<void> {
    if (submitting.value) return;
    submitting.value = true;
    try {
      const { token } = await appLogin(username, password);
      await afterLogin(token);
    } catch (err) {
      toastError(err);
      throw err;
    } finally {
      submitting.value = false;
    }
  }

  /**
   * 微信小程序一键登录：
   * 已绑定 → 直接进；未绑定 → 抛 MINI_UNBOUND，页面据此展示绑定引导
   */
  async function loginByWechat(): Promise<void> {
    if (submitting.value) return;
    submitting.value = true;
    try {
      const { code } = await uni.login({ provider: 'weixin' });
      if (!code) throw new Error('微信登录凭证获取失败');
      const result = await miniLogin(code);
      if (result.bound && result.token) {
        await afterLogin(result.token);
        return;
      }
      throw new ServiceError(-100, 'MINI_UNBOUND');
    } catch (err) {
      if (!(err instanceof ServiceError && err.message === 'MINI_UNBOUND')) {
        toastError(err);
      }
      throw err;
    } finally {
      submitting.value = false;
    }
  }

  /** 小程序手机号授权绑定登录（getPhoneNumber 按钮回调的 code） */
  async function bindByPhone(phoneCode: string): Promise<void> {
    if (submitting.value) return;
    submitting.value = true;
    try {
      const { code } = await uni.login({ provider: 'weixin' });
      if (!code) throw new Error('微信登录凭证获取失败');
      const result = await miniPhoneLogin(code, phoneCode);
      if (result.token) await afterLogin(result.token);
    } catch (err) {
      toastError(err);
      throw err;
    } finally {
      submitting.value = false;
    }
  }

  /** 小程序账密绑定登录（把微信身份绑到已有账号） */
  async function bindByAccount(username: string, password: string): Promise<void> {
    if (submitting.value) return;
    submitting.value = true;
    try {
      const { code } = await uni.login({ provider: 'weixin' });
      if (!code) throw new Error('微信登录凭证获取失败');
      const result = await miniBindAccount(code, username, password);
      if (result.token) await afterLogin(result.token);
    } catch (err) {
      toastError(err);
      throw err;
    } finally {
      submitting.value = false;
    }
  }

  function toastError(err: unknown): void {
    const msg = err instanceof Error ? err.message : '登录失败，请稍后重试';
    uni.showToast({ title: msg, icon: 'none', duration: 2500 });
  }

  return {
    submitting,
    loginByPassword,
    loginByWechat,
    bindByPhone,
    bindByAccount,
  };
}
