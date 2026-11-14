import { onBeforeUnmount, ref, type Ref } from 'vue'

const now = ref(new Date())
let users = 0
let timer: ReturnType<typeof setTimeout> | undefined

function tick() {
  now.value = new Date()
  if (document.visibilityState !== 'visible') return
  // 对齐到整秒
  timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5)
}

function onVisibility() {
  clearTimeout(timer)
  if (document.visibilityState === 'visible') {
    clearTimeout(timer)
    tick()
  }
}

/** 全局共享的当前时间，每秒更新一次 */
export function useNow(): Ref<Date> {
  if (users++ === 0) {
    tick()
    document.addEventListener('visibilitychange', onVisibility)
  }
  onBeforeUnmount(() => {
    if (--users === 0) {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  })
  return now
}
