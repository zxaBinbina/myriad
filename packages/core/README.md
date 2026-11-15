# @zxabinbina/myriad-core

万象导航的共享数据模型、存储适配器、JSON 备份、日历、同步与公开内容解析逻辑。ESM 包，提供 TypeScript 声明，许可证 Apache-2.0。

```sh
npm install @zxabinbina/myriad-core
```

```ts
import { createLocalStorageAdapter, presetData } from '@zxabinbina/myriad-core'
const storage = createLocalStorageAdapter('my-site.myriad.')
await storage.set('myriad.data', presetData('zh-CN'))
```

存储适配器需要浏览器；纯数据处理可以在 Node.js 中导入。项目与完整部署说明：[myriad](https://github.com/zxaBinbina/myriad)。
