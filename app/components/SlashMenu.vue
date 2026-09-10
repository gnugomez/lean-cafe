<script setup lang="ts">
import type { SlashCommandItem } from '~/utils/slashCommands'

const props = defineProps<{
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}>()

const selected = ref(0)
const itemEls = ref<HTMLElement[]>([])

watch(() => props.items, () => { selected.value = 0 })

function move(delta: number) {
  const n = props.items.length
  if (!n) return
  selected.value = (selected.value + delta + n) % n
  nextTick(() => itemEls.value[selected.value]?.scrollIntoView({ block: 'nearest' }))
}

function onKeyDown(event: KeyboardEvent): boolean {
  if (event.key === 'ArrowDown') { move(1); return true }
  if (event.key === 'ArrowUp') { move(-1); return true }
  if (event.key === 'Enter') {
    const item = props.items[selected.value]
    if (item) props.command(item)
    return !!item
  }
  return false
}

defineExpose({ onKeyDown })
</script>

<template>
  <div class="slash-menu">
    <template v-if="items.length">
      <!-- pointerdown.prevent keeps the editor focused while clicking -->
      <button
        v-for="(item, i) in items"
        :key="item.title"
        :ref="el => { if (el) itemEls[i] = el as HTMLElement }"
        class="slash-item"
        :class="{ selected: i === selected }"
        @pointerdown.prevent
        @mousemove="selected = i"
        @click="command(item)"
      >
        <Icon :name="item.icon" />
        <span>{{ item.title }}</span>
      </button>
    </template>
    <div v-else class="slash-empty">No matches</div>
  </div>
</template>
