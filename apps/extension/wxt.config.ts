import { defineConfig } from 'wxt'

// 万象扩展配置。权限保持最少：storage 必需，其余用到时再申请。
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'zh_CN',
    permissions: ['storage'],
    optional_permissions: ['bookmarks'],
    // 同步服务（myriad_api）地址可自定义：连接时只申请用户填写的那个来源
    optional_host_permissions: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
    // 搜索联想与每日壁纸接口不支持跨域，需要主机权限
    host_permissions: [
      'https://suggestqueries.google.com/*',
      'https://api.bing.com/*',
      'https://www.bing.com/*',
      'https://suggestion.baidu.com/*',
      'https://duckduckgo.com/*',
      'https://s.search.bilibili.com/*',
    ],
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
