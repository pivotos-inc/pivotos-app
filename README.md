# PivotOS APP（pivotos-app）

> 筱筱框架（PivotOS）「一码三端」企业管理平台 —— uni-app 移动端（App / H5 / 微信·支付宝·抖音小程序，一套代码）
>
> 📖 在线文档：[pivotos-doc.293242.com](https://pivotos-doc.293242.com) ｜ 📱 H5 演示：[pivotos-h5.293242.com](https://pivotos-h5.293242.com)（账号 `admin / admin123`）

## 技术栈

uni-app + Vue 3 + TypeScript + Vite + Pinia + wot-design-uni（easycom，`wd-*` 直接用）

## 功能模块

登录（账密 / 微信小程序 code2session / App）· 工作台 · 消息中心 · AI 对话（SSE 流式，H5 fetch + 小程序 enableChunked）· 审批（待办 / 已办 / 发起）· 个人中心与设置 · 代码生成器产物分包

## 开发调试

环境要求：Node ≥ 20、pnpm 9.x

```bash
git clone https://github.com/pivotos-inc/pivotos-app.git
cd pivotos-app
pnpm install
cp .env.example .env.development   # 首次：配置后端地址（默认 http://localhost:8080）

pnpm dev:h5                        # H5 浏览器调试 http://localhost:5174（/api 经 Vite 代理到后端）
pnpm dev:mp-weixin                 # 微信小程序（产物 dist/dev/mp-weixin，开发者工具打开）
pnpm dev:mp-alipay                 # 支付宝小程序
pnpm dev:app                       # App（HBuilderX 真机运行或自定义基座）
```

## 发布构建

```bash
pnpm build:h5           # H5 → dist/build/h5 → Nginx 托管（/api 同源反代）
pnpm build:mp-weixin    # 微信小程序 → 开发者工具上传 → 提审（需 https 合法域名白名单）
pnpm build:app          # App → HBuilderX 云打包
```

小程序 / App 端直连 `.env.production` 中的 `VITE_API_BASE_URL`；H5 端请求走 `/api` 同源前缀由 Nginx 反代剥离。

## 目录约定（《05-移动端uni-app创建与开发流程》）

- `src/pages/` 主包：仅登录 / 工作台 / 消息 / 我的等基座页面
- `src/pages-sub/` 业务模块分包（主包 ≤ 2M，新增业务页一律进分包）
- `src/pages-gen/` 代码生成器产物专属分包
- `src/api/` 接口封装（按域分文件，禁止页面内裸 `uni.request`）
- `src/utils/request.ts` 统一请求封装（Token 注入 / R 解包 / 401 跳登录 / 环境域名）
- `src/store/` Pinia（user / app）
- UI 组件只用 `wot-design-uni`（easycom 自动引入，`wd-*` 直接用）

## 相关仓库

| 仓库 | 说明 |
| --- | --- |
| [pivotos-framework](https://github.com/pivotos-inc/pivotos-framework) | 后端（Spring Boot 4.x + JDK 25，35 模块） |
| [pivotos-ui](https://github.com/pivotos-inc/pivotos-ui) | PC 管理端（Vue3 + Element Plus） |
| [pivotos-docs](https://github.com/pivotos-inc/pivotos-docs) | 项目文档库 |

## 维护约定

> 新增业务分包 / 端能力时，须同步更新本 README 的「功能模块」与在线文档对应章节。
