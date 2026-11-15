# @zxabinbina/myriad-ui

万象导航的 Vue 3 界面，包含快捷方式、分组、网格、Dock、搜索和小组件。ESM 与 TypeScript 声明，Vue 3.5 为 peer dependency，许可证 Apache-2.0。

```sh
npm install vue @zxabinbina/myriad-core @zxabinbina/myriad-ui
```

```vue
<script setup lang="ts">
import { MyriadApp, type MyriadPlatform } from '@zxabinbina/myriad-ui'
import { createLocalStorageAdapter } from '@zxabinbina/myriad-core'
import '@zxabinbina/myriad-ui/style.css'
const platform: MyriadPlatform = {
  kind: 'web',
  guest: true,
  embedded: true,
  version: '0.1.0',
  storage: createLocalStorageAdapter('my-site.myriad.visitor.'),
  // 可选，自部署 Worker 的公开免费接口；不在这里配置个人令牌。
  publicApiBase: 'https://your-worker.example',
}
</script>
<template><MyriadApp :platform="platform" /></template>
```

`guest` 禁止个人同步、私有搜索、AI 摘要与服务密钥；`embedded` 将主题和语言限制在组件内。可通过 `theme` 适配器与宿主配色同步，通过 `navigate` 接入宿主路由。`ready` 事件表示本机数据完成加载。组件卸载会清理监听与定时器并保存待写入的数据。

支持现代桌面浏览器，网站宿主负责手机提示页。样式作用于 `.myriad`；详细说明：[myriad](https://github.com/zxaBinbina/myriad)。
