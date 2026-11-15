import type { ExchangeRequest, ExchangeResponse, SyncTransport } from './engine'
import { fromBase64, toBase64 } from './engine'
import type {
  TranslationInput,
  TranslationResult,
  WorkerTranslator,
  TranslationConfig,
} from '../widgets/translation'
import {
  credentialContext,
  credentialTokenHash,
  sealCredential,
  type CredentialChange,
  type CredentialService,
  type CredentialsStatus,
} from '../credentials'

/** myriad_api 的连接信息 */
export interface ApiConfig {
  /** 服务地址，如 https://myriad.zxabinbina.cc.cd */
  base: string
  /** Worker 独立连接令牌；填写后使用 Bearer 鉴权 */
  token?: string
  /** Cloudflare Access Service Token（扩展使用）；网站版留空，依靠登录 Cookie */
  clientId?: string
  clientSecret?: string
}

export type ApiErrorCode =
  'network' | 'auth' | 'forbidden' | 'disabled' | 'not-found' | 'too-large' | 'server' | 'conflict'

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status = 0,
  ) {
    super(code)
  }
}

export interface ApiFeatures {
  sync: boolean
  backups: boolean
  blobs: boolean
  kv: boolean
  icons: boolean
  auth: boolean
  unsplash: boolean
  blobMaxBytes?: number
  translation?: boolean
  translators?: WorkerTranslator[]
  qweather?: boolean
  github?: boolean
  githubPrivate?: boolean
  credentials?: boolean
  credentialRevision?: string
  feeds?: boolean
  reader?: boolean
  summary?: boolean
  search?: boolean
  searchWeb?: string[]
}

export interface BackupInfo {
  id: string
  at: number
  reason: 'daily' | 'manual' | 'import' | 'rollback'
  seq: number
  size: number
}

export interface BackupConfig {
  enabled: boolean
  keep: number
}

export interface GeoInfo {
  country: string | null
  region: string | null
  city: string | null
  timezone: string | null
  latitude: number | null
  longitude: number | null
}

export interface DailyWallpaper {
  url: string
  thumb: string
  color: string | null
  author: string
  authorUrl: string
  link: string
}

export function normalizeBase(base: string): string {
  return base.trim().replace(/\/+$/, '')
}

/** 服务地址的 origin，用于申请扩展主机权限；无效时返回 null */
export function originOf(base: string): string | null {
  try {
    const u = new URL(normalizeBase(base))
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null
  } catch {
    return null
  }
}

export function createApi(config: ApiConfig, fetcher: typeof fetch = (...a) => fetch(...a)) {
  const base = normalizeBase(config.base)

  async function request(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
    if (auth && (config.token || config.clientSecret)) {
      const url = new URL(base)
      if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1')
        throw new ApiError('auth')
    }
    const headers = new Headers(init.headers)
    if (auth && config.token) {
      headers.set('Authorization', `Bearer ${config.token}`)
    } else if (auth && config.clientId && config.clientSecret) {
      headers.set('CF-Access-Client-Id', config.clientId)
      headers.set('CF-Access-Client-Secret', config.clientSecret)
    }
    let res: Response
    try {
      res = await fetcher(`${base}${path}`, {
        ...init,
        headers,
        // Access 未登录时会重定向到登录页，不跟随
        redirect: 'manual',
        credentials: auth && !config.token && !config.clientId ? 'include' : 'omit',
        cache: 'no-store',
      })
    } catch {
      init.signal?.throwIfAborted()
      throw new ApiError('network')
    }
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400))
      throw new ApiError('auth', res.status)
    if (res.ok) return res
    if (res.status === 401) throw new ApiError('auth', 401)
    if (res.status === 403) {
      // Access 拒绝时返回 HTML；Worker 自己拒绝时返回 JSON
      const isJson = (res.headers.get('Content-Type') ?? '').includes('json')
      throw new ApiError(isJson ? 'forbidden' : 'auth', 403)
    }
    if (res.status === 404) throw new ApiError('not-found', 404)
    if (res.status === 409) throw new ApiError('conflict', 409)
    if (res.status === 413) throw new ApiError('too-large', 413)
    if (res.status === 501 || res.status === 503) throw new ApiError('disabled', res.status)
    throw new ApiError('server', res.status)
  }

  const json = async <T>(path: string, init?: RequestInit, auth = true) =>
    (await (await request(path, init, auth)).json()) as T

  const send = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const transport: SyncTransport = {
    async exchange(req: ExchangeRequest): Promise<ExchangeResponse> {
      const r = await json<{ seq: number; update: string | null; full: boolean }>(
        '/v1/me/sync',
        send('POST', {
          doc: 'main',
          after: req.after,
          update: req.update ? toBase64(req.update) : undefined,
        }),
      )
      return { seq: r.seq, update: r.update ? fromBase64(r.update) : null, full: r.full }
    },
  }

  return {
    base,
    transport,
    health: () =>
      json<{ ok: boolean; version: string; features: ApiFeatures }>('/v1/health', {}, false),
    me: () => json<{ identity: string; version: string; features: ApiFeatures }>('/v1/me'),
    credentials: () => json<CredentialsStatus>('/v1/me/credentials'),
    async saveCredential(service: CredentialService, change: CredentialChange) {
      if (!config.token) throw new ApiError('disabled', 501)
      const origin = new URL(base).origin
      if (
        !origin.startsWith('https:') &&
        !['localhost', '127.0.0.1'].includes(new URL(base).hostname)
      )
        throw new ApiError('auth')
      const envelope = await sealCredential(
        await credentialTokenHash(config.token),
        credentialContext('transport', service, origin),
        change,
      )
      return json<CredentialsStatus>(`/v1/me/credentials/${service}`, send('PUT', envelope))
    },
    geo: () => json<GeoInfo>('/v1/geo', {}, false),
    weather: (query: URLSearchParams, signal: AbortSignal) =>
      json<unknown>(`/v1/me/weather?${query}`, { signal }),
    search: (query: URLSearchParams, signal: AbortSignal) =>
      json<import('../search').SearchPage>(`/v1/me/search?${query}`, { signal }),
    summary: (url: string, lang: string, signal: AbortSignal) =>
      json<{ summary: string }>('/v1/me/summary', { ...send('POST', { url, lang }), signal }),
    github: (query: URLSearchParams, signal: AbortSignal) =>
      json<unknown>(`/v1/me/github?${query}`, { signal }),
    translate: (
      input: TranslationInput,
      provider: WorkerTranslator,
      signal: AbortSignal,
      settings?: TranslationConfig,
    ) =>
      json<TranslationResult>('/v1/me/translate', {
        ...send('POST', { ...input, provider, settings }),
        signal,
      }),
    listBackups: () => json<{ backups: BackupInfo[]; config: BackupConfig }>('/v1/me/backups'),
    createBackup: (reason: 'manual' | 'import' | 'rollback') =>
      json<{ backup: BackupInfo | null }>('/v1/me/backups', send('POST', { reason })),
    async downloadBackup(id: string): Promise<Uint8Array> {
      const res = await request(`/v1/me/backups/${encodeURIComponent(id)}`)
      return new Uint8Array(await res.arrayBuffer())
    },
    deleteBackup: (id: string) =>
      json<{ ok: true }>(`/v1/me/backups/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    setBackupConfig: (config: Partial<BackupConfig>) =>
      json<{ config: BackupConfig }>('/v1/me/backups/config', send('PUT', config)),
    async putBlob(key: string, blob: Blob) {
      await request(`/v1/me/blobs/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
        body: blob,
      })
    },
    async getBlob(key: string): Promise<Blob> {
      return (await request(`/v1/me/blobs/${encodeURIComponent(key)}`)).blob()
    },
    async deleteBlob(key: string) {
      await request(`/v1/me/blobs/${encodeURIComponent(key)}`, { method: 'DELETE' })
    },
    unsplash: (query = '') =>
      json<DailyWallpaper>(`/v1/me/wallpaper/unsplash?query=${encodeURIComponent(query)}`),
    iconUrl: (url: string, size = 128) =>
      `${base}/v1/icon?url=${encodeURIComponent(url)}&size=${size}`,
    holidayUrl: () => `${base}/v1/holidays/{year}`,
  }
}

export type MyriadApi = ReturnType<typeof createApi>
