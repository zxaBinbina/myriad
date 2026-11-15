<script setup lang="ts">
import { ref, useId } from 'vue'
import {
  HOT_SOURCES,
  feedConfig,
  subscriptionUrl,
  httpUrl,
  createId,
  type WidgetItem,
} from '@myriad/core'
import { useI18n } from '../../i18n'
import MSwitch from '../base/MSwitch.vue'
const props = defineProps<{ item: WidgetItem; formId: string }>(),
  emit = defineEmits<{ submit: [] }>()
const { m, lang } = useI18n(),
  id = useId(),
  config = ref(feedConfig(props.item.config))
function add() {
  config.value.subscriptions.push({ id: createId('rss'), title: '', url: '', rsshub: false })
}
function validate() {
  return config.value.subscriptions.some(
    (s) => !s.title.trim() || !subscriptionUrl(s, config.value.rsshubBase),
  ) || !httpUrl(config.value.rsshubBase)
    ? m.value.feeds.invalid
    : ''
}
defineExpose({
  value: () => feedConfig(config.value as unknown as Record<string, unknown>),
  validate,
})
</script>
<template>
  <form :id="formId" class="m-feed-settings" @submit.prevent="emit('submit')">
    <label class="m-field" :for="`${id}-mode`"
      ><span>{{ m.feeds.mode }}</span
      ><select :id="`${id}-mode`" v-model="config.mode" class="m-select">
        <option value="hot">{{ m.feeds.hot }}</option>
        <option value="rss">RSS</option>
        <option value="favorites">{{ m.feeds.favorites }}</option>
      </select></label
    >
    <label class="m-field" :for="`${id}-route`"
      ><span>{{ m.feeds.route }}</span
      ><select :id="`${id}-route`" v-model="config.route" class="m-select">
        <option value="auto">{{ m.common.auto }}</option>
        <option value="worker">{{ m.feeds.worker }}</option>
        <option value="direct">{{ m.feeds.direct }}</option>
      </select></label
    >
    <fieldset v-if="config.mode === 'hot'" class="m-feed-settings__sources">
      <legend>{{ m.feeds.sources }}</legend>
      <label v-for="s in HOT_SOURCES" :key="s.id"
        ><input v-model="config.sources" type="checkbox" :value="s.id" />{{
          lang === 'en' ? s.nameEn : s.name
        }}</label
      >
    </fieldset>
    <template v-if="config.mode === 'rss'">
      <label class="m-field" :for="`${id}-hub`"
        ><span>{{ m.feeds.rsshub }}</span
        ><input :id="`${id}-hub`" v-model="config.rsshubBase" type="url" required class="m-input"
      /></label>
      <fieldset v-for="s in config.subscriptions" :key="s.id" class="m-feed-settings__subscription">
        <legend>{{ m.feeds.subscription }}</legend>
        <label class="m-field" :for="`${id}-${s.id}-title`"
          ><span>{{ m.feeds.name }}</span
          ><input
            :id="`${id}-${s.id}-title`"
            v-model="s.title"
            required
            maxlength="120"
            class="m-input"
        /></label>
        <label class="m-feed-settings__toggle"
          ><span>{{ m.feeds.useRsshub }}</span
          ><MSwitch v-model="s.rsshub" :label="m.feeds.useRsshub"
        /></label>
        <label class="m-field" :for="`${id}-${s.id}-url`"
          ><span>{{ s.rsshub ? m.feeds.rsshubRoute : m.feeds.url }}</span
          ><input
            :id="`${id}-${s.id}-url`"
            v-model="s.url"
            :type="s.rsshub ? 'text' : 'url'"
            required
            :placeholder="s.rsshub ? '/github/issue/vuejs/core' : 'https://example.com/feed.xml'"
            class="m-input"
        /></label>
        <button
          type="button"
          class="m-btn m-btn--small"
          @click="config.subscriptions = config.subscriptions.filter((e) => e.id !== s.id)"
        >
          {{ m.common.remove }}
        </button>
      </fieldset>
      <button
        type="button"
        class="m-btn m-btn--small"
        :disabled="config.subscriptions.length >= 30"
        @click="add"
      >
        {{ m.feeds.addSubscription }}
      </button>
    </template>
    <label class="m-field" :for="`${id}-time`"
      ><span>{{ m.feeds.refreshTime }}</span
      ><input :id="`${id}-time`" v-model="config.refreshTime" type="time" required class="m-input"
    /></label>
    <p class="m-feed-settings__hint">{{ m.feeds.scheduleHint }}</p>
    <label
      v-for="key in [
        'preview',
        'hoverPreview',
        'readMarks',
        'favoritesEnabled',
        'aiSummary',
        'autoScroll',
      ] as const"
      :key="key"
      class="m-feed-settings__toggle"
      ><span>{{ m.feeds[key] }}</span
      ><MSwitch v-model="config[key]" :label="m.feeds[key]"
    /></label>
    <p class="m-feed-settings__hint">{{ m.feeds.sourceHint }}</p>
  </form>
</template>
<style scoped>
.m-feed-settings {
  display: grid;
  gap: 14px;
}
.m-feed-settings__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}
.m-feed-settings__sources {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.m-feed-settings fieldset {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px;
  font-size: 13px;
}
.m-feed-settings__sources label {
  display: flex;
  gap: 8px;
  align-items: center;
}
.m-feed-settings__subscription {
  display: grid;
  gap: 12px;
}
.m-feed-settings__hint {
  font-size: 12px;
  color: var(--muted);
  margin: 0;
  line-height: 1.7;
}
</style>
