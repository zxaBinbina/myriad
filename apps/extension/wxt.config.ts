import { defineConfig } from 'wxt'
import { fileURLToPath } from 'node:url'

// storage 与定位必需；Chrome 不支持把 geolocation 声明为可选权限。
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifestVersion: 3,
  zip: { name: 'myriad', zipSources: false },
  vite: () => ({
    resolve: {
      alias: [
        {
          find: /^@zxabinbina\/myriad-core$/,
          replacement: fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
        },
        {
          find: /^@zxabinbina\/myriad-ui$/,
          replacement: fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)),
        },
        {
          find: '@zxabinbina/myriad-ui/style.css',
          replacement: fileURLToPath(
            new URL('../../packages/ui/src/styles/index.css', import.meta.url),
          ),
        },
      ],
    },
  }),
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'zh_CN',
    permissions: ['storage', 'geolocation'],
    optional_permissions: [
      'bookmarks',
      'notifications',
      'alarms',
      'declarativeNetRequestWithHostAccess',
      'scripting',
      'webNavigation',
    ],
    // 同步服务（myriad_api）地址可自定义：连接时只申请用户填写的那个来源
    optional_host_permissions: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
    // 搜索联想与 Bing 壁纸在主动点击授权后使用上述可选主机权限。
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'myriad@zxabinbina.cc.cd',
              strict_min_version: '128.0',
              // 万象不收集任何用户数据（Firefox 自 2025-11 起要求声明）
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
})
