<p align="center"><img src="docs/logo.svg" width="96" height="96" alt="万象"></p>

# 万象 Myriad

> 你的上网起点，一页尽万象。

万象是一个替换浏览器新标签页的扩展：分组网格、文件夹、Dock、多引擎搜索、时钟与农历，配色和交互沿用 [zxabinbina.cc.cd](https://zxabinbina.cc.cd) 的设计语言。数据默认只存在本机，可随时导出为 JSON；也可以连接自己部署的后端 [myriad_api](https://github.com/zxaBinbina/myriad_api) 在多台设备之间同步。

> 目前处于 **M2 · 后端与同步** 阶段：天气 / 翻译 / 待办等小组件、热榜和聚合搜索会在后续版本加入。

## 功能

- **主题**：芙芙蓝 / 胡桃红两套配色 × 深色 / 浅色 / 跟随系统；首帧同步读取，无闪烁
- **背景**：纯色画布、自定义图片或视频壁纸（上传 / 链接；视频静音循环，后台自动暂停）、Bing 每日一图、每日随机风景（Picsum）、Unsplash 每日一图（需同步服务）；按「配色 × 明暗」四种组合分别设置，可调模糊、遮罩、亮度
- **分组**：顶部胶囊或左侧侧栏（可收起），滑动 / 淡入切换，支持滚轮切换和 `Alt+1…9`
- **网格**：拖动排序，把图标拖到一起合成文件夹；图标尺寸、圆角、名称显示可调；网格模式 / 极简模式（小组件收进仪表盘）
- **Dock**：所有分组共用，常驻 / 自动隐藏 / 隐藏，macOS 式放大或轻微上浮
- **图标回退链**：自建图标代理（连接同步服务时）或第三方 favicon 服务（Google / DuckDuckGo / icon.horse / 直连）→ 内置图标库（Simple Icons、Lucide）→ 上传图片 → 文字图标
- **搜索**：内置常用引擎，可添加自定义引擎（`%s`）；点击图标、前缀（如 `gh vue`）、Tab 三种切换方式；联想来自引擎接口、搜索历史和已有快捷方式
- **快捷键**：`\` 或 `/` 聚焦搜索，页面上直接打字进入搜索，`Esc` 清空，`Alt+,` 打开设置，均可自定义
- **时钟**：搜索框上方的数字时钟（可隐藏，只留日期），12 / 24 小时制，多时区；公历、星期、节日、第几天 / 第几周；中国用户默认显示农历、干支、节气与法定节假日
- **小组件**：日历（2×2 / 4×2 / 4×4，4×4 附近期节日与假期）、指针时钟
- **导入导出**：首次打开可从浏览器书签导入（勾选文件夹，顶层 → 分组，下一层 → 文件夹）；完整数据 JSON 导入导出，上传的图标和壁纸一并带走
- **中英双语**：默认跟随浏览器语言
- **同步**（连接 myriad_api）：基于 Yjs 的本地优先同步，断网照常使用、恢复后自动补传；同一浏览器的多个标签页即时互通；两台设备把同一项改成不同值时弹窗选择（可把某个设置设为「仅本机」）；同步范围可逐项改为只在本机生效；服务器每日备份，导入和回滚前自动多备份一份，可一键回滚

## 安装

尚未上架商店。从源码构建：

```bash
git clone https://github.com/zxaBinbina/myriad.git
cd myriad
npm install
npm run build        # 产出 apps/extension/.output/chrome-mv3 与 firefox-mv3
```

- **Chrome / Edge 等 Chromium 浏览器**：打开 `chrome://extensions`，开启「开发者模式」，点「加载已解压的扩展程序」，选择 `apps/extension/.output/chrome-mv3`。
- **Firefox**：打开 `about:debugging#/runtime/this-firefox`，「临时载入附加组件」，选择 `apps/extension/.output/firefox-mv3/manifest.json`。

### 权限

| 权限                                                             | 用途                    | 何时申请                     |
| ---------------------------------------------------------------- | ----------------------- | ---------------------------- |
| `storage`                                                        | 保存快捷方式与设置      | 安装时                       |
| 搜索联想接口的主机权限（Google、Bing、百度、DuckDuckGo、B 站）   | 搜索建议、Bing 每日壁纸 | 安装时                       |
| `bookmarks`                                                      | 导入书签                | 点「导入书签」时临时申请     |
| 同步服务地址的主机权限（如 `https://myriad.zxabinbina.cc.cd/*`） | 同步、备份、图标代理    | 点「连接」时只申请这一个来源 |

### 同步

1. 部署后端：见 [myriad_api](https://github.com/zxaBinbina/myriad_api) 的说明（Cloudflare Worker + D1 / KV / R2，Access 鉴权）。
2. 在 Cloudflare Zero Trust 里创建一个 Service Token。
3. 扩展里打开 设置 →「同步」，填服务地址和 Service Token 的 Client ID / Secret，点「连接」并允许访问该地址。

如果云端已经有其他设备的数据，连接时会询问用云端数据还是上传本机数据（上传前会在服务器备份一份）。Service Token 只保存在本机，不会出现在导出文件里，也不会同步。

### 新标签页的焦点

Chrome 打开扩展的新标签页时，键盘焦点留在地址栏，直接打字会输入到地址栏里。设置 →「搜索」里的 **打开新标签页时聚焦搜索框**（默认关闭）会让页面重新加载一次以取得焦点，这样直接打字就能进入搜索框；代价是地址栏会显示扩展地址。

## 开发

需要 Node.js 22 以上。

| 命令                            | 说明                                                      |
| ------------------------------- | --------------------------------------------------------- |
| `npm run dev`                   | 启动 WXT 开发模式（Chromium，热更新）                     |
| `npm run dev:firefox`           | Firefox 开发模式                                          |
| `npm run dev:web`               | 在普通网页里运行界面（localStorage 存储），调试样式最方便 |
| `npm run build` / `npm run zip` | 构建 / 打包 Chrome 与 Firefox 两个版本                    |
| `npm run typecheck`             | 全部工作区类型检查                                        |
| `npm test`                      | 单元测试（Vitest）                                        |
| `npm run format`                | Prettier 格式化                                           |

浏览器测试脚本（需要 Python 版 Playwright）：

```bash
npm run build:web && npm run preview -w @myriad/playground -- --port 4180 &
python3 scripts/check-ui.py          # 网页版主要交互，截图存到 artifacts/

python3 -m playwright install chromium
python3 scripts/check-extension.py   # 在真实扩展环境加载新标签页
```

### 与后端本地联调

```bash
# 在 myriad_api 仓库
cp .dev.vars.example .dev.vars   # 开启 DEV_AUTH_BYPASS，只对 localhost 生效
npm run dev                      # http://127.0.0.1:8787

# 在本仓库
npm run dev:web                  # 设置 →「同步」，服务地址填 http://127.0.0.1:8787，点「连接」
```

用浏览器的两个独立配置（或无痕窗口）各开一个页面，就能模拟两台设备。

### 目录结构

```
packages/
  core/         # @myriad/core：数据模型、存储接口、导入导出、书签转换、搜索引擎、农历与节假日、同步引擎（sync/）
  ui/           # @myriad/ui：Vue 3 组件（MyriadApp 入口）、状态、主题样式、i18n
apps/
  extension/    # WXT 扩展：新标签页入口、chrome.storage 适配、书签权限
  playground/   # 网页版预览，用于开发与浏览器测试
docs/           # Logo（SVG 与 512px PNG）
scripts/        # Playwright 冒烟测试
```

`@myriad/ui` 不直接访问浏览器扩展 API，而是通过 `MyriadPlatform` 接口（存储、书签、版本号等）由宿主注入，因此同一套界面可以跑在扩展、网页和之后的个人主页 `/myriad` 中。

## 许可证

[Apache License 2.0](LICENSE)
