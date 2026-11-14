import { createLocalStorageAdapter } from '@myriad/core'
import { MyriadApp, type MyriadPlatform } from '@myriad/ui'
import { createApp } from 'vue'
import { webReminders } from './reminders'
import '../../extension/entrypoints/newtab/page.css'

// 网页环境：localStorage 存储，没有书签与地址栏焦点能力
const platform: MyriadPlatform = {
  kind: 'web',
  storage: createLocalStorageAdapter(),
  reminders: webReminders(),
  version: '0.1.0-dev',
  repoUrl: 'https://github.com/zxaBinbina/myriad',
  location: {
    locate: () =>
      new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
          reject,
          { timeout: 10000, maximumAge: 300000 },
        ),
      ),
  },
}

createApp(MyriadApp, { platform }).mount('#app')
