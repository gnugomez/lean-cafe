<script setup lang="ts">
const props = withDefaults(defineProps<{ initial?: string, edit?: boolean }>(), {
  initial: '',
  edit: false,
})
const emit = defineEmits<{ done: [name: string], cancel: [] }>()

const draft = ref(props.initial)
const inputEl = ref<HTMLInputElement | null>(null)
onMounted(() => inputEl.value?.focus())

function submit() {
  const clean = draft.value.trim().slice(0, 24)
  if (clean) emit('done', clean)
}
</script>

<template>
  <!-- renaming happens over the live board, so it's a modal; the first-run
       prompt has nothing behind it yet, so it's a plain page -->
  <div v-if="edit" class="overlay" @keydown.esc="emit('cancel')">
    <form class="panel dialog" @submit.prevent="submit">
      <h2>Change your name</h2>
      <p class="dialog-sub">Everyone in this room will see it on your cards.</p>
      <input
        ref="inputEl"
        v-model="draft"
        class="input"
        placeholder="e.g. Ada"
        maxlength="24"
      >
      <div class="dialog-actions">
        <button type="button" class="btn" @click="emit('cancel')">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="!draft.trim()">Save</button>
      </div>
    </form>
  </div>
  <div v-else class="center-screen">
    <form class="hero small" @submit.prevent="submit">
      <div class="hero-logo">☕</div>
      <h1>Pick a display name</h1>
      <p class="tagline">Everyone in this room will see it on your cards.</p>
      <input
        ref="inputEl"
        v-model="draft"
        class="input name-input"
        placeholder="e.g. Ada"
        maxlength="24"
      >
      <button type="submit" class="btn btn-primary" :disabled="!draft.trim()">Join the board</button>
    </form>
  </div>
</template>
