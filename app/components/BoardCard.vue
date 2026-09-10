<script setup lang="ts">
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import { Placeholder } from '@tiptap/extensions'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import type { CardItem } from '~/composables/useRoom'

const props = defineProps<{ card: CardItem }>()
const store = useRoomStore()
const { voting, myVotes, votesLeft, cardVotes, people, hideAuthors, draggingCardId, dragOverColumn } = store

const isMine = computed(() => props.card.authorId === store.uid)
// When the host hides authors, other people's names never reach the DOM —
// a blurred name-like placeholder is rendered instead.
const authorHidden = computed(() => hideAuthors.value && !isMine.value)
const authorName = computed(() =>
  people.value[props.card.authorId]?.name || props.card.authorName || 'Anonymous')
const authorColor = computed(() => authorHidden.value ? '#c9c9cf' : colorFor(props.card.authorId))
const fakeAuthor = computed(() => fakeNameFor(props.card.id, authorName.value.length))

// ---- collaborative rich-text body (Tiptap bound to the card's Y.XmlFragment) ----
const editing = ref(false)
const editor = shallowRef<Editor | undefined>(undefined)
let mirrorTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  const fragment = store.bodyFragment(props.card.id)
  if (!fragment) return
  editor.value = new Editor({
    editable: false,
    extensions: [
      // Collaboration provides Yjs-based undo/redo, so the default is off.
      StarterKit.configure({ undoRedo: false }),
      Placeholder.configure({ placeholder: 'What should we talk about?' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Collaboration.configure({ fragment }),
    ],
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
          endEditing()
          return true
        }
        return false
      },
    },
    onUpdate: () => {
      if (mirrorTimer) clearTimeout(mirrorTimer)
      mirrorTimer = setTimeout(syncMirror, 400)
    },
    onBlur: () => endEditing(),
  })
  // a card just created by this client opens ready to type
  if (store.autoEditCardId.value === props.card.id) {
    store.autoEditCardId.value = null
    beginEditing()
  }
})

onBeforeUnmount(() => {
  if (mirrorTimer) clearTimeout(mirrorTimer)
  editor.value?.destroy()
})

function syncMirror() {
  if (mirrorTimer) {
    clearTimeout(mirrorTimer)
    mirrorTimer = null
  }
  const ed = editor.value
  if (ed && !ed.isDestroyed) store.updateCardText(props.card.id, ed.getText().trim())
}

function beginEditing() {
  const ed = editor.value
  if (!ed || editing.value) return
  editing.value = true
  ed.setEditable(true)
  nextTick(() => ed.commands.focus('end'))
}

function endEditing() {
  const ed = editor.value
  if (!ed || !editing.value) return
  editing.value = false
  ed.setEditable(false)
  syncMirror()
  // abandoning an empty card removes it
  if (ed.isEmpty) store.removeCard(props.card.id)
}

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', props.card.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  draggingCardId.value = props.card.id
}
function onDragEnd() {
  draggingCardId.value = null
  dragOverColumn.value = null
}
</script>

<template>
  <article
    class="card"
    :class="{ dragging: draggingCardId === card.id, editing }"
    :data-card-id="card.id"
    :draggable="!editing"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
  >
    <div class="card-body" @dblclick="beginEditing">
      <EditorContent :editor="editor" />
    </div>
    <footer class="card-foot">
      <span class="card-author">
        <i class="author-dot" :style="{ background: authorColor }" />
        <span v-if="authorHidden" class="author-hidden" aria-label="hidden author">{{ fakeAuthor }}</span>
        <template v-else>{{ authorName }}</template>
      </span>
      <!-- mousedown.prevent keeps these controls from blurring the editor -->
      <span class="card-tools" @mousedown.prevent>
        <span v-if="voting.phase === 'voting'" class="vote-stepper">
          <button
            class="vote-btn"
            :disabled="!((myVotes[card.id] ?? 0) > 0)"
            title="Remove a vote"
            @click="store.adjustVote(card.id, -1)"
          ><Icon name="lucide:minus" /></button>
          <b>{{ myVotes[card.id] || 0 }}</b>
          <button
            class="vote-btn"
            :disabled="votesLeft <= 0"
            title="Vote for this"
            @click="store.adjustVote(card.id, 1)"
          ><Icon name="lucide:plus" /></button>
        </span>
        <span
          v-else-if="(cardVotes[card.id] || 0) > 0"
          class="vote-badge"
          :class="{ hot: voting.phase === 'results' }"
        ><Icon name="lucide:arrow-big-up" /> {{ cardVotes[card.id] }}</span>
        <span class="card-actions">
          <button
            class="icon-btn"
            :title="editing ? 'Done editing' : 'Edit card'"
            @click="editing ? endEditing() : beginEditing()"
          ><Icon :name="editing ? 'lucide:check' : 'lucide:pencil'" /></button>
          <button class="icon-btn" title="Delete card" @click="store.removeCard(card.id)"><Icon name="lucide:x" /></button>
        </span>
      </span>
    </footer>
  </article>
</template>
