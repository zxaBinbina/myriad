import type { WidgetKind, WidgetSize } from '@myriad/core'
import { type Component, defineAsyncComponent } from 'vue'

export interface WidgetDefinition {
  icon: string
  sizes: WidgetSize[]
  defaultSize: WidgetSize
  component: Component
}

/** 小组件注册表。M3 起在这里添加天气、翻译、待办等组件。 */
export const WIDGETS: Record<WidgetKind, WidgetDefinition> = {
  calendar: {
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
