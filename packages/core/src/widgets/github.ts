export const GITHUB_SECTIONS = [
  'repositories',
  'contributions',
  'tasks',
  'notifications',
  'actions',
  'releases',
  'activity',
] as const
export type GithubSection = (typeof GITHUB_SECTIONS)[number]
export interface GithubConfig {
  route: 'auto' | 'direct'
  user: string
  org: string
  repos: string[]
  sections: GithubSection[]
  personal: boolean
}
export function githubName(value: string) {
  return /^[a-z\d][a-z\d-]{0,38}$/i.test(value)
}
export function githubRepo(value: string) {
  return /^[a-z\d][a-z\d-]{0,38}\/[\w.-]{1,100}$/i.test(value)
}
export function githubConfig(raw: Record<string, unknown> = {}): GithubConfig {
  const sections = Array.isArray(raw.sections) ? raw.sections : [...GITHUB_SECTIONS]
  return {
    route: raw.route === 'direct' ? 'direct' : 'auto',
    user: typeof raw.user === 'string' && githubName(raw.user) ? raw.user : 'zxaBinbina',
    org:
      typeof raw.org === 'string' && (!raw.org || githubName(raw.org))
        ? raw.org
        : 'Youzai-World-Team',
    repos: [
      ...new Set(
        (Array.isArray(raw.repos) ? raw.repos : []).filter(
          (v): v is string => typeof v === 'string' && githubRepo(v),
        ),
      ),
    ].slice(0, 8),
    sections: GITHUB_SECTIONS.filter((s) => sections.includes(s)),
    personal: raw.personal !== false,
  }
}
export interface GithubEntry {
  id: string
  title: string
  url: string
  repository: string
  status: string
  reason: string
  actor: string
  date: string
}
export interface GithubReading {
  section: GithubSection
  personal: boolean
  days: { date: string; count: number | null; level: number }[]
  repos: {
    name: string
    url: string
    description: string
    stars: number
    forks: number
    issues: number
    private: boolean
  }[]
  entries: GithubEntry[]
  errors: string[]
  more: boolean
}
const string = (v: unknown) => (typeof v === 'string' ? v.slice(0, 1000) : '')
const number = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0)
export function githubUrl(v: unknown) {
  try {
    const u = new URL(string(v))
    return u.protocol === 'https:' && u.hostname === 'github.com' && !u.username && !u.password
      ? u.href
      : ''
  } catch {
    return ''
  }
}
export function parseGithub(raw: any, section: GithubSection): GithubReading {
  if (!raw || typeof raw !== 'object' || raw.section !== section) throw new Error('invalid-github')
  return {
    section,
    personal: raw.personal === true,
    days: (Array.isArray(raw.days) ? raw.days : [])
      .filter((d: any) => /^\d{4}-\d{2}-\d{2}$/.test(d?.date))
      .slice(-371)
      .map((d: any) => ({
        date: d.date,
        count: d.count === null ? null : number(d.count),
        level: Math.min(4, number(d.level)),
      })),
    repos: (Array.isArray(raw.repos) ? raw.repos : [])
      .filter((r: any) => githubRepo(r?.name ?? ''))
      .slice(0, 100)
      .map((r: any) => ({
        name: r.name,
        url: githubUrl(r.url),
        description: string(r.description),
        stars: number(r.stars),
        forks: number(r.forks),
        issues: number(r.issues),
        private: r.private === true,
      })),
    entries: (Array.isArray(raw[section]) ? raw[section] : [])
      .slice(0, 100)
      .filter((e: any) => e && typeof e === 'object')
      .map((e: any) => ({
        id: string(e.id),
        title: string(e.title),
        url: githubUrl(e.url),
        repository: string(e.repository),
        status: string(e.status ?? e.kind),
        reason: string(e.reason),
        actor: string(e.actor),
        date: string(e.date ?? e.updated),
      })),
    errors: (Array.isArray(raw.errors) ? raw.errors : []).map(string),
    more: raw.more === true,
  }
}
