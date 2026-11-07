import type { LibraryIcon } from '@myriad/core'

export interface BrandEntry {
  slug: string
  title: string
  path: string
  hex: string
}

export interface LucideEntry {
  name: string
  nodes: [string, Record<string, string | number>][]
}

let brandsPromise: Promise<Map<string, BrandEntry>> | null = null
let lucidePromise: Promise<LucideEntry[]> | null = null

/** 按需加载 simple-icons（约 5 MB，单独分包，只在需要时下载） */
export function loadBrands(): Promise<Map<string, BrandEntry>> {
  brandsPromise ??= import('simple-icons').then((mod) => {
    const map = new Map<string, BrandEntry>()
    for (const v of Object.values(mod) as unknown[]) {
      const icon = v as Partial<BrandEntry> | null
      if (icon && typeof icon.slug === 'string' && typeof icon.path === 'string') {
        map.set(icon.slug, {
          slug: icon.slug,
          title: icon.title ?? icon.slug,
          path: icon.path,
          hex: icon.hex ?? '',
        })
      }
    }
    return map
  })
  return brandsPromise
}

const kebab = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])([0-9])/g, '$1-$2')
    .toLowerCase()

export function loadLucide(): Promise<LucideEntry[]> {
  lucidePromise ??= import('lucide').then((mod) =>
    Object.entries(mod.icons as Record<string, LucideEntry['nodes']>).map(([name, nodes]) => ({
      name: kebab(name),
      nodes,
    })),
  )
  return lucidePromise
}

export function brandToIcon(b: BrandEntry): LibraryIcon {
  return { set: 'simple-icons', name: b.slug, path: b.path, color: b.hex }
}

export function lucideToIcon(l: LucideEntry): LibraryIcon {
  return { set: 'lucide', name: l.name, nodes: l.nodes }
}

/** 按 slug 候选查找品牌图标 */
export async function matchBrand(candidates: string[]): Promise<BrandEntry | null> {
  if (!candidates.length) return null
  const brands = await loadBrands()
  for (const c of candidates) {
    const hit = brands.get(c)
    if (hit) return hit
  }
  return null
}

const GENERAL_DEFAULTS = [
  'house',
  'star',
  'heart',
  'globe',
  'code-xml',
  'terminal',
  'book-open',
  'music',
  'video',
  'image',
  'mail',
  'message-circle',
  'shopping-cart',
  'gamepad-2',
  'newspaper',
  'cloud',
  'calendar',
  'map',
  'graduation-cap',
  'briefcase',
  'pickaxe',
  'bot',
  'languages',
  'wrench',
]

function score(text: string, q: string): number {
  if (text === q) return 0
  if (text.startsWith(q)) return 1
  if (text.includes(q)) return 2
  return -1
}

export async function searchLibrary(
  query: string,
  limit = 60,
): Promise<{ brands: BrandEntry[]; general: LucideEntry[] }> {
  const q = query.trim().toLowerCase().replace(/\s+/g, '')
  const [brands, lucide] = await Promise.all([loadBrands(), loadLucide()])
  if (!q) {
    const popular = [
      'github',
      'bilibili',
      'youtube',
      'google',
      'wechat',
      'zhihu',
      'x',
      'telegram',
      'discord',
      'steam',
      'spotify',
      'notion',
      'figma',
      'npm',
      'vuedotjs',
      'cloudflare',
      'openai',
      'claude',
      'minecraft',
      'netflix',
    ]
    return {
      brands: popular.map((s) => brands.get(s)).filter((b): b is BrandEntry => !!b),
      general: lucide.filter((l) => GENERAL_DEFAULTS.includes(l.name)),
    }
  }
  const rank = <T>(list: T[], keys: (x: T) => string[]) =>
    list
      .map((x) => {
        const scores = keys(x)
          .map((k) => score(k, q))
          .filter((s) => s >= 0)
        return { x, s: scores.length ? Math.min(...scores) : -1 }
      })
      .filter((r) => r.s >= 0)
      .sort((a, b) => a.s - b.s)
      .slice(0, limit)
      .map((r) => r.x)
  return {
    brands: rank([...brands.values()], (b) => [b.slug, b.title.toLowerCase().replace(/\s+/g, '')]),
    general: rank(lucide, (l) => [l.name.replace(/-/g, ''), l.name]),
  }
}
