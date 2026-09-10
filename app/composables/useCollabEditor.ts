import { Editor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import { Placeholder } from '@tiptap/extensions'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import type { AnyExtension } from '@tiptap/core'
import type { PlaceholderOptions } from '@tiptap/extensions'
import type * as Y from 'yjs'

export interface CollabEditorOptions {
  /** null = the fragment isn't bindable yet; init() stays a no-op until it is */
  getFragment: () => Y.XmlFragment | null
  placeholder: Partial<PlaceholderOptions>
  /** replaces StarterKit's Document (e.g. the column header schema) */
  document?: AnyExtension
  canEdit?: () => boolean
  /** debounced while typing; endEditing() flushes it synchronously */
  onSync: (editor: Editor) => void
  /** runs when editing ends, while the editor is still editable */
  beforeEnd?: (editor: Editor) => void
  /** runs when editing ends, after the synchronous flush */
  afterEnd?: (editor: Editor) => void
}

export function useCollabEditor(opts: CollabEditorOptions) {
  const editor = shallowRef<Editor | undefined>(undefined)
  const editing = ref(false)
  // The plain-text mirror is debounced only to coalesce writes: every Y.Map set
  // appends to the doc's update log and re-renders all peers, so per-keystroke
  // mirroring would be pure churn. endEditing() flushes synchronously.
  let mirrorTimer: ReturnType<typeof setTimeout> | null = null

  function syncNow() {
    if (mirrorTimer) {
      clearTimeout(mirrorTimer)
      mirrorTimer = null
    }
    const ed = editor.value
    if (ed && !ed.isDestroyed) opts.onSync(ed)
  }

  function init() {
    if (editor.value) return
    const fragment = opts.getFragment()
    if (!fragment) return
    editor.value = new Editor({
      editable: false,
      extensions: [
        ...(opts.document ? [opts.document] : []),
        // Collaboration provides Yjs-based undo/redo, so the default is off.
        StarterKit.configure({
          ...(opts.document ? { document: false } : {}),
          undoRedo: false,
          link: {
            // false = never open through the click-handler plugin. Read-only
            // editors still open links natively (contenteditable=false), and
            // while editing a click just places the cursor — which is what
            // 'whenNotEditable' promises, but it maps to openOnClick: true
            // upstream and opens links mid-edit via window.open.
            openOnClick: false,
            autolink: true,
            linkOnPaste: true,
            // typing/pasting [text](url), with the upstream href validation
            markdownLinks: true,
            // remote peers can sync marks with non-string hrefs, which the
            // default validator would throw on (breaking the card's render);
            // treat them as disallowed so renderHTML strips the href instead
            isAllowedUri: (url, ctx) =>
              (url == null || typeof url === 'string') && ctx.defaultValidate(url),
          },
        }),
        SlashCommands,
        Placeholder.configure(opts.placeholder),
        TaskList,
        TaskItem.configure({ nested: true }),
        Collaboration.configure({ fragment }),
      ],
      editorProps: {
        handleKeyDown: (_view, event) => {
          if (slashMenuOpen.value) return false // the menu owns Escape/Enter
          if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
            endEditing()
            return true
          }
          return false
        },
      },
      onUpdate: () => {
        if (mirrorTimer) clearTimeout(mirrorTimer)
        mirrorTimer = setTimeout(syncNow, 400)
      },
      onBlur: () => endEditing(),
    })
  }

  function beginEditing() {
    const ed = editor.value
    if (!ed || editing.value || !(opts.canEdit?.() ?? true)) return
    editing.value = true
    ed.setEditable(true)
    nextTick(() => ed.commands.focus('end'))
  }

  function endEditing() {
    const ed = editor.value
    if (!ed || !editing.value) return
    editing.value = false
    opts.beforeEnd?.(ed)
    ed.setEditable(false)
    syncNow()
    opts.afterEnd?.(ed)
  }

  onBeforeUnmount(() => {
    if (mirrorTimer) clearTimeout(mirrorTimer)
    editor.value?.destroy()
  })

  return { editor, editing, init, beginEditing, endEditing }
}
