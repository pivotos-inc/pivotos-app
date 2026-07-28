import { defineStore } from 'pinia';

/** 应用级状态：系统信息 / 网络状态（S16 基座功能逐步填充） */
export const useAppStore = defineStore('app', {
  state: () => ({
    systemInfo: null as UniApp.GetSystemInfoResult | null,
    networkType: '',
  }),
  actions: {
    initSystemInfo() {
      this.systemInfo = uni.getSystemInfoSync();
    },
  },
});
