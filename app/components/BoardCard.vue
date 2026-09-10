<script setup lang="ts">
import { EditorContent } from '@tiptap/vue-3'
import type { CardItem } from '~/composables/useRoom'

const props = defineProps<{ card: CardItem, canvasWidth: number, canvasHeight: number }>()
const store = useRoomStore()
const { voting, myVotes, votesLeft, cardVotes, people, hideAuthors } = store

const isMine = computed(() => props.card.authorId === store.uid)
// When the host hides authors, other people's names never reach the DOM —
// a blurred name-like placeholder is rendered instead.
const authorHidden = computed(() => hideAuthors.value && !isMine.value)
const authorName = computed(() =>
  people.value[props.card.authorId]?.name || props.card.authorName || 'Anonymous')
const authorColor = computed(() => authorHidden.value ? '#c9c9cf' : colorFor(props.card.authorId))
const fakeAuthor = computed(() => fakeNameFor(props.card.id, authorName.value.length))

// cards are frozen while a voting round is live
const votingLive = computed(() => voting.value.phase === 'voting')

// ---- collaborative rich-text body (Tiptap bound to the card's Y.XmlFragment) ----
const { editor, editing, init: initEditor, beginEditing, endEditing } = useCollabEditor({
  getFragment: () => store.bodyFragment(props.card.id),
  placeholder: { placeholder: 'What should we talk about?' },
  canEdit: () => !votingLive.value,
  onSync: ed => store.updateCardText(props.card.id, ed.getText().trim()),
  // abandoning an empty card removes it
  afterEnd: (ed) => { if (ed.isEmpty) store.removeCard(props.card.id) },
})

onMounted(() => {
  initEditor()
  if (!editor.value) return
  // a card just created by this client opens ready to type
  if (store.autoEditCardId.value === props.card.id) {
    store.autoEditCardId.value = null
    beginEditing()
  }
})

watch(votingLive, (live) => {
  if (live && editing.value) endEditing()
})

// ---- free positioning on the whiteboard ----
const noteEl = ref<HTMLElement | null>(null)
const { dragging, dx, dy, onPointerDown } = useNoteDrag({
  noteEl,
  card: () => props.card,
  canDrag: () => !editing.value,
})

// subtle per-note tilt for the sticky-note feel
const tilt = computed(() => {
  let h = 0
  for (let i = 0; i < props.card.id.length; i++) h = (h * 31 + props.card.id.charCodeAt(i)) >>> 0
  return ((h % 7) - 3) * 0.5
})

// clamp to the current canvas at render time only — the stored position is
// untouched, so re-widening a column restores where notes really are
const noteSize = useElementSize(noteEl)
const shownX = computed(() => {
  const maxX = props.canvasWidth - (noteSize.width.value || 220) - 4
  return Math.max(4, Math.min(props.card.x, Math.max(4, maxX)))
})
const shownY = computed(() => {
  if (props.canvasHeight < 60) return props.card.y // not measured yet
  const maxY = props.canvasHeight - (noteSize.height.value || 100) - 4
  return Math.max(4, Math.min(props.card.y, Math.max(4, maxY)))
})

const noteStyle = computed(() => ({
  left: `${shownX.value}px`,
  top: `${shownY.value}px`,
  zIndex: dragging.value ? 1000 : props.card.z || 1,
  transform: dragging.value
    ? `translate(${dx.value}px, ${dy.value}px) rotate(${tilt.value}deg)`
    : `rotate(${tilt.value}deg)`,
}))

function onCardDblClick(e: MouseEvent) {
  if (editing.value) return // inside the editor, double-click selects words
  if ((e.target as HTMLElement).closest('button, input, a')) return
  beginEditing()
}
</script>

<template>
  <article
    ref="noteEl"
    class="card"
    :class="{ dragging, editing }"
    :style="noteStyle"
    @pointerdown="onPointerDown"
    @dblclick="onCardDblClick"
  >
    <div class="card-body">
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
        <span v-if="!votingLive" class="card-actions">
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
