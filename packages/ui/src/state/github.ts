import {
  ApiError,
  githubRepo,
  parseGithub,
  type GithubConfig,
  type GithubSection,
} from '@myriad/core'
import type { MyriadStore } from './store'
import { personalApi, widgetBase, widgetJson } from './widgetRequests'
export class GithubSetupRequired extends Error {}
export const GITHUB_ORIGINS = ['https://api.github.com', 'https://github.com']
export async function loadGithub(
  store: MyriadStore,
  config: GithubConfig,
  section: GithubSection,
  signal: AbortSignal,
) {
  const params = new URLSearchParams({
    user: config.user,
    org: config.org,
    repos: config.repos.join(','),
    section,
  })
  const base = widgetBase(store, config.route)
  if (base) {
    if (config.personal) {
      try {
        return parseGithub(await (await personalApi(store, signal)).github(params, signal), section)
      } catch (e) {
        signal.throwIfAborted()
        if (!(e instanceof ApiError) || !['disabled', 'not-found'].includes(e.code)) throw e
      }
    }
    if (section === 'tasks' || section === 'notifications') throw new GithubSetupRequired()
    return parseGithub(
      await widgetJson(store, new URL(`${base}/github?${params}`), signal, 20000),
      section,
    )
  }
  if (section === 'tasks' || section === 'notifications') throw new GithubSetupRequired()
  const get = (path: string) => widgetJson(store, new URL(`https://api.github.com${path}`), signal)
  const result: any = { section, personal: false }
  if (section === 'contributions') {
    if (store.platform.origins && !(await store.platform.origins.has('https://github.com'))) {
      const { PermissionRequired } = await import('../composables/useVisibleResource')
      throw new PermissionRequired()
    }
    const response = await fetch(`https://github.com/users/${config.user}/contributions`, {
      credentials: 'omit',
      redirect: 'error',
      signal,
    })
    if (!response.ok) throw new Error('upstream')
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html')
    result.days = [...doc.querySelectorAll('[data-date][data-level]')].map((e) => {
      const tooltip =
        [...doc.querySelectorAll('tool-tip')].find((t) => t.getAttribute('for') === e.id)
          ?.textContent ?? ''
      const count = /([\d,]+) contributions?/i.exec(tooltip)?.[1]
      return {
        date: e.getAttribute('data-date'),
        level: Number(e.getAttribute('data-level')),
        count: count
          ? Number(count.replaceAll(',', ''))
          : /No contributions/i.test(tooltip)
            ? 0
            : null,
      }
    })
    if (!result.days.length) throw new Error('upstream')
  } else if (section === 'activity') {
    const events = await get(`/users/${config.user}/received_events/public?per_page=30`)
    result.activity = events.map((e: any) => ({
      id: e.id,
      actor: e.actor?.login,
      kind: e.type,
      repository: e.repo?.name,
      url: githubRepo(e.repo?.name ?? '')
        ? `https://github.com/${e.repo.name}`
        : `https://github.com/${config.user}`,
      date: e.created_at,
    }))
    result.more = events.length === 30
  } else {
    const errors: string[] = []
    const [owned, organization] = await Promise.all([
      get(`/users/${config.user}/repos?sort=updated&per_page=30`),
      config.org
        ? get(`/orgs/${config.org}/repos?sort=updated&per_page=30`).catch(() => {
            signal.throwIfAborted()
            errors.push(config.org)
            return []
          })
        : [],
    ])
    const found = [...owned, ...organization]
    const watched = await Promise.all(
      config.repos.map(
        (r) =>
          found.find((x) => x.full_name?.toLowerCase() === r.toLowerCase()) ??
          get(`/repos/${r}`).catch(() => {
            signal.throwIfAborted()
            errors.push(r)
            return null
          }),
      ),
    )
    const repos = [...watched.filter(Boolean), ...found].filter(
      (r: any, i, all) => all.findIndex((x) => x.id === r.id) === i,
    )
    result.errors = errors
    if (section === 'repositories') {
      result.repos = repos.map((r) => ({
        name: r.full_name,
        url: r.html_url,
        description: r.description,
        stars: r.stargazers_count,
        forks: r.forks_count,
        issues: r.open_issues_count,
      }))
      result.more = owned.length === 30 || organization.length === 30
    } else {
      const selected = (
        config.repos.length
          ? repos.filter((r) =>
              config.repos.some((n) => n.toLowerCase() === r.full_name?.toLowerCase()),
            )
          : repos
      ).slice(0, 8)
      result[section] = (
        await Promise.all(
          selected.map(async (r) => {
            const data = await get(
              `/repos/${r.full_name}/${section === 'actions' ? 'actions/runs?per_page=3' : 'releases/latest'}`,
            ).catch(() => {
              signal.throwIfAborted()
              errors.push(r.full_name)
              return null
            })
            return section === 'actions'
              ? (data?.workflow_runs ?? []).map((a: any) => ({
                  id: String(a.id),
                  repository: r.full_name,
                  title: a.display_title || a.name,
                  url: a.html_url,
                  status: a.conclusion || a.status,
                  date: a.updated_at,
                }))
              : data
                ? [
                    {
                      id: String(data.id),
                      repository: r.full_name,
                      title: data.name || data.tag_name,
                      url: data.html_url,
                      status: data.tag_name,
                      date: data.published_at,
                    },
                  ]
                : []
          }),
        )
      ).flat()
    }
  }
  signal.throwIfAborted()
  return parseGithub(result, section)
}
