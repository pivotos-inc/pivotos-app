import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const apiTarget = env.VITE_API_BASE_URL || 'http://localhost:8080';
  return {
    plugins: [uni()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        // H5 开发代理到 admin-server，避免跨域（与 PC 端 admin 同策略，见《04》第五节）；
        // 小程序 / App 不经此代理，直连 import.meta.env.VITE_API_BASE_URL。
        // 按插件 API 前缀登记——新 Plugin（flow/file/job…）接入时各加一条。
        '/system': { target: apiTarget, changeOrigin: true },
        '/message': { target: apiTarget, changeOrigin: true },
        // 移动端多端登录命名空间（auth Starter 多账号体系，S16 接入）
        '/app': { target: apiTarget, changeOrigin: true },
        '/mini': { target: apiTarget, changeOrigin: true },
        // file Plugin 预签名（S16 接入）
        '/file': { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
