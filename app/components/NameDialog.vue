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
  <div class="overlay" @keydown.esc="edit && emit('cancel')">
    <form class="panel dialog" @submit.prevent="submit">
      <h2>{{ edit ? 'Change your name' : 'Pick a display name' }}</h2>
      <p class="dialog-sub">Everyone in this room will see it on your cards.</p>
      <input
        ref="inputEl"
        v-model="draft"
        class="input"
        placeholder="e.g. Ada"
        maxlength="24"
      >
      <div class="dialog-actions">
        <button v-if="edit" type="button" class="btn" @click="emit('cancel')">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="!draft.trim()">
          {{ edit ? 'Save' : 'Join the board' }}
        </button>
      </div>
    </form>
  </div>
</template>
