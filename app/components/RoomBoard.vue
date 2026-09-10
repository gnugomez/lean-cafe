<script setup lang="ts">
const props = defineProps<{ code: string, roomName: string }>()

const store = createRoomStore(props.code, props.roomName)
provideRoomStore(store)
onMounted(() => {
  store.connect().catch(err => console.error('[lean-cafe] failed to connect room', err))
})
onBeforeUnmount(() => { store.destroy() })

const { columns, name, isOwner, hideAuthors, pointers } = store
const sortedColumns = computed(() => [...columns.value].sort((a, b) => a.order - b.order))

// live cursors: broadcast in board-content coordinates (scroll-independent)
const boardEl = ref<HTMLElement | null>(null)
function onBoardPointer(e: PointerEvent) {
  const el = boardEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  store.setPointer(e.clientX - r.left + el.scrollLeft, e.clientY - r.top + el.scrollTop)
}
// neutral cursors while authors are hidden, so colors can't be matched to author dots
function cursorColor(id: string) {
  return hideAuthors.value ? '#9a9aa4' : colorFor(id)
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

const addingColumn = ref(false)
const columnDraft = ref('')
function submitColumn() {
  if (columnDraft.value.trim()) store.addColumn(columnDraft.value)
  columnDraft.value = ''
  addingColumn.value = false
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
      <div
        v-for="p in pointers"
        :key="p.id"
        class="remote-cursor"
        :style="{ left: `${p.x}px`, top: `${p.y}px` }"
      >
        <Icon name="lucide:mouse-pointer-2" :style="{ color: cursorColor(p.id) }" />
        <span class="cursor-name" :style="{ background: cursorColor(p.id) }">
          <!-- while authors are hidden, the real name never reaches the DOM -->
          <span v-if="hideAuthors" class="author-hidden">{{ fakeNameFor(p.id, p.name.length) }}</span>
          <template v-else>{{ p.name }}</template>
        </span>
      </div>
      <BoardColumn v-for="col in sortedColumns" :key="col.id" :column="col" />
      <div v-if="isOwner" class="add-column">
        <form v-if="addingColumn" class="panel add-column-form" @submit.prevent="submitColumn">
          <input
            :ref="el => (el as HTMLInputElement)?.focus()"
            v-model="columnDraft"
            class="input"
            placeholder="Column title"
            maxlength="40"
            @keydown.esc="addingColumn = false"
          >
          <button class="btn btn-primary btn-sm" type="submit">Add</button>
        </form>
        <button v-else class="btn add-column-btn" @click="addingColumn = true; columnDraft = ''">
          <Icon name="lucide:plus" /> Add column
        </button>
      </div>
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
