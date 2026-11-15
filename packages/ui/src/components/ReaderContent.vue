<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ImageOff } from '@lucide/vue'
import { httpUrl, type ReaderArticle, type ReaderBlock } from '@myriad/core'
import { useI18n } from '../i18n'
const props = defineProps<{ article?: ReaderArticle }>()
const emit = defineEmits<{ playing: [value: boolean] }>()
const { m } = useI18n()
const root = ref<HTMLElement>()
const failed = ref(new Set<number>())
const playing = new Set<EventTarget>()
const blocks = computed<ReaderBlock[]>(
  () =>
    props.article?.blocks ||
    props.article?.paragraphs.map((text) => ({ type: 'text', text })) ||
    [],
)
function playback(event: Event, active: boolean) {
  if (!event.target) return
  if (active) playing.add(event.target)
  else playing.delete(event.target)
  emit('playing', playing.size > 0)
}
function failure(index: number, event: Event) {
  failed.value.add(index)
  playback(event, false)
}
function stopMedia() {
  root.value?.querySelectorAll('video,audio').forEach((el) => (el as HTMLMediaElement).pause())
  playing.clear()
  emit('playing', false)
}
watch(
  () => props.article,
  () => {
    stopMedia()
    failed.value = new Set()
  },
)
onBeforeUnmount(stopMedia)
</script>
<template>
  <div ref="root" class="m-reader-content">
    <template v-for="(block, index) in blocks" :key="index">
      <p v-if="block.type === 'text'">{{ block.text }}</p>
      <figure v-else class="m-reader-content__media" @click.stop @keydown.stop>
        <div
          v-if="block.type === 'unavailable' || failed.has(index) || !httpUrl(block.url)"
          class="m-reader-content__placeholder"
        >
          <ImageOff :size="24" aria-hidden="true" />
          <span>{{ m.feeds.mediaUnavailable }}</span>
          <small>{{ block.type === 'image' ? block.alt : block.label }}</small>
          <a
            v-if="httpUrl(block.url)"
            :href="httpUrl(block.url)"
            target="_blank"
            rel="noopener noreferrer"
            >{{ m.feeds.openMedia }}</a
          >
        </div>
        <img
          v-else-if="block.type === 'image'"
          :src="httpUrl(block.url)"
          :alt="block.alt"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          @error="failure(index, $event)"
        />
        <video
          v-else-if="block.type === 'video'"
          controls
          playsinline
          loading="lazy"
          preload="none"
          width="800"
          height="450"
          :src="httpUrl(block.url)"
          :poster="httpUrl(block.poster) || undefined"
          :aria-label="block.label || m.feeds.video"
          @error="failure(index, $event)"
          @play="playback($event, true)"
          @pause="playback($event, false)"
          @ended="playback($event, false)"
        />
        <audio
          v-else
          controls
          loading="lazy"
          preload="none"
          :src="httpUrl(block.url)"
          :aria-label="block.label || m.feeds.audio"
          @error="failure(index, $event)"
          @play="playback($event, true)"
          @pause="playback($event, false)"
          @ended="playback($event, false)"
        />
      </figure>
    </template>
  </div>
</template>
<style scoped>
.m-reader-content p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0 0 1em;
}
.m-reader-content__media {
  margin: 14px 0;
}
.m-reader-content img,
.m-reader-content video {
  display: block;
  width: 100%;
  height: auto;
  max-height: 420px;
  object-fit: contain;
  border-radius: 10px;
}
.m-reader-content video {
  aspect-ratio: 16 / 9;
  background: var(--bg);
}
.m-reader-content audio {
  width: 100%;
}
.m-reader-content__placeholder {
  display: grid;
  justify-items: center;
  gap: 8px;
  min-height: 100px;
  padding: 20px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  background: var(--bg);
  color: var(--muted);
  font-size: 13px;
  text-align: center;
  overflow-wrap: anywhere;
}
.m-reader-content__placeholder a {
  color: var(--blue);
}
</style>
