# 万象 myriad 仓库 · 协作说明

跨仓库的需求、里程碑和进度见上一级目录的 `../AGENTS.md`（不在本仓库中，本文件只记录本仓库内的约定）。面向使用者的说明见 [README.md](README.md)。

## 结构

| 工作区            | 包名                 | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`   | `@myriad/core`       | 纯 TypeScript，无 Vue / 浏览器扩展依赖：类型（`types.ts`）、默认值与预设（`defaults.ts`）、数据操作（`model.ts`）、存储接口（`storage.ts`）、JSON 导入导出（`io.ts`）、书签转换（`bookmarks.ts`）、搜索引擎（`engines.ts`）、图标回退（`icons.ts`）、快捷键解析（`keys.ts`）、农历 / 节气 / 节假日（`calendar/`）、同步（`sync/`：JSON↔Yjs 映射与三方冲突比较 `yjson.ts`、引擎 `engine.ts`、myriad_api 客户端 `api.ts`、同步范围 `scopes.ts`） |
| `packages/ui`     | `@myriad/ui`         | Vue 3 界面，入口组件 `MyriadApp`；状态在 `state/`（`store.ts` 响应式单例 + 持久化，`actions.ts` 增删改，`drag.ts` 拖拽，`sync.ts` 同步控制器，`syncLabels.ts` 设置项文案），样式在 `styles/`，文案在 `i18n/`                                                                                                                                                                                                                                   |
| `apps/extension`  | `@myriad/extension`  | WXT 扩展，只负责实现 `MyriadPlatform`（chrome.storage、书签权限、焦点抢夺）并挂载 `MyriadApp`                                                                                                                                                                                                                                                                                                                                                  |
| `apps/playground` | `@myriad/playground` | 网页版宿主（localStorage），用于开发预览和 `scripts/check-ui.py`                                                                                                                                                                                                                                                                                                                                                                               |

npm 正式包名计划为 `@zxabinbina/myriad-core` / `@zxabinbina/myriad-ui`，在 M5 发布时再改名；现在工作区内部统一用 `@myriad/*`，包直接导出 `src/*.ts` 源码，不单独构建。

## 约定

- **平台无关**：`packages/ui` 不得直接调用 `browser.*` / `chrome.*`。需要宿主能力时扩展 `packages/ui/src/platform.ts` 中的 `MyriadPlatform`，并在扩展和 playground 两边各自实现（网页版不支持的能力设为可选并做降级）。
- **数据结构**：持久化数据分三块，键名见 `STORAGE_KEYS`：`myriad.data`（分组 / 快捷方式 / 文件夹 / 小组件，将来同步）、`myriad.settings`（设置，将来同步）、`myriad.local`（当前分组、搜索历史、图标缓存等仅本机状态）。改动结构时提升 `schema` 并在 `load*` 里做迁移，旧数据必须能读。
- **双语**：所有界面文案放在 `i18n/zh-CN.ts`，`en.ts` 由 `Messages` 类型约束必须同步补齐。
- **样式**：沿用 homepage 的语义 CSS 变量（`--bg`、`--panel`、`--text`、`--muted`、`--blue`（强调色）、`--border` …），定义在 `styles/theme.css`，按 `data-palette` × `data-theme` 切换。组件类名用 `m-` 前缀 + BEM。尊重 `prefers-reduced-motion` 与设置里的「减少动态效果」。
- **首帧主题**：`store.ts` 把配色与明暗写入 `localStorage['myriad-boot']`，扩展和 playground 各自的 `public/theme-init.js` 在样式加载前同步读取，避免闪烁。改主题相关逻辑时三处一起改。
- **小组件**：在 `components/widgets/registry.ts` 注册（图标、可选尺寸、异步组件），`WidgetKind` 在 core 的 `types.ts` 里扩充。组件只在可见时拉数据。
- **权限**：支持动态申请的权限做成可选，用到时通过 `browser.permissions.request` 申请。`storage` 与 `geolocation` 必需；Chrome 不支持将定位权限声明为可选（[官方限制](https://developer.chrome.com/docs/extensions/reference/api/permissions#step_2_declare_optional_permissions_in_the_manifest)），定位只在用户点击时调用，不对它使用 `permissions.request`。
- **格式**：Prettier（无分号、单引号、行宽 100）。
- **同步**：分组 / 条目 / Dock（`data`）、参与同步的设置键（`settings`）、搜索历史（`history`）三个分区写入同一个 Yjs 文档。store 每次写存储前通过 `onPersist` 钩子把修改写进文档（`reconcile*` 只写变化部分）并广播给其他标签页，然后才写存储，这样其他标签页先收到 Yjs 更新、不会产生重复操作；远端修改由 `applyRemote` 写回 store。新增设置项不用改同步代码，但新增顶层设置键要放进 `SETTINGS_SCOPES` 的某个范围，否则不会同步。时间戳（`updatedAt`）不进文档。
- **同步配置**（`LocalState.sync`，含独立连接令牌或 Service Token）只存本机，不导出、不同步。store 加载时会整体替换 `local.sync` 等嵌套对象，组件里不要缓存这些对象的引用，用 `computed(() => store.local.sync)`。
- **Logo**：源文件在 `docs/logo.svg`（只有图形，不含文字），扩展图标 `apps/extension/public/icon/*.png` 由它导出（`magick -background none -density 600 docs/logo.svg -resize 128x128 …`），改 Logo 时一起重新生成。
- **scoped 样式里的 `:global()`**：必须把整个选择器包进去，写成 `:global(.myriad.has-wallpaper .m-foo)`。写成 `:global(.myriad.has-wallpaper) .m-foo` 时 Vue 会丢掉后半段，规则会作用到整个页面（曾导致关闭图标名称后整页 `display: none`）。

## 验证

改动后至少运行：

```bash
npm run typecheck && npm test && npm run build
```

涉及界面交互时再跑 `scripts/check-ui.py`（见 README）。`scripts/check-extension.py` 需要 Playwright 自带的 Chromium（品牌版 Chrome 不支持 `--load-extension`）；本机目前下载不到，暂时由用户手动加载扩展验证。

## 已知问题 / 待办

- **2026-11-14 Dock 背景调整**：按用户新要求，放大模式的背景只沿 X 轴扩展（translateX + scaleX），上下边界保持固定，格子坐标不变。取消原有 top 增长与位置属性动画，保留减弱动态效果与离开复原；`check-ui.py` 分别验证首个、中间、末个图标的横向包覆和固定高度。
- **M3 首批（2026-11-14）**：天气 / 一言 / 倒数日已接入 registry 和组件设置（`WidgetEditor.vue`）。类型与日期 / 上游解析在 `core/src/widgets.ts`，扩充 `WidgetKind`，配置仍使用现有 `WidgetItem.config`，无需改动存储外层格式。已有数据不自动加组件。网络缓存保存在 `myriad.cache.widget.*`，不进入同步；一言收藏保存在对应组件配置中，参与现有同步与导出。
- `useVisibleResource` 同时检查当前分组、视口、极简仪表盘与标签页前台；隐藏中止请求。Web Locks 对缓存键串行化，多实例 / 多标签页不会重复获取当天一言。定位与新增主机权限通过 `MyriadPlatform`：定位只在点击时读取位置，新增主机权限只在点击时申请。
- **2026-11-14 定位权限警告修复**：将 `geolocation` 从 `optional_permissions` 移到 `permissions`，去掉扩展宿主中的无效动态申请，直接在点击定位时调用 Geolocation API。避免 Chrome 忽略声明而同时导致定位失败；其余可选权限不变。
- **2026-11-14 倒数日文字精简**：大数字下不再重复显示「还有 N 天 / 已过去 N 天」；当天保留「就在今天」，底部日期、开服天数及待办联动保持原有显示。
- **2026-11-14 Minecraft 备选查询**：状态接口失败或 Minecraft 状态未知时，按 `servers[].fallbackKind`（Java / 基岩 / 关闭，旧配置默认 Java）查询所填地址；明确离线不回退。支持独立或嵌套 Minecraft JSON，不要求 `services` / `overall`；网站监控仍验证完整格式，两组件共享新的原始 JSON 缓存。备选类型、Worker 地址参与组件缓存键；查询失败不伪造离线，隐藏取消时不启动备选。无需更改外层 schema，不自动新增组件或历史。
- **2026-11-14 待办入口调整**：添加任务按钮移到 `WidgetHeader` 右侧，以加号打开任务详情表单，仅在已解锁的待办视图显示；后续按用户反馈移除重复的快速输入，保留单一添加入口。表单通过实例唯一 ID 与页脚 submit 按钮关联，名称输入后可回车保存，无需填写日期等选项；保留 `@submit.prevent` 与既有数据校验。
- **M3 第二批（2026-11-14）**：新增网站监控 / Minecraft / 汇率，配置解析与 MOTD / 历史处理在 `core/src/widgets/`，组件设置复用 `AdvancedWidgetSettings.vue`。按用户要求去掉组件编号英文小标签。监控与默认 Minecraft 共用状态源缓存，监控不轮询或因切回前台重新获取；手动刷新也遵守 `refreshAfterMs`。自定义 Minecraft 的历史只读用户配置接口，未配置则隐藏；不记录历史。Java 版 Worker SLP 连接失败退回 mcstatus.io（Cloudflare TCP 不允许连接部分托管地址），组件网络超时 20 秒，以容纳两次尝试。汇率历史主源失败后按五天取样，历史查询不得使用今天的备用报价。
- **M3 第三批（2026-11-14）**：待办 / Markdown 便签、共享清单、重复任务、提醒及日历 / 倒数日联动、可选端到端加密完成。`MyriadData.schema` 升到 2，新增 `lists` 表，旧数据迁移为空表；合并导入统一重映射清单和组件引用。每个清单的标题、便签和任务分别是 JSON 字符串或原子密文字符串（避免 Yjs 分开合并 IV / ciphertext），AES-GCM AAD 绑定 keyId 与字段 ID。控制器 `state/memo.ts` 只在内存解密，编辑提交前检查字段原值，模式切换创建新清单并一次更新共享引用。旧云端明文历史 / 备份不自动清除，界面及 README 明示。
- 密钥通过 `MyriadPlatform.secrets` 独立存储，扩展是 `chrome.storage.sync`，网页是本机 storage；不进入普通导出或 Yjs。随机密钥或 PBKDF2-SHA256 600,000 次口令派生，密钥文件独立导入导出。`MarkdownText` 原生 `setHTML` + 按需 DOMPurify 回退，保留允许的节点而不重新序列化；禁用原始输入，移除远程图片 / 脚本 / 事件属性。
- 提醒经 `MyriadPlatform.reminders`，扩展可选申请 notifications + alarms；后台保存任务 / 已发送记录，启动和授权后恢复，更新串行执行，完成 / 删除撤销，记录 30 天内的已发送 ID。网页仅在打开时计时，Web Locks 防止同源标签页重复通知。任务提醒按主时钟时区，无时间用 09:00；拒权保留高亮。重复任务的后续 ID 由系列与日期确定，编辑日期 / 重复方式重置锚点。
- **M3 第四批（2026-11-14）**：翻译组件完成。core `widgets/translation.ts` 提供配置白名单、官方 API 参数与签名、语言映射、结果解析；百度 MD5 使用小型 `js-md5`，有道 v3 / 腾讯 TC3 使用 Web Crypto，腾讯签名有独立固定向量验证。本机 Key 放 `myriad.translation.credentials.<widgetId>`（宿主本机 storage），不得放组件 config / Yjs / secrets(storage.sync)；OpenAI Key 绑定完整端点，配置地址改变后禁止静默复用。请求均 POST、禁止重定向，文字和结果只在内存中。
- 翻译采用原生表单和实例唯一标签 ID，Ctrl / Cmd + Enter 检查 IME 并走 `requestSubmit()`；普通 Enter 换行。普通服务并行，各自保留结果 / 错误；大模型单独模式。`useWidgetVisibility` 从资源 composable 抽出共用，隐藏取消和代次检查不得删除。搜索 `google-translate` 保留 ID、显示名改为「翻译」，只导流到已有 / 必要时新增组件，不自动发送、不写历史。
- Worker 翻译使用 `createApi.translate`，必须带用户鉴权，不能走仅供公开来源的 `widgetJson`。默认 m2m100 明确语言（不支持 auto），可选服务端 DeepL / Microsoft；绑定均可选。
- M3 后续：和风天气 / 预警、倒数日农历 / 法定假期 / 独立事件提醒、GitHub；尚未完成整个阶段。

- 搜索联想与 Bing 壁纸所需的主机权限目前写在 `host_permissions`（安装时授予），与需求中「可选权限」的约定不一致，后续可改为 `optional_host_permissions` 并在首次使用时申请。
- 新标签页焦点：采用「重新加载自身」方案，默认关闭（设置 → 打开新标签页时聚焦搜索框）。
- `simple-icons` 整包约 5MB，打进扩展后体积较大；可考虑按需加载或只保留常用图标。
- 浏览器回归用 `scripts/check-ui.py`（含 Dock 放大包覆）、`scripts/check-widgets.py`（组件设置、每日缓存、跨日、可见性）、`scripts/check-services.py`（监控 / Minecraft / 汇率及备用历史）、`scripts/check-minecraft.py`（仅地址、独立 JSON、接口失败 / 未知备选、明确离线、版本切换缓存、取消）、`scripts/check-memo.py`（共享清单、循环、权限拒绝 / 通知、原生 Sanitizer / DOMPurify、独立上下文密钥与口令解锁）、`scripts/check-sync.py`（两个隔离页面联调本地 Worker）。后台提醒测试单独放在扩展 `test/`，不要从纯 core 测试导入扩展 / UI 平台类型。
- M2 联调时出现过一次 `myriad.local` 写入落后于内存（`lastSync` 旧了几分钟），没能重现；已给持久化钩子加 try/catch，后续留意。
- 2026-11-14：已支持独立连接令牌（默认）及可选 Access 鉴权，`LocalState.schema` 为 2，`loadLocalState` 迁移旧 Access 凭据。原令牌只存本机，不导出、不写入 Yjs。服务的 D1 文件上限由 `features.blobMaxBytes` 返回并显示在同步页。
- 网站版（M5）选择 Access 并通过 Cookie 访问私有接口时，需要在 Access 应用里开启「绕过 OPTIONS 预检」，并在 Worker 的 `ALLOWED_ORIGINS` 里列出主页来源。
