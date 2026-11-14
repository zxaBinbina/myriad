<script setup lang="ts">
import { ref, useId } from 'vue'
import { githubConfig, githubName, githubRepo, GITHUB_SECTIONS } from '@myriad/core'
import { useI18n } from '../../i18n'
const props = defineProps<{ initial: Record<string, unknown>; formId: string }>()
const emit = defineEmits<{ save: [] }>()
const { m, t } = useI18n(),
  id = useId()
const config = ref(githubConfig(props.initial)),
  repositories = ref(config.value.repos.join('\n'))
function value() {
  return {
    ...config.value,
    repos: repositories.value
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean),
  }
}
function validate() {
  const c = value()
  return !githubName(c.user) ||
    (c.org && !githubName(c.org)) ||
    c.repos.length > 8 ||
    c.repos.some((r) => !githubRepo(r)) ||
    !c.sections.length
    ? m.value.github.invalid
    : ''
}
defineExpose({ value, validate })
</script>
<template>
  <form :id="formId" class="m-github-settings" @submit.prevent="emit('save')">
    <label :for="`${id}-user`">{{ m.github.user }}</label
    ><input
      :id="`${id}-user`"
      v-model="config.user"
      class="m-input"
      name="user"
      required
      pattern="[a-zA-Z0-9][a-zA-Z0-9-]{0,38}"
      autocapitalize="none"
      :spellcheck="false"
    />
    <label :for="`${id}-org`">{{ m.github.org }}</label
    ><input
      :id="`${id}-org`"
      v-model="config.org"
      class="m-input"
      name="org"
      pattern="[a-zA-Z0-9][a-zA-Z0-9-]{0,38}"
      autocapitalize="none"
      :spellcheck="false"
    />
    <label :for="`${id}-repos`">{{ m.github.watched }}</label
    ><textarea
      :id="`${id}-repos`"
      v-model="repositories"
      class="m-input"
      name="repos"
      rows="4"
      :placeholder="m.github.watchedHint"
      autocapitalize="none"
      :spellcheck="false"
      :aria-describedby="`${id}-hint`"
    />
    <p :id="`${id}-hint`">{{ m.github.watchedHint }}</p>
    <label :for="`${id}-route`">{{ m.widget.source }}</label
    ><select :id="`${id}-route`" v-model="config.route" class="m-select" name="route">
      <option value="auto">{{ m.widget.autoSource }}</option>
      <option value="direct">{{ m.widget.directSource }}</option>
    </select>
    <div>
      <input
        :id="`${id}-personal`"
        v-model="config.personal"
        type="checkbox"
        name="personal"
      /><label :for="`${id}-personal`">{{ m.github.useToken }}</label>
    </div>
    <p>{{ m.github.privateHint }}</p>
    <fieldset>
      <legend>{{ m.github.sections }}</legend>
      <div v-for="section in GITHUB_SECTIONS" :key="section">
        <input
          :id="`${id}-${section}`"
          v-model="config.sections"
          type="checkbox"
          :value="section"
          name="sections"
        /><label :for="`${id}-${section}`">{{ t(`github.${section}`) }}</label>
      </div>
    </fieldset>
  </form>
</template>
<style scoped>
.m-github-settings {
  display: grid;
  gap: 8px;
  font-size: 13px;
}
.m-github-settings p {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--muted);
}
.m-github-settings fieldset {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  display: grid;
  gap: 8px;
}
.m-github-settings input[type='checkbox'] {
  margin-inline-end: 8px;
  accent-color: var(--blue);
}
.m-github-settings textarea {
  resize: vertical;
  min-height: 70px;
}
</style>
