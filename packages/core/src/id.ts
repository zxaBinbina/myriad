/** 生成短随机 id（时间前缀便于排查，随机部分避免冲突） */
export function createId(prefix = ''): string {
  const time = Date.now().toString(36)
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) =>
    b.toString(36).padStart(2, '0'),
  ).join('')
  return `${prefix}${time}${rand}`
}
