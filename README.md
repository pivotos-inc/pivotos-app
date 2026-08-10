# PivotOS APP（pivotos-app）

枢磐科技 PivotOS uni-app 一码三端移动端（App / H5 / 微信·支付宝·抖音小程序）。

## 开发调试

```bash
cp .env.example .env.development   # 首次：配置后端地址
pnpm install
pnpm dev:h5                        # H5 浏览器调试（/system 等前缀经 Vite 代理到后端）
pnpm dev:mp-weixin                 # 微信小程序（产物 dist/dev/mp-weixin，开发者工具打开）
pnpm dev:mp-alipay                 # 支付宝小程序
pnpm dev:app                       # App（HBuilderX 真机运行或自定义基座）
```

## 发布构建

```bash
pnpm build:h5           # H5 → Nginx 托管
pnpm build:mp-weixin    # 微信小程序 → 开发者工具上传 → 提审
pnpm build:app          # App → HBuilderX 云打包
```

## 目录约定（《05-移动端uni-app创建与开发流程》）

- `src/pages/` 主包：仅登录 / 工作台 / 消息 / 我的等基座页面
- `src/pages-sub/` 业务模块分包（主包 ≤ 2M，新增业务页一律进分包）
- `src/pages-gen/` 代码生成器产物专属分包
- `src/api/` 接口封装（按域分文件，禁止页面内裸 `uni.request`）
- `src/utils/request.ts` 统一请求封装（Token 注入 / R 解包 / 401 跳登录 / 环境域名）
- `src/store/` Pinia（user / app）
- UI 组件只用 `wot-design-uni`（easycom 自动引入，`wd-*` 直接用）
