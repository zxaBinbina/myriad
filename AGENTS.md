# 万象 myriad 仓库 · 协作说明

跨仓库的需求、里程碑和进度见上一级目录的 `../AGENTS.md`（不在本仓库中，本文件只记录本仓库内的约定）。面向使用者的说明见 [README.md](README.md)。

## 结构

| 工作区            | 包名                 | 说明                                                                                                                                                                                                                                                                                                              |
| ----------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`   | `@myriad/core`       | 纯 TypeScript，无 Vue / 浏览器扩展依赖：类型（`types.ts`）、默认值与预设（`defaults.ts`）、数据操作（`model.ts`）、存储接口（`storage.ts`）、JSON 导入导出（`io.ts`）、书签转换（`bookmarks.ts`）、搜索引擎（`engines.ts`）、图标回退（`icons.ts`）、快捷键解析（`keys.ts`）、农历 / 节气 / 节假日（`calendar/`） |
| `packages/ui`     | `@myriad/ui`         | Vue 3 界面，入口组件 `MyriadApp`；状态在 `state/`（`store.ts` 响应式单例 + 持久化，`actions.ts` 增删改，`drag.ts` 拖拽），样式在 `styles/`，文案在 `i18n/`                                                                                                                                                        |
| `apps/extension`  | `@myriad/extension`  | WXT 扩展，只负责实现 `MyriadPlatform`（chrome.storage、书签权限、焦点抢夺）并挂载 `MyriadApp`                                                                                                                                                                                                                     |
| `apps/playground` | `@myriad/playground` | 网页版宿主（localStorage），用于开发预览和 `scripts/check-ui.py`                                                                                                                                                                                                                                                  |

npm 正式包名计划为 `@zxabinbina/myriad-core` / `@zxabinbina/myriad-ui`，在 M5 发布时再改名；现在工作区内部统一用 `@myriad/*`，包直接导出 `src/*.ts` 源码，不单独构建。

## 约定

- **平台无关**：`packages/ui` 不得直接调用 `browser.*` / `chrome.*`。需要宿主能力时扩展 `packages/ui/src/platform.ts` 中的 `MyriadPlatform`，并在扩展和 playground 两边各自实现（网页版不支持的能力设为可选并做降级）。
- **数据结构**：持久化数据分三块，键名见 `STORAGE_KEYS`：`myriad.data`（分组 / 快捷方式 / 文件夹 / 小组件，将来同步）、`myriad.settings`（设置，将来同步）、`myriad.local`（当前分组、搜索历史、图标缓存等仅本机状态）。改动结构时提升 `schema` 并在 `load*` 里做迁移，旧数据必须能读。
- **双语**：所有界面文案放在 `i18n/zh-CN.ts`，`en.ts` 由 `Messages` 类型约束必须同步补齐。
- **样式**：沿用 homepage 的语义 CSS 变量（`--bg`、`--panel`、`--text`、`--muted`、`--blue`（强调色）、`--border` …），定义在 `styles/theme.css`，按 `data-palette` × `data-theme` 切换。组件类名用 `m-` 前缀 + BEM。尊重 `prefers-reduced-motion` 与设置里的「减少动态效果」。
- **首帧主题**：`store.ts` 把配色与明暗写入 `localStorage['myriad-boot']`，扩展和 playground 各自的 `public/theme-init.js` 在样式加载前同步读取，避免闪烁。改主题相关逻辑时三处一起改。
- **小组件**：在 `components/widgets/registry.ts` 注册（图标、可选尺寸、异步组件），`WidgetKind` 在 core 的 `types.ts` 里扩充。组件只在可见时拉数据。
- **权限**：`storage` 之外的权限一律做成可选，用到时通过 `browser.permissions.request` 申请。
- **格式**：Prettier（无分号、单引号、行宽 100）。
- **scoped 样式里的 `:global()`**：必须把整个选择器包进去，写成 `:global(.myriad.has-wallpaper .m-foo)`。写成 `:global(.myriad.has-wallpaper) .m-foo` 时 Vue 会丢掉后半段，规则会作用到整个页面（曾导致关闭图标名称后整页 `display: none`）。

## 验证

改动后至少运行：

```bash
npm run typecheck && npm test && npm run build
```

涉及界面交互时再跑 `scripts/check-ui.py`（见 README）。`scripts/check-extension.py` 需要 Playwright 自带的 Chromium（品牌版 Chrome 不支持 `--load-extension`）；本机目前下载不到，暂时由用户手动加载扩展验证。

## 已知问题 / 待办

- 搜索联想与 Bing 壁纸所需的主机权限目前写在 `host_permissions`（安装时授予），与需求中「可选权限」的约定不一致，后续可改为 `optional_host_permissions` 并在首次使用时申请。
- 新标签页焦点：采用「重新加载自身」方案，默认关闭（设置 → 打开新标签页时聚焦搜索框）。
- `simple-icons` 整包约 5MB，打进扩展后体积较大；可考虑按需加载或只保留常用图标。
