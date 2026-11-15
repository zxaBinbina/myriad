// Verify actual npm archives in a consumer outside the monorepo and its aliases.
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const consumer = mkdtempSync(resolve(tmpdir(), 'myriad-package-consumer-'))
const run = (command, args) => execFileSync(command, args, { cwd: consumer, stdio: 'inherit' })
try {
  const archive = (name) => {
    const pkg = JSON.parse(readFileSync(resolve(root, `packages/${name}/package.json`), 'utf8'))
    return resolve(root, `artifacts/packages/${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`)
  }
  const core = archive('core')
  const ui = archive('ui')
  writeFileSync(
    resolve(consumer, 'package.json'),
    JSON.stringify({ type: 'module', private: true }),
  )
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', core, ui, 'vue@^3.5.22'])
  writeFileSync(
    resolve(consumer, 'probe.mjs'),
    `import { presetData, createMemoryAdapter } from '@zxabinbina/myriad-core';
const data = presetData('zh-CN'); if (!data.groups.length) throw new Error('Empty preset');
const storage = createMemoryAdapter(); await storage.set('data',data); if (!(await storage.get('data')).groups.length) throw new Error('Storage failed');
console.log('PASS core ESM import and memory storage');`,
  )
  run('node', ['probe.mjs'])
  writeFileSync(
    resolve(consumer, 'index.html'),
    '<div id="app"></div><script type="module" src="/main.ts"></script>',
  )
  writeFileSync(
    resolve(consumer, 'main.ts'),
    `import { createApp } from 'vue';
import { MyriadApp, type MyriadPlatform } from '@zxabinbina/myriad-ui';
import { createLocalStorageAdapter } from '@zxabinbina/myriad-core';
import '@zxabinbina/myriad-ui/style.css';
const platform: MyriadPlatform = {kind:'web',guest:true,embedded:true,version:'0.1.0',storage:createLocalStorageAdapter('consumer.')};
createApp(MyriadApp,{platform}).mount('#app');`,
  )
  run('node', [
    resolve(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit',
    '--strict',
    '--skipLibCheck',
    '--module',
    'ESNext',
    '--moduleResolution',
    'Bundler',
    '--target',
    'ES2022',
    '--lib',
    'ES2023,DOM,DOM.Iterable',
    'main.ts',
  ])
  run('node', [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--logLevel', 'warn'])
  const lock = JSON.parse(readFileSync(resolve(consumer, 'package-lock.json'), 'utf8'))
  for (const name of ['core', 'ui']) {
    const pkg = lock.packages[`node_modules/@zxabinbina/myriad-${name}`]
    if (pkg.link || !pkg.resolved.endsWith('.tgz'))
      throw new Error('Package archive was not installed')
  }
  console.log('PASS packed UI declarations, CSS and Vue consumer build; no workspace links')
} finally {
  rmSync(consumer, { recursive: true, force: true })
}
