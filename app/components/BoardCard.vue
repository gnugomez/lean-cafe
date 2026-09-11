<script setup lang="ts">
import { EditorContent } from '@tiptap/vue-3'
import type { CardItem } from '~/composables/useRoom'

const props = defineProps<{ card: CardItem }>()
const store = useRoomStore()
const { voting, myVotes, votesLeft, cardVotes, people, hideAuthors } = store

const isMine = computed(() => props.card.authorId === store.uid)
// When the host hides authors, other people's names never reach the DOM —
// a blurred name-like placeholder is rendered instead.
const authorHidden = computed(() => hideAuthors.value && !isMine.value)
const authorName = computed(() =>
  people.value[props.card.authorId]?.name || props.card.authorName || 'Anonymous')
const authorColor = computed(() => authorHidden.value ? '#c9c9cf' : store.colorOf(props.card.authorId))
const fakeAuthor = computed(() => fakeNameFor(props.card.id, authorName.value.length))

// cards are frozen while a voting round is live
const votingLive = computed(() => voting.value.phase === 'voting')

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
  if (store.autoEditCardId.value === props.card.id) {
    store.autoEditCardId.value = null
    beginEditing()
  }
})

watch(votingLive, (live) => {
  if (live && editing.value) endEditing()
})

const noteEl = ref<HTMLElement | null>(null)
const isSelected = computed(() => store.selectedCardIds.value.has(props.card.id))
// shift+click toggles; deselection waits for pointerup so a drag can still start
let shiftDeselectPending = false
const { onPointerDown } = useNoteDrag({
  noteEl,
  card: () => props.card,
  canDrag: () => !editing.value && store.tool.value === 'select',
  onPress: (e) => {
    shiftDeselectPending = false
    if (e.shiftKey) {
      if (isSelected.value) shiftDeselectPending = true
      else store.toggleSelected(props.card.id)
    } else if (!isSelected.value) {
      store.setSelection([props.card.id])
    }
  },
  onTap: (e) => {
    if (e.shiftKey) {
      if (shiftDeselectPending) store.toggleSelected(props.card.id)
    } else {
      store.setSelection([props.card.id])
    }
    shiftDeselectPending = false
  },
})

const dragState = computed(() => {
  const d = store.dragging.value
  return d && d.ids.includes(props.card.id) ? d : null
})
const isDragging = computed(() => !!dragState.value)

// subtle per-note tilt for the sticky-note feel
const tilt = computed(() => {
  let h = 0
  for (let i = 0; i < props.card.id.length; i++) h = (h * 31 + props.card.id.charCodeAt(i)) >>> 0
  return ((h % 7) - 3) * 0.5
})

// ring in the selector's color when a peer has this card selected
// (own selection wins; neutral while authors are hidden, like cursors)
const remoteRing = computed(() => {
  if (isSelected.value) return null
  const who = store.remoteSelectedBy.value.get(props.card.id)
  if (!who) return null
  const color = hideAuthors.value ? '#9a9aa4' : store.colorOf(who)
  return `0 0 0 2px ${color}, 0 2px 6px rgba(27, 27, 31, 0.12)`
})

// a peer dragging this card streams its live position (never while we drag it)
const remoteDragPos = computed(() =>
  dragState.value ? undefined : store.remoteDrags.value.get(props.card.id))

const noteStyle = computed(() => {
  const d = dragState.value
  const r = remoteDragPos.value
  // screen-px drag deltas translate inside this card's zoomed canvas
  const z = store.columnView(props.card.columnId).zoom
  return {
    left: `${r ? r.x : props.card.x}px`,
    top: `${r ? r.y : props.card.y}px`,
    zIndex: d || r ? 1000 : props.card.z || 1,
    transform: d
      ? `translate(${d.dx / z}px, ${d.dy / z}px) rotate(${tilt.value}deg)`
      : `rotate(${tilt.value}deg)`,
    ...(remoteRing.value ? { boxShadow: remoteRing.value } : {}),
  }
})

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
    :class="{ dragging: isDragging, 'remote-dragging': !!remoteDragPos, editing, selected: isSelected }"
    :style="noteStyle"
    :data-card-id="card.id"
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
