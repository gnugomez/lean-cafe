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

const showNameEdit = ref(false)
const copied = ref(false)
function copyLink() {
  navigator.clipboard?.writeText(`${location.origin}/room/${props.code}`)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
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

    <main class="board">
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
