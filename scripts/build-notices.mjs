import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const visited = new Set()
const notices = []
function locate(name, directory) {
  while (true) {
    const path = join(directory, 'node_modules', name)
    if (existsSync(join(path, 'package.json'))) return path
    const parent = dirname(directory)
    if (parent === directory) throw new Error(`Missing runtime package: ${name}`)
    directory = parent
  }
}
function visit(name, directory) {
  if (name.startsWith('@zxabinbina/myriad-') || name.startsWith('@types/')) return
  const path = locate(name, directory)
  if (visited.has(path)) return
  visited.add(path)
  const pkg = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'))
  const licenses = readdirSync(path).filter((file) => /^(licen[cs]e|copying)(\.|$)/i.test(file))
  const fallback =
    pkg.name === '@wxt-dev/browser'
      ? readFileSync(resolve(root, 'docs/licenses/wxt-LICENSE'), 'utf8')
      : ''
  if (!licenses.length && !fallback)
    throw new Error(`Missing license for ${pkg.name}@${pkg.version}`)
  notices.push(
    `${pkg.name}@${pkg.version} (${pkg.license})\n${fallback || licenses.map((file) => readFileSync(join(path, file), 'utf8')).join('\n')}`,
  )
  for (const dependency of Object.keys(pkg.dependencies ?? {})) visit(dependency, path)
}
for (const workspace of ['packages/core', 'packages/ui', 'apps/extension']) {
  const directory = resolve(root, workspace)
  const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  for (const dependency of Object.keys(pkg.dependencies)) visit(dependency, directory)
}
// WXT's browser API wrapper is bundled into the extension at build time.
visit('@wxt-dev/browser', root)
const destination = resolve(root, 'apps/extension/public')
writeFileSync(join(destination, 'LICENSE'), readFileSync(resolve(root, 'LICENSE')))
writeFileSync(
  join(destination, 'THIRD_PARTY_NOTICES.txt'),
  `Third-party runtime dependencies of Myriad\n\n${notices.sort().join('\n\n' + '='.repeat(72) + '\n\n')}\n`,
)
console.log(`Generated notices for ${visited.size} runtime packages`)
