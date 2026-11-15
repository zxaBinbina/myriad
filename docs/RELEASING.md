# 构建与发布

使用 Node.js 22.12 以上和仓库锁文件。源码构建可执行 `npm ci`、`npm run typecheck`、`npm test` 与 `npm run build`。Chrome / Firefox 分别输出到 `apps/extension/.output/chrome-mv3` 和 `firefox-mv3`。浏览器检查使用 Python Playwright 与支持 CDP 扩展加载的 Chrome。

## 版本与 npm 包

扩展版本由 `apps/extension/package.json` 控制，标签必须是对应的 `vX.Y.Z`。共享包按各自改动独立发布；本次 core 保持 `0.1.0`，UI 与扩展为 `0.1.1`。更新共享包版本时同时更新应用的依赖与 `package-lock.json`。

```bash
npm run build:packages
mkdir -p artifacts/packages
npm pack ./packages/core --ignore-scripts --pack-destination artifacts/packages
npm pack ./packages/ui --ignore-scripts --pack-destination artifacts/packages
node scripts/check-packages.mjs
```

检查器在仓库外的新消费项目安装真实压缩包，验证 ESM、声明、CSS 与 Vue 构建。只发布有变化的包，例如 `npm publish artifacts/packages/zxabinbina-myriad-ui-0.1.1.tgz --access public`；npm 网页验证在本机完成，CI 不保存 npm 凭据。发布后让网站使用正式 npm 版本并更新锁文件，再部署；不推送 `file:` 引用。

## GitHub Release

`.github/workflows/ci.yml` 在主分支、Pull Request 与版本标签上执行：干净安装、类型检查、单元测试、库 / 网页 / 两个扩展构建、真实包消费、四种主题样式、独立 Chrome 加载与授权拒绝 / 成功回归。

```bash
npm run zip
python3 scripts/check-release.py
```

`zip` 先生成项目许可证与运行时依赖声明，再打包；不包含源码压缩包、本机配置、开发产物或 source maps。检查器验证两个 zip 的入口、权限、版本与主题 CSS，生成 `apps/extension/.output/SHA256SUMS`。Firefox MV3 仍使用后台事件页；Chromium 使用 service worker。

检查通过并提交后推送主分支，再创建并推送版本标签。标签检查成功才创建正式 Release，附件为 `myriad-X.Y.Z-chrome.zip`、`myriad-X.Y.Z-firefox.zip` 和 `SHA256SUMS`。失败的检查不会发布。Actions 只在发布任务授予 `contents: write`；普通验证为只读权限。

下载后可在同一目录运行 `sha256sum --check SHA256SUMS` 验证附件。Chrome 解压到固定目录，从 `chrome://extensions` 加载；后续覆盖该目录并点击扩展「重新加载」，不要卸载，以保留本机数据。Firefox 未签名包从 `about:debugging` 临时加载，重启后需重新加载；本项目不进行商店发布。

## 后端与网站

后端独立仓库 [myriad_api](https://github.com/zxaBinbina/myriad_api) 提供只读 CI 和 [自部署指南](https://github.com/zxaBinbina/myriad_api/blob/main/docs/SELF_HOSTING.md)，不由本仓库的 Release 修改生产资源。生产更新使用已有 `wrangler.local.toml` 与原连接令牌。

个人网站仓库使用公共 npm 包、Cloudflare Pages Git 集成、构建命令 `npm run build` 与输出 `dist`。同步万象改动到当前新版 `homepage` 后验证构建、`scripts/check-myriad.py` 与共享导航 / 主题 / 加载 / 分享 / SEO 回归，再推送部署分支。发布后检查 HTTPS `/myriad`、资源加载与公开 API；网站只提供访客模式。
