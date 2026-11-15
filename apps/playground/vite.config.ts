import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
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
  server: { port: 5180 },
  preview: { port: 4180 },
})
