<script setup lang="ts">
import { Folder } from '@lucide/vue'
import { computed } from 'vue'
import { GROUP_ICONS } from './groupIcons'

const props = withDefaults(defineProps<{ name?: string; size?: number }>(), { size: 18 })
const icon = computed(
  () => GROUP_ICONS[(props.name ?? 'folder') as keyof typeof GROUP_ICONS] ?? Folder,
)
</script>

<template>
  <component :is="icon" :size="size" aria-hidden="true" />
</template>
