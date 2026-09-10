import type { ChainedCommands } from '@tiptap/core'
import { Extension } from '@tiptap/core'
import { Suggestion } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import { isChangeOrigin } from '@tiptap/extension-collaboration'
import { VueRenderer } from '@tiptap/vue-3'
import SlashMenu from '~/components/SlashMenu.vue'

export interface SlashCommandItem {
  title: string
  icon: string
  keywords: string
  run: (chain: ChainedCommands) => ChainedCommands
}

const ITEMS: SlashCommandItem[] = [
  { title: 'Text', icon: 'lucide:type', keywords: 'paragraph plain', run: c => c.setParagraph() },
  { title: 'Heading 1', icon: 'lucide:heading-1', keywords: 'h1 title', run: c => c.toggleHeading({ level: 1 }) },
  { title: 'Heading 2', icon: 'lucide:heading-2', keywords: 'h2 subtitle', run: c => c.toggleHeading({ level: 2 }) },
  { title: 'Heading 3', icon: 'lucide:heading-3', keywords: 'h3', run: c => c.toggleHeading({ level: 3 }) },
  { title: 'Bullet list', icon: 'lucide:list', keywords: 'ul unordered', run: c => c.toggleBulletList() },
  { title: 'Numbered list', icon: 'lucide:list-ordered', keywords: 'ol ordered', run: c => c.toggleOrderedList() },
  { title: 'Task list', icon: 'lucide:list-todo', keywords: 'todo checkbox', run: c => c.toggleTaskList() },
  { title: 'Quote', icon: 'lucide:text-quote', keywords: 'blockquote', run: c => c.toggleBlockquote() },
  { title: 'Code block', icon: 'lucide:code', keywords: 'codeblock pre', run: c => c.toggleCodeBlock() },
  { title: 'Divider', icon: 'lucide:minus', keywords: 'hr rule separator', run: c => c.setHorizontalRule() },
]

/** True while a slash menu is on screen — editors leave Escape to the menu then. */
export const slashMenuOpen = ref(false)

/** Notion-style block menu: type `/` in an editor to insert or convert blocks. */
export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem, SlashCommandItem>({
        pluginKey: new PluginKey('slashCommands'),
        editor: this.editor,
        char: '/',
        items: ({ query }) => {
          const q = query.toLowerCase()
          return ITEMS.filter(i => `${i.title} ${i.keywords}`.toLowerCase().includes(q))
        },
        // never open because a remote peer typed "/" at our cursor
        shouldShow: ({ transaction }) => !isChangeOrigin(transaction),
        command: ({ editor, range, props }) => {
          props.run(editor.chain().focus().deleteRange(range)).run()
        },
        render: () => {
          let component: VueRenderer | null = null
          let unmount: (() => void) | null = null
          return {
            onStart: (props) => {
              component = new VueRenderer(SlashMenu, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
              })
              unmount = props.mount(component.element as HTMLElement)
              slashMenuOpen.value = true
            },
            onUpdate: (props) => {
              component?.updateProps({ items: props.items, command: props.command })
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') return false // the plugin dismisses
              return component?.ref?.onKeyDown(props.event) ?? false
            },
            onExit: () => {
              slashMenuOpen.value = false
              unmount?.()
              component?.destroy()
              component = null
            },
          }
        },
      }),
    ]
  },
})
