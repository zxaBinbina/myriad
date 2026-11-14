import { describe, expect, it } from 'vitest'
import { createApi, createBackup, defaultSettings, loadLocalState, presetData } from '../src'

describe('连接令牌', () => {
  it('私有请求使用 Bearer，公开请求不发送令牌，也不附带 Cookie', async () => {
    const calls: RequestInit[] = []
    const fetcher: typeof fetch = async (_url, init) => {
      calls.push(init!)
      return Response.json({})
    }
    const api = createApi(
      {
        base: 'https://example.com',
        token: 'secret-token',
        clientId: 'legacy-id',
        clientSecret: 'legacy-secret',
      },
      fetcher,
    )
    await api.me()
    await api.health()
    expect(new Headers(calls[0]!.headers).get('Authorization')).toBe('Bearer secret-token')
    expect(new Headers(calls[0]!.headers).has('CF-Access-Client-Secret')).toBe(false)
    expect(calls[0]!.credentials).toBe('omit')
    expect(calls[0]!.redirect).toBe('manual')
    expect(new Headers(calls[1]!.headers).has('Authorization')).toBe(false)
    expect(calls[1]!.credentials).toBe('omit')
  })

  it('保留 Access Service Token 和 Cookie 的连接方式', async () => {
    const calls: RequestInit[] = []
    const fetcher: typeof fetch = async (_url, init) => {
      calls.push(init!)
      return Response.json({})
    }
    await createApi(
      { base: 'https://example.com', clientId: 'id', clientSecret: 'secret' },
      fetcher,
    ).me()
    await createApi({ base: 'https://example.com' }, fetcher).me()
    expect(new Headers(calls[0]!.headers).get('CF-Access-Client-Id')).toBe('id')
    expect(new Headers(calls[0]!.headers).get('CF-Access-Client-Secret')).toBe('secret')
    expect(calls[1]!.credentials).toBe('include')
  })

  it('不会把连接令牌通过公网明文 HTTP 发送', async () => {
    let called = false
    const fetcher: typeof fetch = async () => {
      called = true
      return Response.json({})
    }
    await expect(
      createApi({ base: 'http://example.com', token: 'secret' }, fetcher).me(),
    ).rejects.toMatchObject({ code: 'auth' })
    expect(called).toBe(false)
    await createApi({ base: 'http://127.0.0.1:8787', token: 'local-secret' }, fetcher).me()
    expect(called).toBe(true)
  })

  it('迁移旧版配置而不丢失凭据，新版令牌只保留在本机', () => {
    const old = loadLocalState({
      schema: 1,
      sync: { enabled: true, clientId: 'id', clientSecret: 'secret' },
      activeGroup: 'g1',
    })
    expect(old.schema).toBe(2)
    expect(old.sync.authMode).toBe('access')
    expect(old.sync.clientId).toBe('id')
    expect(old.activeGroup).toBe('g1')
    const next = loadLocalState({ schema: 2, sync: { authMode: 'token', token: 'private-token' } })
    expect(next.sync.token).toBe('private-token')
    expect(loadLocalState(null).sync.authMode).toBe('token')
    expect(
      JSON.stringify(createBackup({ data: presetData(), settings: defaultSettings() })),
    ).not.toContain(next.sync.token)
  })
})
