import * as Y from 'yjs'
import type { ComputedRef, Ref } from 'vue'
import type { ColumnItem } from './types'

/** a header fragment is bindable once its first node is the title heading —
 * the column header editor's schema is 'heading block*', so binding anything
 * else would throw at Editor construction */
export function isHeaderDoc(frag: unknown): boolean {
  if (!(frag instanceof Y.XmlFragment)) return false
  const first = frag.get(0)
  return first instanceof Y.XmlElement && first.nodeName === 'heading'
}

export function seedDefaultColumns(columnsMap: Y.Map<Y.Map<any>>) {
  for (const [i, title] of ['To discuss', 'Discussing', 'Discussed'].entries()) {
    const id = genId()
    const col = new Y.Map()
    col.set('id', id)
    col.set('title', title)
    col.set('order', i + 1)
    columnsMap.set(id, col)
  }
}

export function createRoomColumns(opts: {
  doc: Y.Doc
  columnsMap: Y.Map<Y.Map<any>>
  cardsMap: Y.Map<Y.Map<any>>
  columns: Ref<ColumnItem[]>
  isOwner: ComputedRef<boolean>
}) {
  const { doc, columnsMap, cardsMap, columns, isOwner } = opts

  function addColumn(title: string) {
    if (!isOwner.value) return
    const clean = title.trim() || 'Untitled'
    const maxOrder = columns.value.reduce((m, c) => Math.max(m, c.order), 0)
    const id = genId()
    const col = new Y.Map()
    col.set('id', id)
    col.set('title', clean)
    col.set('order', maxOrder + 1)
    columnsMap.set(id, col)
  }

  function renameColumn(id: string, title: string) {
    if (!isOwner.value) return
    const clean = title.trim()
    if (!clean) return
    columnsMap.get(id)?.set('title', clean)
  }

  /** unified column header document (first node = title heading, rest =
   * description); only the host materializes/normalizes the fragment, everyone
   * else binds read-only once it has the heading-first shape */
  function columnDescFragment(columnId: string): Y.XmlFragment | null {
    const col = columnsMap.get(columnId)
    if (!col) return null
    let desc = col.get('desc') as Y.XmlFragment | undefined
    const makeTitleHeading = (): Y.XmlElement => {
      // y-prosemirror stores node attrs raw, so the level must be a number —
      // hence the generic Y.XmlElement (yjs types XmlFragment.insert for string attrs only)
      const h = new Y.XmlElement<{ level: number }>('heading')
      h.setAttribute('level', 3)
      const title = String(col.get('title') || '')
      if (title) h.insert(0, [new Y.XmlText(title)])
      return h as Y.XmlElement
    }
    if (!desc) {
      if (!isOwner.value) return null
      desc = new Y.XmlFragment()
      desc.insert(0, [makeTitleHeading()])
      col.set('desc', desc)
    } else if (!isHeaderDoc(desc)) {
      // fragments written by pre-release dev builds lack the title heading;
      // the host (the doc's only header writer) prepends it, everyone else
      // waits — rebuild() flips hasDesc once the shape is right
      if (!isOwner.value) return null
      desc.insert(0, [makeTitleHeading()])
    }
    return desc
  }

  function resizeColumn(id: string, width: number) {
    if (!isOwner.value) return
    const w = Math.round(Math.min(900, Math.max(300, width)))
    const col = columnsMap.get(id)
    if (col && col.get('width') !== w) col.set('width', w)
  }

  function removeColumn(id: string) {
    if (!isOwner.value) return
    doc.transact(() => {
      columnsMap.delete(id)
      const doomed: string[] = []
      cardsMap.forEach((card, cardId) => {
        if (card.get('columnId') === id) doomed.push(cardId)
      })
      doomed.forEach(cardId => cardsMap.delete(cardId))
    })
  }

  return { addColumn, renameColumn, resizeColumn, removeColumn, columnDescFragment }
}
