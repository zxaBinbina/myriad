import { describe, expect, it } from 'vitest'
import {
  createApi,
  credentialContext,
  credentialTokenHash,
  openCredential,
  sealCredential,
  translationConfig,
} from '../src'

describe('Service credential encryption', () => {
  it('uses fresh nonces, binds ciphertext to purpose, origin and service, and rejects tampering', async () => {
    const hash = await credentialTokenHash('test-only-connection-token')
    const context = credentialContext('transport', 'github', 'https://worker.example')
    const value = { fields: { key: 'test-only-api-secret' }, version: '' }
    const a = await sealCredential(hash, context, value),
      b = await sealCredential(hash, context, value)
    expect(a.iv).not.toBe(b.iv)
    expect(a.data).not.toBe(b.data)
    expect(JSON.stringify(a)).not.toContain(value.fields.key)
    expect(await openCredential(hash, context, a)).toEqual(value)
    for (const wrong of [
      credentialContext('storage', 'github'),
      credentialContext('transport', 'deepl', 'https://worker.example'),
      credentialContext('transport', 'github', 'https://different.example'),
    ])
      await expect(openCredential(hash, wrong, a)).rejects.toThrow()
    await expect(
      openCredential(await credentialTokenHash('wrong-token'), context, a),
    ).rejects.toThrow()
    await expect(
      openCredential(hash, context, {
        ...a,
        data: (a.data[0] === 'A' ? 'B' : 'A') + a.data.slice(1),
      }),
    ).rejects.toThrow()
  })
  it('uploads only an authenticated encrypted POST/PUT body and never follows redirects', async () => {
    let body: any, init: RequestInit | undefined
    const token = 'test-only-connection-token'
    const api = createApi({ base: 'https://worker.example', token }, async (url, request) => {
      expect(url).toBe('https://worker.example/v1/me/credentials/github')
      init = request
      body = JSON.parse(request!.body as string)
      return Response.json({})
    })
    await api.saveCredential('github', { fields: { key: 'test-only-api-secret' }, version: '' })
    expect(init?.method).toBe('PUT')
    expect(init?.redirect).toBe('manual')
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${token}`)
    expect(JSON.stringify(body)).not.toContain('test-only-api-secret')
    expect(
      await openCredential(
        await credentialTokenHash(token),
        credentialContext('transport', 'github', 'https://worker.example'),
        body,
      ),
    ).toMatchObject({ fields: { key: 'test-only-api-secret' } })
  })
  it('rejects missing tokens and public plaintext connections before any network call', async () => {
    const fetcher: typeof fetch = async () => {
      throw new Error('must not fetch')
    }
    for (const config of [
      { base: 'https://worker.example' },
      { base: 'http://worker.example', token: 'test-token' },
    ])
      await expect(
        createApi(config, fetcher).saveCredential('github', {
          fields: { key: 'test-key' },
          version: '',
        }),
      ).rejects.toMatchObject({ code: config.token ? 'auth' : 'disabled' })
  })
  it('keeps routing configuration free of credential fields and preserves existing local routes', () => {
    expect(
      translationConfig({ key: 'secret', endpoint: 'secret', credentialLocation: 'worker' }),
    ).toMatchObject({ credentialLocation: 'worker' })
    expect(JSON.stringify(translationConfig({ key: 'secret' }))).not.toContain('secret')
    expect(translationConfig({}).credentialLocation).toBe('local')
  })
})
