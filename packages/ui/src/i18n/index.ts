import { computed, type ComputedRef, inject, type InjectionKey } from 'vue'
import en from './en'
import zhCN, { type Messages } from './zh-CN'

export type { Messages }
export type Lang = 'zh-CN' | 'en'

export const MESSAGES: Record<Lang, Messages> = { 'zh-CN': zhCN, en }

export interface I18n {
  lang: ComputedRef<Lang>
  /** 当前语言的完整文案对象，模板中可直接用 `m.settings.title` */
  m: ComputedRef<Messages>
  /** 按点分路径取文案并替换 {参数} */
  t: (path: string, params?: Record<string, string | number>) => string
}

export const I18N_KEY: InjectionKey<I18n> = Symbol('myriad-i18n')

export function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in params ? String(params[k]) : `{${k}}`,
  )
}

export function createI18n(lang: ComputedRef<Lang>): I18n {
  const m = computed(() => MESSAGES[lang.value])
  const t = (path: string, params?: Record<string, string | number>) => {
    let node: unknown = m.value
    for (const key of path.split('.')) node = (node as Record<string, unknown> | undefined)?.[key]
    return typeof node === 'string' ? format(node, params) : path
  }
  return { lang, m, t }
}

export function useI18n(): I18n {
  const i18n = inject(I18N_KEY)
  if (!i18n) throw new Error('Myriad i18n is not provided')
  return i18n
}
