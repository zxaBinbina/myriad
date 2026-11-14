import {
  ApiError,
  createApi,
  createId,
  insertItem,
  parseTranslation,
  translationEndpoint,
  translationOrigin,
  translationRequest,
  TranslationError,
  TRANSLATION_SERVICES,
  type TranslationConfig,
  type TranslationCredentials,
  type TranslationInput,
  type TranslationProvider,
} from '@myriad/core'
import type { MyriadStore } from './store'
import { PermissionRequired } from '../composables/useVisibleResource'
import { widgetBase } from './widgetRequests'

export const translationCredentialsKey = (itemId: string) =>
  `myriad.translation.credentials.${itemId}`
export async function loadTranslationCredentials(
  store: MyriadStore,
  itemId: string,
): Promise<TranslationCredentials> {
  const raw = await store.platform.storage.get<TranslationCredentials>(
    translationCredentialsKey(itemId),
  )
  const result: TranslationCredentials = {}
  for (const provider of [...TRANSLATION_SERVICES, 'openai'] as TranslationProvider[]) {
    const value = raw?.[provider]
    if (value && typeof value.key === 'string' && typeof value.id === 'string')
      result[provider] = {
        id: value.id,
        key: value.key,
        ...(typeof value.endpoint === 'string' ? { endpoint: value.endpoint } : {}),
      }
  }
  return result
}
export function translationOrigins(store: MyriadStore, config: TranslationConfig): string[] {
  const providers: TranslationProvider[] = config.mode === 'llm' ? ['openai'] : config.services
  return providers.flatMap((provider) => {
    if (provider !== 'worker') return [translationOrigin(provider, config)]
    const base = widgetBase(store, 'auto')
    return base ? [new URL(base).origin] : []
  })
}
export class WorkerNotConfigured extends Error {}
export async function runTranslation(
  store: MyriadStore,
  itemId: string,
  provider: TranslationProvider,
  input: TranslationInput,
  config: TranslationConfig,
  signal: AbortSignal,
) {
  const timed = AbortSignal.any([signal, AbortSignal.timeout(30000)])
  timed.throwIfAborted()
  if (provider === 'worker') {
    const base = widgetBase(store, 'auto')
    if (!base) throw new WorkerNotConfigured()
    if (config.workerProvider === 'ai' && input.source === 'auto')
      throw new TranslationError('source')
    if (store.platform.origins && !(await store.platform.origins.has(new URL(base).origin)))
      throw new PermissionRequired()
    timed.throwIfAborted()
    const cfg = store.local.sync
    const api = createApi({
      base: base.replace(/\/v1$/, ''),
      token: cfg.authMode === 'token' ? cfg.token.trim() : undefined,
      clientId: cfg.authMode === 'access' ? cfg.clientId.trim() : undefined,
      clientSecret: cfg.authMode === 'access' ? cfg.clientSecret.trim() : undefined,
    })
    return parseTranslation('worker', await api.translate(input, config.workerProvider, timed))
  }
  const credentials = await loadTranslationCredentials(store, itemId)
  timed.throwIfAborted()
  const request = await translationRequest(provider, input, config, credentials[provider])
  if (store.platform.origins && !(await store.platform.origins.has(new URL(request.url).origin)))
    throw new PermissionRequired()
  timed.throwIfAborted()
  const response = await fetch(request.url, { ...request.init, signal: timed })
  if (response.status === 401 || response.status === 403) throw new TranslationError('auth')
  if (response.status === 429 || response.status === 456) throw new TranslationError('quota')
  if (!response.ok) throw new TranslationError('upstream')
  const result = parseTranslation(provider, await response.json())
  timed.throwIfAborted()
  return result
}
/** Search hands text to the same widget, without sending it or persisting search history. */
export function openTranslation(store: MyriadStore, text: string) {
  const widgets = Object.values(store.data.items).filter(
    (item) => item.type === 'widget' && item.kind === 'translation',
  )
  let item = widgets.find((w) => store.activeGroup.value.items.includes(w.id)) ?? widgets[0]
  if (!item) {
    item = { id: createId('w'), type: 'widget', kind: 'translation', size: '4x4', config: {} }
    insertItem(store.data, item, { kind: 'group', id: store.activeGroup.value.id }, 0)
  }
  const group = store.data.groups.find((g) => g.items.includes(item.id))
  if (group) store.switchGroup(group.id)
  if (store.settings.layout.mode === 'minimal') store.ui.dashboardOpen = true
  store.ui.translationInput = { itemId: item.id, text, nonce: Date.now() + Math.random() }
}
export { ApiError, TranslationError, PermissionRequired, translationEndpoint }
