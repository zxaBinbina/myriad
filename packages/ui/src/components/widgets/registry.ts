import type { WidgetKind, WidgetSize } from '@myriad/core'
import { type Component, defineAsyncComponent } from 'vue'

export interface WidgetDefinition {
  icon: string
  sizes: WidgetSize[]
  defaultSize: WidgetSize
  component: Component
  settings?: boolean
}

/** 小组件注册表。M3 起在这里添加天气、翻译、待办等组件。 */
export const WIDGETS: Record<WidgetKind, WidgetDefinition> = {
  memo: {
    icon: 'list-todo',
    sizes: ['2x2', '4x2', '2x4', '4x4'],
    defaultSize: '4x4',
    settings: true,
    component: defineAsyncComponent(() => import('./MemoWidget.vue')),
  },
  status: {
    icon: 'activity',
    sizes: ['1x2', '2x2', '4x2', '2x4', '4x4'],
    defaultSize: '2x2',
    settings: true,
    component: defineAsyncComponent(() => import('./StatusWidget.vue')),
  },
  minecraft: {
    icon: 'gamepad-2',
    sizes: ['2x2', '4x2', '2x4', '4x4'],
    defaultSize: '2x2',
    settings: true,
    component: defineAsyncComponent(() => import('./MinecraftWidget.vue')),
  },
  currency: {
    icon: 'coins',
    sizes: ['2x2', '4x2', '2x4', '4x4'],
    defaultSize: '4x2',
    settings: true,
    component: defineAsyncComponent(() => import('./CurrencyWidget.vue')),
  },
  weather: {
    icon: 'cloud-sun',
    sizes: ['2x2', '4x2', '2x4', '4x4'],
    defaultSize: '2x2',
    settings: true,
    component: defineAsyncComponent(() => import('./WeatherWidget.vue')),
  },
  quote: {
    icon: 'quote',
    sizes: ['2x2', '4x2', '2x4', '4x4'],
    defaultSize: '2x2',
    settings: true,
    component: defineAsyncComponent(() => import('./QuoteWidget.vue')),
  },
  countdown: {
    icon: 'calendar-heart',
    sizes: ['2x2', '4x2'],
    defaultSize: '2x2',
    settings: true,
    component: defineAsyncComponent(() => import('./CountdownWidget.vue')),
  },
  calendar: {
    settings: true,
    icon: 'calendar-days',
    sizes: ['2x2', '4x2', '4x4'],
    defaultSize: '2x2',
    component: defineAsyncComponent(() => import('./CalendarWidget.vue')),
  },
  analogClock: {
    icon: 'clock',
    sizes: ['2x2'],
    defaultSize: '2x2',
    component: defineAsyncComponent(() => import('./AnalogClockWidget.vue')),
  },
}

export function widgetSpan(size: WidgetSize): { w: number; h: number } {
  const [w, h] = size.split('x').map(Number) as [number, number]
  return { w, h }
}
