import { defineStore } from 'pinia';
import {
  clearAuth,
  getToken,
  getUserInfo,
  setToken,
  setUserInfo,
  type LoginUserInfo,
} from '@/utils/auth';

/** 用户状态：凭证 + 用户信息（S16 登录体系写入，登出/401 清空） */
export const useUserStore = defineStore('user', {
  state: () => ({
    token: getToken(),
    userInfo: getUserInfo(),
  }),
  getters: {
    isLoggedIn: (state) => !!state.token,
  },
  actions: {
    /** 登录成功后写入凭证与用户信息（同步持久化） */
    setAuth(token: string, userInfo: LoginUserInfo) {
      this.token = token;
      this.userInfo = userInfo;
      setToken(token);
      setUserInfo(userInfo);
    },
    /** 登出/登录失效：清内存态与本地凭证 */
    logout() {
      this.token = '';
      this.userInfo = null;
      clearAuth();
    },
  },
});
