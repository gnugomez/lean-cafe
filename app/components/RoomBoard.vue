<script setup lang="ts">
const props = defineProps<{ code: string, roomName: string }>()

const store = createRoomStore(props.code, props.roomName)
provideRoomStore(store)
onMounted(() => {
  store.connect().catch(err => console.error('[lean-cafe] failed to connect room', err))
})
onBeforeUnmount(() => { store.destroy() })

const { columns, name, isOwner, hideAuthors } = store
const sortedColumns = computed(() => [...columns.value].sort((a, b) => a.order - b.order))

// live cursors: broadcast in board-content coordinates (scroll-independent)
const boardEl = ref<HTMLElement | null>(null)
function onBoardPointer(e: PointerEvent) {
  const el = boardEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  store.setPointer(e.clientX - r.left + el.scrollLeft, e.clientY - r.top + el.scrollTop)
}

// board export/import (import is host-only; transfer.ts guards it too)
const importInput = ref<HTMLInputElement | null>(null)
async function onImportPicked(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // so picking the same file again re-triggers change
  if (!file) return
  const error = await store.importBoard(file)
  if (error) window.alert(error)
}

const showNameEdit = ref(false)
const copied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(`${location.origin}/room/${props.code}`)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    // clipboard unavailable (insecure context) or write denied — don't claim "Copied!"
  }
}
</script>

<template>
  <div class="room">
    <header class="topbar">
      <NuxtLink to="/" class="brand" title="Lean Café">☕</NuxtLink>
      <button class="chip code-chip" :title="copied ? 'Copied!' : 'Copy invite link'" @click="copyLink">
        {{ code }} <Icon :name="copied ? 'lucide:check' : 'lucide:copy'" class="chip-hint" />
      </button>
      <div class="spacer" />
      <TimerWidget />
      <VotingPanel />
      <div class="chip-group">
        <button class="group-btn" title="Download this board as a JSON file" @click="store.exportBoard()">
          <Icon name="lucide:download" />
        </button>
        <button
          v-if="isOwner"
          class="group-btn"
          title="Import a board file — replaces this board for everyone"
          @click="importInput?.click()"
        >
          <Icon name="lucide:upload" />
        </button>
      </div>
      <input ref="importInput" type="file" accept=".json,application/json" hidden @change="onImportPicked">
      <button
        v-if="isOwner"
        class="chip"
        :title="hideAuthors ? 'Card authors are hidden — click to reveal them' : 'Card authors are visible — click to hide them'"
        @click="store.toggleAuthors()"
      >
        <Icon :name="hideAuthors ? 'lucide:eye-off' : 'lucide:eye'" /> authors
      </button>
      <ParticipantChips />
      <button class="chip you-chip" title="Change your name" @click="showNameEdit = true">
        {{ name || 'Anonymous' }} <Icon name="lucide:pencil" />
      </button>
    </header>

    <main
      ref="boardEl"
      class="board"
      @pointermove="onBoardPointer"
      @pointerleave="store.setPointer(null)"
    >
      <RemoteCursors />
      <BoardColumn v-for="col in sortedColumns" :key="col.id" :column="col" />
      <AddColumn v-if="isOwner" />
    </main>

    <NameDialog
      v-if="showNameEdit"
      :initial="name"
      edit
      @done="(n: string) => { store.setName(n); showNameEdit = false }"
      @cancel="showNameEdit = false"
    />
  </div>
</template>
