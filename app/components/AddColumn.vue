<script setup lang="ts">
const store = useRoomStore()

const addingColumn = ref(false)
const columnDraft = ref('')
function submitColumn() {
  if (columnDraft.value.trim()) store.addColumn(columnDraft.value)
  columnDraft.value = ''
  addingColumn.value = false
}
</script>

<template>
  <div class="add-column">
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
</template>
