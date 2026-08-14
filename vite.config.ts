import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const apiTarget = env.VITE_API_BASE_URL || 'http://localhost:8080';
  return {
    plugins: [uni()],
    css: {
      preprocessorOptions: {
        scss: {
          // wot-design-uni 1.x 仍是 legacy Sass API（@import/全局函数），
          // Dart Sass 1.79+ 每条都会刷 DEPRECATION WARNING；此处静默（不影响编译结果），
          // 组件库升级到 modern API 后可移除。
          silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin', 'color-functions'],
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // 显式固定 H5 端口：PC 端 admin 占用 5173，移动端 H5 用 5174，避免同时起时端口漂移
      port: 5174,
      proxy: {
        // 统一 /api 代理：H5 端 baseURL='/api'，所有 API 请求经此前缀转发到后端并剥离 /api。
        // 与 PC 端 admin vite.config.ts 及 Nginx location /api/ 语义一致，三环境零 CORS。
        // 小程序 / App 不经此代理，直连 import.meta.env.VITE_API_BASE_URL。
        // rewrite 剥离前缀后 http-proxy 对 text/event-stream 默认不缓冲，SSE 流式免单独 location。
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
