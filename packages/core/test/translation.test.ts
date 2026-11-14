import { describe, expect, it, vi } from 'vitest'
import {
  createApi,
  parseTranslation,
  translationConfig,
  translationEndpoint,
  translationRequest,
} from '../src/index'

const input = { text: 'Hello world', source: 'en' as const, target: 'zh' as const }
const cfg = translationConfig({})
describe('Translation adapters and credentials', () => {
  it('filters synced configuration and requires an explicit approved model endpoint', async () => {
    const config = translationConfig({
      services: ['baidu', 'baidu', 'unknown'],
      key: 'do-not-sync',
      source: 'invalid',
    })
    expect(config.services).toEqual(['baidu'])
    expect(JSON.stringify(config)).not.toContain('do-not-sync')
    for (const url of [
      'http://evil.example/v1',
      'https://user:secret@example.com/v1',
      'https://example.com/v1?key=secret',
    ])
      expect(() => translationEndpoint(url)).toThrow()
    const llm = translationConfig({ model: 'example', baseUrl: 'https://model.example/v1/' })
    await expect(
      translationRequest('openai', input, llm, {
        id: '',
        key: 'key',
        endpoint: 'https://old.example/v1/chat/completions',
      }),
    ).rejects.toThrow('credentials')
    const req = await translationRequest('openai', input, llm, {
      id: '',
      key: 'key',
      endpoint: translationEndpoint(llm.baseUrl),
    })
    expect(req.url).toBe('https://model.example/v1/chat/completions')
    expect(JSON.parse(req.init.body as string).messages[1]).toEqual({
      role: 'user',
      content: input.text,
    })
    expect(req.init.redirect).toBe('error')
  })
  it('uses official Baidu MD5 and Youdao v3 signatures without placing keys in URLs', async () => {
    const credential = { id: '2015063000000001', key: '12345678' }
    const req = await translationRequest(
      'baidu',
      { ...input, text: 'apple' },
      cfg,
      credential,
      0,
      '1435660288',
    )
    const params = req.init.body as URLSearchParams
    expect(params.get('sign')).toBe('f89f9594663708c1605f3d736d01d2d4')
    expect(req.url).not.toContain(credential.key)
    const long = 'abcdefghijklmnopqrstuvwxyz'
    const yd = await translationRequest(
      'youdao',
      { ...input, text: long },
      cfg,
      credential,
      1700000000000,
      'salt',
    )
    expect((yd.init.body as URLSearchParams).get('sign')).toBe(
      'e39b8d7d4960181f145d7ee3110a737f68c90f43517b92beda8c7dbb352aac3b',
    )
    expect((yd.init.body as URLSearchParams).get('to')).toBe('zh-CHS')
  })
  it('Tencent TC3 signs the exact JSON sent, host and UTC date', async () => {
    const credential = { id: 'id', key: 'secret' }
    const now = Date.parse('2026-11-14T01:23:45Z')
    const req = await translationRequest('tencent', input, cfg, credential, now)
    // Fixed fixture generated independently with Python hashlib/hmac.
    const signature = '771de971470a73d9a6df38ce552dc85c7cfc4f4375868906b24150bde8152e93'
    expect(new Headers(req.init.headers).get('Authorization')).toContain(`Signature=${signature}`)
    expect(new Headers(req.init.headers).get('X-TC-Region')).toBe('ap-guangzhou')
  })
  it('handles automatic detection, provider language codes and independent result formats', async () => {
    const auto = { ...input, source: 'auto' as const }
    const credential = { id: '', key: 'test' }
    const deep = await translationRequest('deepl', auto, cfg, credential)
    expect(JSON.parse(deep.init.body as string)).not.toHaveProperty('source_lang')
    const ms = await translationRequest('microsoft', auto, cfg, credential)
    expect(ms.url).toContain('to=zh-Hans')
    expect(ms.url).not.toContain('from=')
    const samples = {
      worker: { text: '你好' },
      deepl: { translations: [{ text: '你好', detected_source_language: 'EN' }] },
      baidu: { from: 'en', trans_result: [{ dst: '你好' }] },
      youdao: { errorCode: '0', translation: ['你好'], l: 'en2zh-CHS' },
      tencent: { Response: { TargetText: '你好', Source: 'en' } },
      microsoft: [{ translations: [{ text: '你好' }] }],
      openai: { choices: [{ message: { content: '你好' } }] },
    } as const
    for (const [provider, raw] of Object.entries(samples))
      expect(parseTranslation(provider as keyof typeof samples, raw).text).toBe('你好')
    expect(() =>
      parseTranslation('youdao', { errorCode: '108', translation: ['not usable'] }),
    ).toThrow()
    expect(() =>
      parseTranslation('openai', { choices: [{ message: { content: null } }] }),
    ).toThrow()
    await expect(
      translationRequest('baidu', { ...input, text: '😀'.repeat(1600) }, cfg, {
        id: 'id',
        key: 'key',
      }),
    ).rejects.toThrow('length')
  })
  it('private Worker request authenticates, puts text only in POST, and preserves cancellation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ text: '你好' }))
    const api = createApi({ base: 'https://worker.example', token: 'private' }, fetcher)
    const ctrl = new AbortController()
    expect(await api.translate(input, 'ai', ctrl.signal)).toEqual({ text: '你好' })
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe('https://worker.example/v1/me/translate')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer private')
    expect(init?.method).toBe('POST')
    expect(init?.cache).toBe('no-store')
    fetcher.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    ctrl.abort()
    await expect(api.translate(input, 'ai', ctrl.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
