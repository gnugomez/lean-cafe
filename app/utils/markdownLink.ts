import { Extension, InputRule } from '@tiptap/core'

/**
 * Markdown-style link input rule: typing `[text](url)` creates a link.
 * Tiptap's Link extension covers autolink and paste, but has no input rule.
 */
export const MarkdownLink = Extension.create({
  name: 'markdownLink',

  addInputRules() {
    const type = this.editor.schema.marks.link
    if (!type) return []
    return [
      new InputRule({
        find: /\[([^\]]+)\]\(([^()\s]+)\)$/,
        handler: ({ state, range, match }) => {
          const [, text, href] = match
          if (!text || !href) return
          state.tr.replaceWith(range.from, range.to, state.schema.text(text, [type.create({ href })]))
        },
      }),
    ]
  },
})
