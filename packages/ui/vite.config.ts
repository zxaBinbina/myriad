import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
export default defineConfig({
  plugins: [vue()],
  build: {
    target: 'es2022',
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
      cssFileName: 'style',
    },
    rolldownOptions: {
      external: (id) =>
        ['vue', ...Object.keys(pkg.dependencies)].some(
          (name) => id === name || id.startsWith(name + '/'),
        ),
    },
  },
})
