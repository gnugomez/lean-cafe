<script setup lang="ts">
const creating = ref(false)
const joining = ref(false)
const joinCode = ref('')
const joinError = ref('')
// joining is the rarer path: it stays behind its button until asked for
const joinOpen = ref(false)
const codeInput = ref<HTMLInputElement | null>(null)

function openJoin() {
  joinOpen.value = true
  nextTick(() => codeInput.value?.focus())
}

function closeJoin() {
  joinOpen.value = false
  joinCode.value = ''
  joinError.value = ''
}

async function createRoom() {
  if (creating.value) return
  creating.value = true
  try {
    const res = await $fetch<{ code: string, room: string }>('/api/rooms', { method: 'POST' })
    // The owner token never leaves this browser; the shared doc will hold a
    // copy so peers can tell who owns the room.
    setStored(`leancafe:${res.code}:owner`, genId(20))
    setStored(`leancafe:${res.code}:seed`, '1')
    await navigateTo(`/room/${res.code}`)
  } finally {
    creating.value = false
  }
}

async function joinRoom() {
  const code = normalizeCode(joinCode.value)
  if (!code || joining.value) return
  joining.value = true
  joinError.value = ''
  try {
    const res = await $fetch<{ code: string }>(`/api/rooms/${code}`)
    await navigateTo(`/room/${res.code}`)
  } catch {
    joinError.value = 'That code doesn\'t match any room. Double-check it and try again.'
  } finally {
    joining.value = false
  }
}
</script>

<template>
  <div class="landing">
    <main class="hero">
      <div class="hero-logo">☕</div>
      <h1>Lean Café</h1>
      <p class="tagline">
        Run a <a href="https://leancoffee.org/" target="_blank" rel="noopener">Lean Coffee</a>
        session with your team. Cards, votes and timers sync straight between
        browsers — no accounts, nothing stored on a server.
      </p>
      <div v-if="!joinOpen" class="hero-actions">
        <button class="btn btn-primary btn-big" :disabled="creating" @click="createRoom">
          {{ creating ? 'Creating room…' : 'Start a session' }}
        </button>
        <button class="btn btn-big" @click="openJoin">Join with a code</button>
      </div>
      <form v-else class="join-form" @submit.prevent="joinRoom">
        <input
          ref="codeInput"
          v-model="joinCode"
          class="input code-input"
          placeholder="e.g. 7QKM2X"
          maxlength="10"
          autocomplete="off"
          spellcheck="false"
          @keydown.esc="closeJoin"
        >
        <button class="btn btn-primary" :disabled="!joinCode.trim() || joining">
          {{ joining ? '…' : 'Join' }}
        </button>
        <button type="button" class="icon-btn join-cancel" title="Cancel" @click="closeJoin">
          <Icon name="lucide:x" />
        </button>
      </form>
      <p v-if="joinError" class="form-error">{{ joinError }}</p>
    </main>
    <RecentSessions />
    <footer class="landing-foot">
      <span>Peer-to-peer via WebRTC · board data never leaves your browsers</span>
      <a class="foot-link" href="https://github.com/gnugomez/lean-cafe" target="_blank" rel="noopener">
        <Icon name="lucide:github" /> Source on GitHub
      </a>
    </footer>
  </div>
</template>
