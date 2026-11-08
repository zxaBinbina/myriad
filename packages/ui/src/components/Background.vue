<script setup lang="ts">
import type { ComboKey, WallpaperSpec } from '@myriad/core'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { blobStore } from '../state/blobs'
import { createCache } from '../state/cache'
import { useStore } from '../state/store'
import { useSync } from '../state/sync'

const store = useStore()
const sync = useSync()
const cache = createCache(store.platform.storage)
const emit = defineEmits<{ wallpaper: [active: boolean] }>()

const bg = computed(() => store.settings.background)
const combo = computed<ComboKey>(() => `${store.settings.palette}:${store.resolvedTheme.value}`)
const spec = computed<WallpaperSpec | undefined>(() =>
  bg.value.mode === 'wallpaper' ? bg.value.wallpapers[combo.value] : undefined,
)

const src = ref('')
/** 壁纸媒体类型：上传的按文件类型判断，链接按扩展名判断，图片加载失败时再按视频尝试一次 */
const kind = ref<'image' | 'video'>('image')
const loaded = ref(false)
let objectUrl = ''

const VIDEO_EXT = /\.(mp4|webm|ogv|ogg|mov|m4v)(?:[?#]|$)/i

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** Bing 每日一图：接口不允许跨域，扩展通过主机权限访问；失败时返回空 */
async function bingUrl(): Promise<string> {
  const key = `wallpaper.bing.${today()}`
  const hit = await cache.get<string>(key, 86400000)
  if (hit) return hit
  try {
    const res = await fetch(
      'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN',
      { credentials: 'omit' },
    )
    const json = (await res.json()) as { images?: { urlbase?: string; url?: string }[] }
    const img = json.images?.[0]
    if (!img) throw new Error('no image')
    const url = img.urlbase
      ? `https://www.bing.com${img.urlbase}_UHD.jpg`
      : `https://www.bing.com${img.url}`
    await cache.set(key, url)
    return url
  } catch {
    return (await cache.peek<string>(key)) ?? ''
  }
}

/** Unsplash 每日一图：经同步服务获取（Key 在 Worker），按日期缓存 */
async function unsplashUrl(query = ''): Promise<string> {
  const key = `wallpaper.unsplash.${today()}.${query}`
  const hit = await cache.get<string>(key, 86400000)
  if (hit) return hit
  try {
    if (!sync.canUnsplash.value || !sync.api) throw new Error('unavailable')
    const w = await sync.api.unsplash(query)
    await cache.set(key, w.url)
    return w.url
  } catch {
    return (await cache.peek<string>(key)) ?? ''
  }
}

/** 上传的壁纸：本机没有时（在其他设备上传）从同步服务下载 */
async function uploadedBlob(key: string): Promise<Blob | undefined> {
  const local = await blobStore.get(key).catch(() => undefined)
  if (local) return local
  const remote = await sync.fetchBlob(key)
  if (remote) await blobStore.put(key, remote).catch(() => undefined)
  return remote ?? undefined
}

type Resolved = { url: string; kind: 'image' | 'video' }

async function resolveSrc(s: WallpaperSpec | undefined): Promise<Resolved> {
  const none: Resolved = { url: '', kind: 'image' }
  if (!s) return none
  switch (s.source) {
    case 'upload': {
      const blob = await uploadedBlob(s.blobKey)
      if (!blob) return none
      objectUrl = URL.createObjectURL(blob)
      return { url: objectUrl, kind: blob.type.startsWith('video/') ? 'video' : 'image' }
    }
    case 'url':
      return { url: s.url, kind: VIDEO_EXT.test(s.url) ? 'video' : 'image' }
    case 'bing':
      return { url: await bingUrl(), kind: 'image' }
    case 'unsplash':
      return { url: await unsplashUrl(s.query), kind: 'image' }
    case 'picsum': {
      const w = Math.min(3840, Math.round(screen.width * devicePixelRatio))
      const h = Math.min(2160, Math.round(screen.height * devicePixelRatio))
      return { url: `https://picsum.photos/seed/${today()}/${w}/${h}`, kind: 'image' }
    }
  }
}

let seq = 0
let retriedAsVideo = false
// 同步服务连上后重新解析（Unsplash、其他设备上传的壁纸需要它）
watch(
  [spec, () => sync.active.value],
  async ([s], [prev, wasActive]) => {
    // 只是同步状态变化、且当前来源不依赖同步时不重新加载
    if (prev === s && wasActive !== undefined && s?.source !== 'unsplash' && s?.source !== 'upload')
      return
    if (prev === s && src.value) return
    const n = ++seq
    const old = objectUrl
    objectUrl = ''
    const next = await resolveSrc(s)
    if (n !== seq) return
    if (next.url !== src.value || next.kind !== kind.value) loaded.value = false
    retriedAsVideo = false
    src.value = next.url
    kind.value = next.kind
    if (old) setTimeout(() => URL.revokeObjectURL(old), 1000)
    if (!next.url) emit('wallpaper', false)
  },
  { immediate: true, deep: true },
)
onBeforeUnmount(() => objectUrl && URL.revokeObjectURL(objectUrl))

function onLoad() {
  loaded.value = true
  emit('wallpaper', true)
  syncPlayback()
}
function onError() {
  // 没有扩展名的视频链接：当图片加载失败后再按视频试一次
  if (kind.value === 'image' && spec.value?.source === 'url' && !retriedAsVideo) {
    retriedAsVideo = true
    kind.value = 'video'
    return
  }
  loaded.value = false
  emit('wallpaper', false)
}

/* 视频：标签页在后台或开启减少动态效果时暂停，停在当前画面 */
const video = ref<HTMLVideoElement | null>(null)
function syncPlayback() {
  const v = video.value
  if (!v) return
  if (document.visibilityState === 'visible' && !store.reducedMotion.value) {
    v.play().catch(() => {})
  } else v.pause()
}
watch(store.reducedMotion, syncPlayback)
document.addEventListener('visibilitychange', syncPlayback)
onBeforeUnmount(() => document.removeEventListener('visibilitychange', syncPlayback))

const mediaStyle = computed(() => ({
  filter: `blur(${bg.value.blur}px) brightness(${bg.value.brightness})`,
  scale: bg.value.blur ? 1.06 : 1,
}))

const dim = computed(() => {
  let d = bg.value.dim
  if (bg.value.darkAutoDim && store.resolvedTheme.value === 'dark') d = Math.min(0.85, d + 0.18)
  return d
})
</script>

<template>
  <div class="m-bg" aria-hidden="true">
    <div class="m-bg__glow" />
    <Transition name="m-bg-fade">
      <div v-if="src" v-show="loaded" :key="`${kind}:${src}`" class="m-bg__wall">
        <video
          v-if="kind === 'video'"
          ref="video"
          :src="src"
          muted
          loop
          playsinline
          disablepictureinpicture
          preload="auto"
          :style="mediaStyle"
          @loadeddata="onLoad"
          @error="onError"
        />
        <img
          v-else
          :src="src"
          alt=""
          decoding="async"
          referrerpolicy="no-referrer"
          :style="mediaStyle"
          @load="onLoad"
          @error="onError"
        />
        <div class="m-bg__dim" :style="{ opacity: dim }" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.m-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  background: var(--bg);
  pointer-events: none;
}
.m-bg__glow {
  position: absolute;
  inset: -20% -10% auto;
  height: 80%;
  background:
    radial-gradient(ellipse 45% 55% at 30% 20%, var(--ambient-glow), transparent 70%),
    radial-gradient(
      ellipse 40% 50% at 75% 10%,
      color-mix(in srgb, var(--blue) 10%, transparent),
      transparent 70%
    );
}
.m-bg__wall {
  position: absolute;
  inset: 0;
}
.m-bg__wall img,
.m-bg__wall video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
.m-bg__dim {
  position: absolute;
  inset: 0;
  background: var(--wallpaper-tint);
  transition: opacity 0.3s ease;
}
.m-bg-fade-enter-active,
.m-bg-fade-leave-active {
  transition: opacity 0.6s ease;
}
.m-bg-fade-enter-from,
.m-bg-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .m-bg-fade-enter-active,
  .m-bg-fade-leave-active {
    transition: none;
  }
}
</style>
