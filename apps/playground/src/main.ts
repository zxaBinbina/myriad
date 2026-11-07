import { createLocalStorageAdapter } from '@myriad/core'
import { MyriadApp, type MyriadPlatform } from '@myriad/ui'
import { createApp } from 'vue'
import '../../extension/entrypoints/newtab/page.css'

// 网页环境：localStorage 存储，没有书签与地址栏焦点能力
const platform: MyriadPlatform = {
  kind: 'web',
  storage: createLocalStorageAdapter(),
  version: '0.1.0-dev',
  repoUrl: 'https://github.com/zxaBinbina/myriad',
}

createApp(MyriadApp, { platform }).mount('#app')
